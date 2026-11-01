import io
import threading
from pathlib import Path

import numpy as np
from PIL import Image, UnidentifiedImageError

LANDMARK_COUNT = 21
MAX_IMAGE_PIXELS = 16_000_000


def decode_image(image_bytes: bytes) -> np.ndarray:
    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("The image is too large to process.")
            rgb = image.convert("RGB")
    except (UnidentifiedImageError, OSError) as error:
        raise ValueError("The image could not be decoded.") from error
    return np.ascontiguousarray(np.asarray(rgb, dtype=np.uint8))


def normalize_landmarks(points: np.ndarray) -> np.ndarray:
    # Wrist-relative, scale-normalized coordinates make features independent of hand position and camera distance.
    relative = points - points[0]
    scale = float(np.max(np.linalg.norm(relative[:, :2], axis=1)))
    if scale == 0.0:
        scale = 1.0
    return (relative / scale).astype(np.float32).flatten()


class HandLandmarkExtractor:
    def __init__(self, model_path: Path) -> None:
        import mediapipe as mp
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision

        options = vision.HandLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.IMAGE,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
        )
        self._mp = mp
        self._landmarker = vision.HandLandmarker.create_from_options(options)
        self._lock = threading.Lock()

    def detect(self, rgb_image: np.ndarray) -> tuple[np.ndarray | None, int]:
        mp_image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb_image)
        with self._lock:
            result = self._landmarker.detect(mp_image)
        if not result.hand_landmarks:
            return None, 0
        landmark_count = len(result.hand_landmarks[0])
        if landmark_count != LANDMARK_COUNT:
            return None, landmark_count
        points = np.array(
            [[landmark.x, landmark.y, landmark.z] for landmark in result.hand_landmarks[0]],
            dtype=np.float32,
        )
        if points.shape != (LANDMARK_COUNT, 3):
            return None, landmark_count
        return normalize_landmarks(points), landmark_count

    def extract(self, rgb_image: np.ndarray) -> np.ndarray | None:
        features, _ = self.detect(rgb_image)
        return features
