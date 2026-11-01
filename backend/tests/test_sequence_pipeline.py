import json
import io
import tempfile
import unittest
from pathlib import Path
from uuid import uuid4

import numpy as np
import torch
from pydantic import ValidationError
from PIL import Image

from app.collection import GESTURE_LABELS
from app.landmarks import decode_image
from app.schemas import RecognizeRequest
from app.sequence_model import (
    GestureGRU,
    MissingHandLandmarksError,
    PREPROCESSING_CONFIG,
    extract_landmark_sequence,
    load_sequence_model,
    predict_sequence,
    validate_landmark_sequence,
)
from app.training import (
    DatasetValidationError,
    InsufficientSessionsError,
    TrainingData,
    load_training_data,
    make_grouped_splits,
    make_stratified_pilot_splits,
)


class StubExtractor:
    def __init__(self, missing_frame: int | None = None) -> None:
        self._missing_frame = missing_frame
        self._index = 0

    def extract(self, image: np.ndarray) -> np.ndarray | None:
        self._index += 1
        if self._index == self._missing_frame:
            return None
        return np.zeros(63, dtype=np.float32)


class SequencePipelineTests(unittest.TestCase):
    def test_jpeg_decode_returns_rgb_with_original_dimensions(self) -> None:
        image = Image.new("RGB", (37, 19), (240, 20, 10))
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=100, subsampling=0)

        decoded = decode_image(output.getvalue())

        self.assertEqual(decoded.shape, (19, 37, 3))
        self.assertEqual(decoded.dtype, np.uint8)
        self.assertGreater(int(decoded[9, 18, 0]), int(decoded[9, 18, 2]))

    def test_image_decode_rejects_non_image_bytes(self) -> None:
        with self.assertRaisesRegex(ValueError, "could not be decoded"):
            decode_image(b"not an image")

    def test_valid_sequence_shape(self) -> None:
        sequence = validate_landmark_sequence(np.zeros((12, 63), dtype=np.float32))
        self.assertEqual(sequence.shape, (12, 63))

    def test_invalid_sequence_shape_and_nonfinite_values(self) -> None:
        with self.assertRaisesRegex(ValueError, "shape"):
            validate_landmark_sequence(np.zeros((11, 63), dtype=np.float32))
        invalid = np.zeros((12, 63), dtype=np.float32)
        invalid[0, 0] = np.nan
        with self.assertRaisesRegex(ValueError, "finite"):
            validate_landmark_sequence(invalid)

    def test_missing_hand_landmarks_reject_entire_sequence(self) -> None:
        with self.assertRaises(MissingHandLandmarksError) as error:
            extract_landmark_sequence(
                StubExtractor(missing_frame=4),
                [np.zeros((2, 2, 3), dtype=np.uint8) for _ in range(12)],
            )
        self.assertEqual(error.exception.frame_index, 4)

    def test_prediction_returns_one_of_the_five_labels(self) -> None:
        model = GestureGRU()
        for parameter in model.parameters():
            torch.nn.init.zeros_(parameter)
        model.classifier.bias.data[2] = 5.0
        result = predict_sequence(model, np.zeros((12, 63)), list(GESTURE_LABELS), 0.1)
        self.assertEqual(result.status, "ok")
        self.assertEqual(result.word, "YES")
        self.assertGreaterEqual(result.confidence or 0, 0.1)

    def test_low_confidence_returns_unknown(self) -> None:
        model = GestureGRU()
        for parameter in model.parameters():
            torch.nn.init.zeros_(parameter)
        result = predict_sequence(model, np.zeros((12, 63)), list(GESTURE_LABELS), 0.3)
        self.assertEqual(result.status, "unknown")
        self.assertEqual(result.word, "UNKNOWN")
        self.assertAlmostEqual(result.confidence or 0, 0.2, places=6)

    def test_saved_artifacts_load_with_fixed_five_label_mapping(self) -> None:
        model = GestureGRU()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model_path = root / "model.pt"
            labels_path = root / "labels.json"
            preprocessing_path = root / "preprocessing.json"
            torch.save(
                {
                    "format_version": 1,
                    "model_config": {
                        "input_size": 63,
                        "hidden_size": 64,
                        "num_layers": 1,
                    },
                    "state_dict": model.state_dict(),
                },
                model_path,
            )
            labels_path.write_text(
                json.dumps({
                    "labels": list(GESTURE_LABELS),
                    "label_to_index": {label: index for index, label in enumerate(GESTURE_LABELS)},
                }),
                encoding="utf-8",
            )
            preprocessing_path.write_text(json.dumps(PREPROCESSING_CONFIG), encoding="utf-8")
            loaded, labels = load_sequence_model(model_path, labels_path, preprocessing_path)
            self.assertEqual(labels, list(GESTURE_LABELS))
            self.assertEqual(loaded.num_classes, 5)

    def test_recognition_request_requires_exactly_twelve_frames(self) -> None:
        with self.assertRaises(ValidationError):
            RecognizeRequest(frames=["a"] * 11)
        request = RecognizeRequest(frames=["a"] * 12)
        self.assertEqual(len(request.frames), 12)

    def test_dataset_loader_rejects_bad_frame_coordinates(self) -> None:
        malformed = {
            "schema_version": 1,
            "label": "HELLO",
            "session_id": str(uuid4()),
            "recorded_at": "2026-11-01T10:00:00+00:00",
            "frames": [[0.0] * 62 for _ in range(12)],
        }
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory) / "invalid.jsonl"
            dataset.write_text(json.dumps(malformed) + "\n", encoding="utf-8")
            with self.assertRaisesRegex(DatasetValidationError, "63"):
                load_training_data(dataset)

    def test_group_split_refuses_one_recording_session(self) -> None:
        labels = np.asarray(GESTURE_LABELS, dtype=str)
        data = TrainingData(
            features=np.zeros((len(labels), 12, 63), dtype=np.float32),
            labels=labels,
            sessions=np.asarray(["one-session"] * len(labels), dtype=str),
        )
        with self.assertRaisesRegex(InsufficientSessionsError, "at least 3"):
            make_grouped_splits(data)

    def test_group_split_keeps_sessions_disjoint(self) -> None:
        labels = np.asarray(GESTURE_LABELS * 3, dtype=str)
        sessions = np.repeat(["session-a", "session-b", "session-c"], len(GESTURE_LABELS))
        data = TrainingData(
            features=np.zeros((len(labels), 12, 63), dtype=np.float32),
            labels=labels,
            sessions=sessions,
        )
        splits = make_grouped_splits(data)
        train_sessions = set(sessions[splits.train])
        validation_sessions = set(sessions[splits.validation])
        test_sessions = set(sessions[splits.test])
        self.assertFalse(train_sessions & validation_sessions)
        self.assertFalse(train_sessions & test_sessions)
        self.assertFalse(validation_sessions & test_sessions)

    def test_stratified_pilot_split_contains_each_label(self) -> None:
        labels = np.asarray(
            [label for label, count in zip(GESTURE_LABELS, (15, 15, 14, 16, 19)) for _ in range(count)],
            dtype=str,
        )
        data = TrainingData(
            features=np.zeros((len(labels), 12, 63), dtype=np.float32),
            labels=labels,
            sessions=np.asarray(["same-session"] * len(labels), dtype=str),
        )
        splits = make_stratified_pilot_splits(data, seed=42)
        for indices in (splits.train, splits.validation, splits.test):
            self.assertEqual(set(data.labels[indices]), set(GESTURE_LABELS))
        self.assertEqual(len(splits.train) + len(splits.validation) + len(splits.test), 79)
        self.assertEqual(set(data.sessions[splits.test]), {"same-session"})


if __name__ == "__main__":
    unittest.main()
