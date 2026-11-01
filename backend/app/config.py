import os
from dataclasses import dataclass
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BACKEND_DIR / "models"

DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    classifier_path: Path
    label_mapping_path: Path
    preprocessing_path: Path
    landmarker_path: Path
    dataset_path: Path
    confidence_threshold: float
    cors_origins: list[str]
    cors_origin_regex: str | None


def parse_origins(raw: str) -> list[str]:
    origins = [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
    for origin in origins:
        if origin == "*":
            raise ValueError("ISL_CORS_ORIGINS must list exact origins; the '*' wildcard is not allowed.")
        if not origin.startswith(("http://", "https://")):
            raise ValueError(f"CORS origin must start with http:// or https://: {origin}")
    return origins


def load_settings() -> Settings:
    regex = os.getenv("ISL_CORS_ORIGIN_REGEX", "").strip() or None
    confidence_threshold = float(os.getenv("ISL_CONFIDENCE_THRESHOLD", "0.7"))
    if not 0 <= confidence_threshold <= 1:
        raise ValueError("ISL_CONFIDENCE_THRESHOLD must be between 0 and 1.")
    return Settings(
        classifier_path=Path(os.getenv("ISL_MODEL_PATH", MODELS_DIR / "gesture_gru.pt")),
        label_mapping_path=Path(os.getenv("ISL_LABEL_MAPPING_PATH", MODELS_DIR / "gesture_labels.json")),
        preprocessing_path=Path(os.getenv("ISL_PREPROCESSING_PATH", MODELS_DIR / "gesture_preprocessing.json")),
        landmarker_path=Path(os.getenv("HAND_LANDMARKER_PATH", MODELS_DIR / "hand_landmarker.task")),
        dataset_path=Path(os.getenv("ISL_DATASET_PATH", BACKEND_DIR / "data" / "gesture_samples.jsonl")),
        confidence_threshold=confidence_threshold,
        cors_origins=parse_origins(os.getenv("ISL_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)),
        cors_origin_regex=regex,
    )
