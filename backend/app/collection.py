import json
import math
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import numpy as np

GESTURE_LABELS = ("HELLO", "THANK_YOU", "YES", "NO", "PLEASE")
TARGET_SAMPLES_PER_LABEL = 200
SEQUENCE_LENGTH = 12
FEATURE_COUNT = 63


class GestureDataset:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.Lock()
        self._counts: dict[str, int] | None = None
        self._sessions: set[str] = set()
        self._total = 0

    def _load_counts(self) -> None:
        if self._counts is not None:
            return
        counts = {label: 0 for label in GESTURE_LABELS}
        sessions: set[str] = set()
        total = 0
        if self._path.exists():
            with self._path.open("r", encoding="utf-8") as dataset_file:
                for line_number, line in enumerate(dataset_file, start=1):
                    try:
                        sample = json.loads(line)
                    except json.JSONDecodeError as error:
                        raise RuntimeError(f"Dataset file is invalid at line {line_number}.") from error
                    if not isinstance(sample, dict):
                        raise RuntimeError(f"Dataset file has an invalid record at line {line_number}.")
                    label = sample.get("label")
                    session_id = sample.get("session_id")
                    frames = sample.get("frames")
                    if (
                        sample.get("schema_version") != 1
                        or not isinstance(label, str)
                        or label not in counts
                        or not isinstance(session_id, str)
                        or not isinstance(frames, list)
                        or len(frames) != SEQUENCE_LENGTH
                        or any(
                            not isinstance(frame, list)
                            or len(frame) != FEATURE_COUNT
                            or any(
                                isinstance(value, bool)
                                or not isinstance(value, (int, float))
                                or not math.isfinite(value)
                                for value in frame
                            )
                            for frame in frames
                        )
                    ):
                        raise RuntimeError(f"Dataset file has an invalid record at line {line_number}.")
                    counts[label] += 1
                    sessions.add(session_id)
                    total += 1
        self._counts = counts
        self._sessions = sessions
        self._total = total

    def status(self, landmarker_configured: bool, message: str) -> dict[str, Any]:
        with self._lock:
            self._load_counts()
            counts = dict(self._counts or {})
            session_count = len(self._sessions)
            total = self._total
        return {
            "labels": list(GESTURE_LABELS),
            "target_samples_per_label": TARGET_SAMPLES_PER_LABEL,
            "counts": counts,
            "session_count": session_count,
            "total_samples": total,
            "landmarker_configured": landmarker_configured,
            "message": message,
        }

    def append(
        self,
        label: str,
        session_id: UUID,
        frames: list[np.ndarray],
    ) -> dict[str, int]:
        if label not in GESTURE_LABELS:
            raise ValueError("The gesture label is not supported.")
        if len(frames) != SEQUENCE_LENGTH:
            raise ValueError(f"A recording must contain exactly {SEQUENCE_LENGTH} frames.")
        if any(
            frame.shape != (FEATURE_COUNT,) or not np.isfinite(frame).all()
            for frame in frames
        ):
            raise ValueError("A recording contains invalid landmark features.")

        sample = {
            "schema_version": 1,
            "label": label,
            "session_id": str(session_id),
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "frames": [frame.astype(float).tolist() for frame in frames],
        }
        with self._lock:
            self._load_counts()
            self._path.parent.mkdir(parents=True, exist_ok=True)
            with self._path.open("a", encoding="utf-8", newline="\n") as dataset_file:
                dataset_file.write(json.dumps(sample, separators=(",", ":"), allow_nan=False) + "\n")
                dataset_file.flush()
            if self._counts is None:
                raise RuntimeError("Dataset counters were not initialized.")
            self._counts[label] += 1
            self._sessions.add(str(session_id))
            self._total += 1
            return dict(self._counts)
