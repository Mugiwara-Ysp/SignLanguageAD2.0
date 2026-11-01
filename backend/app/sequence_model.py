import json
import logging
import pickle
from pathlib import Path
from typing import Any, Protocol

import numpy as np
import torch
from torch import nn

from app.collection import FEATURE_COUNT, GESTURE_LABELS, SEQUENCE_LENGTH
from app.schemas import RecognitionResult

LOGGER = logging.getLogger(__name__)
MODEL_FORMAT_VERSION = 1
DEFAULT_MODEL_CONFIG = {"input_size": FEATURE_COUNT, "hidden_size": 64, "num_layers": 1}
PREPROCESSING_CONFIG = {
    "version": 1,
    "sequence_shape": [SEQUENCE_LENGTH, FEATURE_COUNT],
    "landmarks_per_frame": 21,
    "coordinates_per_landmark": 3,
    "normalization": "per-frame wrist-relative XYZ divided by maximum wrist-relative XY landmark radius",
    "missing_landmark_policy": "reject entire sequence; never impute",
}


class LandmarkExtractor(Protocol):
    def extract(self, rgb_image: np.ndarray) -> np.ndarray | None: ...


class MissingHandLandmarksError(ValueError):
    def __init__(self, frame_index: int) -> None:
        super().__init__(f"No hand landmarks were found in sequence frame {frame_index}.")
        self.frame_index = frame_index


def extract_landmark_sequence(
    extractor: LandmarkExtractor,
    rgb_images: list[np.ndarray],
) -> np.ndarray:
    if len(rgb_images) != SEQUENCE_LENGTH:
        raise ValueError(f"Expected exactly {SEQUENCE_LENGTH} camera frames.")
    features: list[np.ndarray] = []
    for frame_index, rgb_image in enumerate(rgb_images, start=1):
        frame_features = extractor.extract(rgb_image)
        if frame_features is None:
            raise MissingHandLandmarksError(frame_index)
        features.append(validate_landmark_sequence_frame(frame_features))
    return np.stack(features).astype(np.float32)


def validate_landmark_sequence_frame(features: Any) -> np.ndarray:
    frame = np.asarray(features, dtype=np.float32)
    if frame.shape != (FEATURE_COUNT,):
        raise ValueError(f"Each frame must contain exactly {FEATURE_COUNT} coordinates.")
    if not np.isfinite(frame).all():
        raise ValueError("Landmark frames must contain only finite coordinates.")
    return frame


class GestureGRU(nn.Module):
    def __init__(
        self,
        input_size: int = FEATURE_COUNT,
        hidden_size: int = DEFAULT_MODEL_CONFIG["hidden_size"],
        num_layers: int = DEFAULT_MODEL_CONFIG["num_layers"],
        num_classes: int = len(GESTURE_LABELS),
    ) -> None:
        super().__init__()
        self.input_size = input_size
        self.hidden_size = hidden_size
        self.num_layers = num_layers
        self.num_classes = num_classes
        self.gru = nn.GRU(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.0,
        )
        self.classifier = nn.Linear(hidden_size, num_classes)

    def forward(self, sequence: torch.Tensor) -> torch.Tensor:
        if sequence.ndim != 3 or tuple(sequence.shape[1:]) != (SEQUENCE_LENGTH, FEATURE_COUNT):
            raise ValueError(f"Expected input shape (batch, {SEQUENCE_LENGTH}, {FEATURE_COUNT}).")
        _, hidden = self.gru(sequence)
        return self.classifier(hidden[-1])


def validate_landmark_sequence(features: Any) -> np.ndarray:
    sequence = np.asarray(features, dtype=np.float32)
    if sequence.shape != (SEQUENCE_LENGTH, FEATURE_COUNT):
        raise ValueError(f"Expected landmark sequence shape ({SEQUENCE_LENGTH}, {FEATURE_COUNT}).")
    if not np.isfinite(sequence).all():
        raise ValueError("Landmark sequences must contain only finite coordinates.")
    return sequence


def predict_sequence(
    model: GestureGRU,
    features: Any,
    labels: list[str],
    confidence_threshold: float,
) -> RecognitionResult:
    if labels != list(GESTURE_LABELS):
        raise ValueError("The classifier label mapping does not match the five supported gestures.")
    if not 0 <= confidence_threshold <= 1:
        raise ValueError("The confidence threshold must be between 0 and 1.")
    sequence = validate_landmark_sequence(features)
    model.eval()
    with torch.inference_mode():
        logits = model(torch.from_numpy(sequence).unsqueeze(0))
        probabilities = torch.softmax(logits[0], dim=0).cpu().numpy()
    if not np.isfinite(probabilities).all():
        raise ValueError("The classifier produced non-finite confidence values.")
    best_index = int(np.argmax(probabilities))
    confidence = float(probabilities[best_index])
    if confidence < confidence_threshold:
        return RecognitionResult(
            status="unknown",
            word="UNKNOWN",
            confidence=confidence,
            message="No configured gesture reached the confidence threshold.",
        )
    return RecognitionResult(
        status="ok",
        word=labels[best_index],
        confidence=confidence,
        message="Gesture classified by the trained five-class model.",
    )


def load_sequence_model(
    model_path: Path,
    label_mapping_path: Path,
    preprocessing_path: Path,
) -> tuple[GestureGRU, list[str]]:
    try:
        checkpoint = torch.load(model_path, map_location="cpu", weights_only=True)
        label_data = json.loads(label_mapping_path.read_text(encoding="utf-8"))
        preprocessing = json.loads(preprocessing_path.read_text(encoding="utf-8"))
    except (
        OSError,
        RuntimeError,
        json.JSONDecodeError,
        TypeError,
        AttributeError,
        UnicodeError,
        pickle.UnpicklingError,
    ) as error:
        raise ValueError(f"model artifacts could not be loaded ({error})") from error

    if not isinstance(checkpoint, dict) or checkpoint.get("format_version") != MODEL_FORMAT_VERSION:
        raise ValueError("the sequence model artifact has an unsupported format")
    model_config = checkpoint.get("model_config")
    hidden_size = model_config.get("hidden_size") if isinstance(model_config, dict) else None
    num_layers = model_config.get("num_layers") if isinstance(model_config, dict) else None
    if (
        not isinstance(model_config, dict)
        or model_config.get("input_size") != FEATURE_COUNT
        or type(hidden_size) is not int
        or not 1 <= hidden_size <= 512
        or type(num_layers) is not int
        or num_layers != 1
    ):
        raise ValueError("the sequence model artifact has an invalid architecture configuration")
    if not isinstance(label_data, dict):
        raise ValueError("the saved label mapping is invalid")
    labels = label_data.get("labels")
    mapping = label_data.get("label_to_index")
    expected_mapping = {label: index for index, label in enumerate(GESTURE_LABELS)}
    if (
        labels != list(GESTURE_LABELS)
        or not isinstance(mapping, dict)
        or any(type(mapping.get(label)) is not int for label in GESTURE_LABELS)
        or mapping != expected_mapping
    ):
        raise ValueError("the saved label mapping does not match the five supported gestures")
    if preprocessing != PREPROCESSING_CONFIG:
        raise ValueError("the saved preprocessing configuration is incompatible")

    try:
        model = GestureGRU(
            input_size=model_config["input_size"],
            hidden_size=model_config["hidden_size"],
            num_layers=model_config["num_layers"],
            num_classes=len(labels),
        )
        model.load_state_dict(checkpoint["state_dict"], strict=True)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise ValueError(f"the sequence model weights are invalid ({error})") from error
    if any(not torch.isfinite(parameter).all() for parameter in model.parameters()):
        raise ValueError("the sequence model contains non-finite weights")
    model.eval()
    LOGGER.info("Loaded five-class GRU model from %s", model_path)
    return model, labels
