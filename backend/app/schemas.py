from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

MAX_COLLECTION_IMAGE_BASE64_CHARS = 100_000
MAX_RECOGNITION_FRAME_BASE64_CHARS = 300_000
COLLECTION_SEQUENCE_LENGTH = 12

GestureLabel = Literal["HELLO", "THANK_YOU", "YES", "NO", "PLEASE"]
CollectionFrame = Annotated[str, Field(min_length=1, max_length=MAX_COLLECTION_IMAGE_BASE64_CHARS)]
RecognitionFrame = Annotated[str, Field(min_length=1, max_length=MAX_RECOGNITION_FRAME_BASE64_CHARS)]


class RecognizeRequest(BaseModel):
    frames: list[RecognitionFrame] = Field(
        min_length=COLLECTION_SEQUENCE_LENGTH,
        max_length=COLLECTION_SEQUENCE_LENGTH,
        description="Ordered camera frames for one 12-frame gesture sequence",
    )


class RecognitionResult(BaseModel):
    status: Literal["ok", "no_hand", "unknown", "not_configured"]
    message: str
    word: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str
    model_configured: bool
    message: str


class CollectionSampleRequest(BaseModel):
    label: GestureLabel
    session_id: UUID
    frames: list[CollectionFrame] = Field(
        min_length=COLLECTION_SEQUENCE_LENGTH,
        max_length=COLLECTION_SEQUENCE_LENGTH,
        description="Ordered JPEG frames from one real gesture recording",
    )


class CollectionDetectionRequest(BaseModel):
    image: CollectionFrame


class CollectionDetectionResponse(BaseModel):
    status: Literal["detected", "no_hand"]
    message: str
    landmark_count: int = Field(ge=0, le=21)
    coordinate_count: int = Field(ge=0, le=63)


class HandDiagnosticResponse(BaseModel):
    status: Literal["detected", "no_hand"]
    decoded: bool
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    color_space: Literal["RGB"]
    landmark_count: int = Field(ge=0, le=21)
    coordinate_count: int = Field(ge=0, le=63)
    message: str


class CollectionStatusResponse(BaseModel):
    labels: list[GestureLabel]
    target_samples_per_label: int
    counts: dict[GestureLabel, int]
    session_count: int
    total_samples: int
    landmarker_configured: bool
    message: str


class CollectionSampleResponse(BaseModel):
    status: Literal["stored"]
    label: GestureLabel
    label_count: int
    target_samples_per_label: int
    total_samples: int
