import hashlib
import json
import math
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import numpy as np
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedGroupKFold, train_test_split

from app.collection import FEATURE_COUNT, GESTURE_LABELS, SEQUENCE_LENGTH
REQUIRED_FIELDS = {"schema_version", "label", "session_id", "recorded_at", "frames"}


class DatasetValidationError(ValueError):
    pass


class InsufficientSessionsError(ValueError):
    pass


@dataclass(frozen=True)
class TrainingData:
    features: np.ndarray
    labels: np.ndarray
    sessions: np.ndarray


@dataclass(frozen=True)
class DatasetSplits:
    train: np.ndarray
    validation: np.ndarray
    test: np.ndarray


def load_training_data(path: Path) -> TrainingData:
    if not path.is_file():
        raise DatasetValidationError(f"Dataset file does not exist: {path}")

    features: list[list[list[float]]] = []
    labels: list[str] = []
    sessions: list[str] = []
    seen_samples: set[str] = set()
    with path.open("r", encoding="utf-8") as dataset_file:
        for line_number, raw_line in enumerate(dataset_file, start=1):
            if not raw_line.strip():
                raise DatasetValidationError(f"Line {line_number} is empty.")
            try:
                record: Any = json.loads(raw_line)
            except json.JSONDecodeError as error:
                raise DatasetValidationError(f"Line {line_number} is invalid JSON.") from error
            if not isinstance(record, dict) or set(record) != REQUIRED_FIELDS:
                raise DatasetValidationError(f"Line {line_number} has missing or unexpected fields.")
            label = record["label"]
            if label not in GESTURE_LABELS:
                raise DatasetValidationError(f"Line {line_number} has unsupported label {label!r}.")
            if type(record["schema_version"]) is not int or record["schema_version"] != 1:
                raise DatasetValidationError(f"Line {line_number} has an unsupported schema version.")
            try:
                session_id = str(UUID(record["session_id"]))
            except (ValueError, TypeError, AttributeError) as error:
                raise DatasetValidationError(f"Line {line_number} has an invalid session ID.") from error
            if not isinstance(record["recorded_at"], str):
                raise DatasetValidationError(f"Line {line_number} has an invalid recording timestamp.")
            try:
                datetime.fromisoformat(record["recorded_at"].replace("Z", "+00:00"))
            except ValueError as error:
                raise DatasetValidationError(f"Line {line_number} has an invalid recording timestamp.") from error
            raw_frames = record["frames"]
            if not isinstance(raw_frames, list) or len(raw_frames) != SEQUENCE_LENGTH:
                raise DatasetValidationError(
                    f"Line {line_number} must have shape ({SEQUENCE_LENGTH}, {FEATURE_COUNT})."
                )
            for frame_index, frame in enumerate(raw_frames, start=1):
                if (
                    not isinstance(frame, list)
                    or len(frame) != FEATURE_COUNT
                    or any(
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or not math.isfinite(value)
                        for value in frame
                    )
                ):
                    raise DatasetValidationError(
                        f"Line {line_number}, frame {frame_index} must contain exactly {FEATURE_COUNT} finite numeric values."
                    )
            try:
                frames = np.asarray(raw_frames, dtype=np.float64)
            except (TypeError, ValueError) as error:
                raise DatasetValidationError(f"Line {line_number} has non-numeric landmark values.") from error
            if not np.isfinite(frames).all():
                raise DatasetValidationError(f"Line {line_number} has non-finite landmark values.")
            frames_float32 = frames.astype(np.float32)
            if not np.isfinite(frames_float32).all():
                raise DatasetValidationError(f"Line {line_number} has coordinates outside the model's numeric range.")
            fingerprint = hashlib.sha256(
                json.dumps(record["frames"], separators=(",", ":"), allow_nan=False).encode("utf-8")
            ).hexdigest()
            if fingerprint in seen_samples:
                raise DatasetValidationError(f"Line {line_number} duplicates an existing landmark sequence.")
            seen_samples.add(fingerprint)
            features.append(frames_float32.tolist())
            labels.append(label)
            sessions.append(session_id)

    if not features:
        raise DatasetValidationError("Dataset contains no samples.")
    missing_labels = sorted(set(GESTURE_LABELS).difference(labels))
    if missing_labels:
        raise DatasetValidationError(f"Dataset is missing required gesture labels: {', '.join(missing_labels)}.")
    return TrainingData(
        features=np.asarray(features, dtype=np.float32),
        labels=np.asarray(labels, dtype=str),
        sessions=np.asarray(sessions, dtype=str),
    )


def make_grouped_splits(data: TrainingData, seed: int = 42) -> DatasetSplits:
    session_ids = np.unique(data.sessions)
    if len(session_ids) < 3:
        raise InsufficientSessionsError(
            f"Need at least 3 independent recording sessions for disjoint train, validation, and test sets; "
            f"found {len(session_ids)}. Record all five labels in at least three distinct sessions."
        )

    all_labels = set(GESTURE_LABELS)
    splitter = StratifiedGroupKFold(n_splits=3, shuffle=True, random_state=seed)
    candidates: list[tuple[float, DatasetSplits]] = []
    try:
        folds = [test_indices for _, test_indices in splitter.split(data.features, data.labels, data.sessions)]
    except ValueError as error:
        raise InsufficientSessionsError(f"Could not create session-grouped folds: {error}") from error

    for test_fold in range(3):
        for validation_fold in range(3):
            if validation_fold == test_fold:
                continue
            train_fold = next(fold for fold in range(3) if fold not in (test_fold, validation_fold))
            train_indices = folds[train_fold]
            validation_indices = folds[validation_fold]
            test_indices = folds[test_fold]
            partitions = (train_indices, validation_indices, test_indices)
            partition_labels = [set(data.labels[indices]) for indices in partitions]
            if any(labels != all_labels for labels in partition_labels):
                continue
            score = sum(
                abs(len(indices) / len(data.labels) - target)
                for indices, target in zip(partitions, (0.6, 0.2, 0.2))
            )
            candidates.append(
                (
                    score,
                    DatasetSplits(
                        train=train_indices,
                        validation=validation_indices,
                        test=test_indices,
                    ),
                )
            )

    if not candidates:
        raise InsufficientSessionsError(
            "Three disjoint session folds could not each include all five labels. "
            "Collect every label across at least three recording sessions before training or evaluation."
        )
    return min(candidates, key=lambda candidate: candidate[0])[1]


def make_stratified_pilot_splits(data: TrainingData, seed: int = 42) -> DatasetSplits:
    """Create stratified random splits for explicitly labeled same-session pilot evaluation."""
    indices = np.arange(len(data.labels))
    try:
        development_indices, test_indices = train_test_split(
            indices,
            test_size=0.2,
            random_state=seed,
            stratify=data.labels,
        )
        train_indices, validation_indices = train_test_split(
            development_indices,
            test_size=0.25,
            random_state=seed,
            stratify=data.labels[development_indices],
        )
    except ValueError as error:
        raise InsufficientSessionsError(
            f"Cannot create stratified pilot train/validation/test splits from these class counts: {error}"
        ) from error

    all_labels = set(GESTURE_LABELS)
    if any(
        set(data.labels[split]) != all_labels
        for split in (train_indices, validation_indices, test_indices)
    ):
        raise InsufficientSessionsError(
            "The stratified pilot split does not include every gesture in all partitions. "
            "Collect more genuine samples for the missing classes."
        )
    return DatasetSplits(
        train=train_indices,
        validation=validation_indices,
        test=test_indices,
    )


def evaluate_predictions(actual: np.ndarray, predicted: np.ndarray) -> dict[str, Any]:
    labels = list(GESTURE_LABELS)
    return {
        "labels": labels,
        "confusion_matrix": confusion_matrix(actual, predicted, labels=labels).tolist(),
        "per_class": classification_report(
            actual,
            predicted,
            labels=labels,
            output_dict=True,
            zero_division=0,
        ),
        "accuracy": float(np.mean(actual == predicted)),
    }


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(payload, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temporary_path.replace(path)
