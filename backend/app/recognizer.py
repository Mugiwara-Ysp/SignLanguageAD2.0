import logging

import numpy as np

from app.config import Settings
from app.landmarks import HandLandmarkExtractor, decode_image
from app.sequence_model import (
    GestureGRU,
    MissingHandLandmarksError,
    load_sequence_model,
    predict_sequence,
    validate_landmark_sequence_frame,
)
from app.schemas import RecognitionResult

LOGGER = logging.getLogger(__name__)


class SignRecognizer:
    def __init__(self, settings: Settings) -> None:
        self._threshold = settings.confidence_threshold
        self._classifier: GestureGRU | None = None
        self._labels: list[str] | None = None
        self._extractor: HandLandmarkExtractor | None = None
        problems: list[str] = []

        if settings.classifier_path.is_file():
            try:
                self._classifier, self._labels = load_sequence_model(
                    settings.classifier_path,
                    settings.label_mapping_path,
                    settings.preprocessing_path,
                )
            except ValueError as error:
                problems.append(f"the trained sequence model could not be loaded ({error})")
        else:
            problems.append(f"no trained GRU model file was found at {settings.classifier_path}")

        if settings.landmarker_path.is_file():
            try:
                self._extractor = HandLandmarkExtractor(settings.landmarker_path)
            except Exception as error:
                problems.append(f"the MediaPipe hand landmarker could not be loaded ({error})")
        else:
            problems.append(f"the MediaPipe hand landmarker file was not found at {settings.landmarker_path}")

        self._problems = problems

    @property
    def is_configured(self) -> bool:
        return not self._problems

    @property
    def status_message(self) -> str:
        if self.is_configured:
            return "Recognition model is loaded and ready."
        return "Recognition model is not configured: " + "; ".join(self._problems) + "."

    @property
    def landmarker_configured(self) -> bool:
        return self._extractor is not None

    def extract_landmarks(self, image_bytes: bytes) -> np.ndarray | None:
        _, _, landmarks, _ = self.diagnose_image(image_bytes)
        return landmarks

    def diagnose_image(self, image_bytes: bytes) -> tuple[int, int, np.ndarray | None, int]:
        if self._extractor is None:
            raise RuntimeError("The MediaPipe hand landmarker is not configured.")
        rgb_image = decode_image(image_bytes)
        landmarks, landmark_count = self._extractor.detect(rgb_image)
        return rgb_image.shape[1], rgb_image.shape[0], landmarks, landmark_count

    def recognize_sequence(self, image_bytes: list[bytes]) -> RecognitionResult:
        if len(image_bytes) != 12:
            raise ValueError("Recognition requires exactly 12 ordered image frames.")
        if not self.is_configured or self._extractor is None or self._classifier is None:
            return RecognitionResult(status="not_configured", message=self.status_message)

        features: list[np.ndarray] = []
        first_missing_frame: int | None = None
        for frame_index, frame_bytes in enumerate(image_bytes, start=1):
            try:
                width, height, landmarks, landmark_count = self.diagnose_image(frame_bytes)
            except ValueError:
                LOGGER.exception(
                    "recognition frame=%d/%d decoded=false bytes=%d",
                    frame_index,
                    len(image_bytes),
                    len(frame_bytes),
                )
                raise
            LOGGER.info(
                "recognition frame=%d/%d decoded=true width=%d height=%d color_space=RGB "
                "hand_detected=%s landmark_count=%d coordinate_count=%d",
                frame_index,
                len(image_bytes),
                width,
                height,
                landmarks is not None,
                landmark_count,
                landmarks.size if landmarks is not None else 0,
            )
            if landmarks is None:
                if first_missing_frame is None:
                    first_missing_frame = frame_index
                continue
            features.append(validate_landmark_sequence_frame(landmarks))
        if first_missing_frame is not None:
            return RecognitionResult(
                status="no_hand",
                message=f"No hand detected in frame {first_missing_frame} of the sequence.",
            )
        feature_sequence = np.stack(features).astype(np.float32)
        if self._labels is None:
            return RecognitionResult(status="not_configured", message=self.status_message)
        if feature_sequence.shape != (12, 63):
            raise ValueError("The detected sequence must contain exactly 12 frames of 63 coordinates.")
        LOGGER.info(
            "recognition sequence ready frames=%d landmarks_per_frame=21 coordinates_per_frame=63",
            feature_sequence.shape[0],
        )
        return predict_sequence(self._classifier, feature_sequence, self._labels, self._threshold)
