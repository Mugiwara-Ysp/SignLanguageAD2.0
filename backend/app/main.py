import base64
import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from app.collection import TARGET_SAMPLES_PER_LABEL, GestureDataset
from app.config import load_settings
from app.recognizer import SignRecognizer
from app.schemas import (
    CollectionSampleRequest,
    CollectionSampleResponse,
    CollectionDetectionRequest,
    CollectionDetectionResponse,
    CollectionStatusResponse,
    HealthResponse,
    HandDiagnosticResponse,
    RecognitionResult,
    RecognizeRequest,
)

SERVICE_NAME = "signlanguagead1-recognition"
SERVICE_VERSION = "0.1.0"
logging.basicConfig(level=logging.INFO)
LOGGER = logging.getLogger(__name__)
MAX_DIAGNOSTIC_IMAGE_BYTES = 8_000_000


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI(title="SignLanguageAD1 Recognition API", version=SERVICE_VERSION)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
        max_age=600,
    )
    app.state.recognizer = SignRecognizer(settings)
    app.state.gesture_dataset = GestureDataset(settings.dataset_path)

    @app.get("/health", response_model=HealthResponse)
    def health(request: Request) -> HealthResponse:
        recognizer: SignRecognizer = request.app.state.recognizer
        return HealthResponse(
            status="ok",
            service=SERVICE_NAME,
            version=SERVICE_VERSION,
            model_configured=recognizer.is_configured,
            message=recognizer.status_message,
        )

    @app.post("/api/recognize", response_model=RecognitionResult)
    def recognize(payload: RecognizeRequest, request: Request) -> RecognitionResult:
        recognizer: SignRecognizer = request.app.state.recognizer
        image_frames: list[bytes] = []
        try:
            image_frames = [base64.b64decode(frame, validate=True) for frame in payload.frames]
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Every sequence frame must be valid base64.") from error
        try:
            return recognizer.recognize_sequence(image_frames)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @app.post("/api/diagnostics/hand", response_model=HandDiagnosticResponse)
    async def diagnose_hand_image(request: Request) -> HandDiagnosticResponse:
        recognizer: SignRecognizer = request.app.state.recognizer
        if not recognizer.landmarker_configured:
            raise HTTPException(
                status_code=503,
                detail="Diagnostics require the MediaPipe hand_landmarker.task file.",
            )
        content_type = request.headers.get("content-type", "").split(";", maxsplit=1)[0].strip().lower()
        if not content_type.startswith("image/"):
            raise HTTPException(status_code=415, detail="Upload one image with an image/* Content-Type.")
        image_bytes = await request.body()
        if not image_bytes:
            raise HTTPException(status_code=400, detail="The uploaded image is empty.")
        if len(image_bytes) > MAX_DIAGNOSTIC_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="The uploaded image exceeds the 8 MB diagnostic limit.")
        try:
            width, height, landmarks, landmark_count = recognizer.diagnose_image(image_bytes)
        except ValueError as error:
            LOGGER.warning("hand diagnostic decode failed bytes=%d error=%s", len(image_bytes), error)
            raise HTTPException(status_code=400, detail=str(error)) from error

        detected = landmarks is not None
        LOGGER.info(
            "hand diagnostic decoded=true width=%d height=%d color_space=RGB "
            "hand_detected=%s landmark_count=%d coordinate_count=%d",
            width,
            height,
            detected,
            landmark_count,
            landmarks.size if landmarks is not None else 0,
        )
        return HandDiagnosticResponse(
            status="detected" if detected else "no_hand",
            decoded=True,
            width=width,
            height=height,
            color_space="RGB",
            landmark_count=landmark_count,
            coordinate_count=int(landmarks.size) if landmarks is not None else 0,
            message=(
                "21 hand landmarks / 63 coordinates extracted. No image was saved."
                if detected
                else "Image decoded successfully, but no hand was detected. No image was saved."
            ),
        )

    @app.get("/api/collection/status", response_model=CollectionStatusResponse)
    def collection_status(request: Request) -> CollectionStatusResponse:
        recognizer: SignRecognizer = request.app.state.recognizer
        dataset: GestureDataset = request.app.state.gesture_dataset
        landmarker_message = (
            "MediaPipe hand landmark detection is ready."
            if recognizer.landmarker_configured
            else "Collection is unavailable until the MediaPipe hand_landmarker.task file is installed."
        )
        return CollectionStatusResponse(
            **dataset.status(recognizer.landmarker_configured, landmarker_message)
        )

    @app.post(
        "/api/collection/detect",
        response_model=CollectionDetectionResponse,
    )
    def detect_collection_frame(
        payload: CollectionDetectionRequest,
        request: Request,
    ) -> CollectionDetectionResponse:
        recognizer: SignRecognizer = request.app.state.recognizer
        if not recognizer.landmarker_configured:
            raise HTTPException(
                status_code=503,
                detail="Detection requires the MediaPipe hand_landmarker.task file.",
            )
        try:
            image_bytes = base64.b64decode(payload.image, validate=True)
            landmarks = recognizer.extract_landmarks(image_bytes)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        if landmarks is None:
            return CollectionDetectionResponse(
                status="no_hand",
                message="No hand detected. Keep your hand clearly visible and try again.",
                landmark_count=0,
                coordinate_count=0,
            )
        return CollectionDetectionResponse(
            status="detected",
            message="Hand landmarks detected in this camera frame. No sample was saved.",
            landmark_count=21,
            coordinate_count=int(landmarks.size),
        )

    @app.post(
        "/api/collection/samples",
        response_model=CollectionSampleResponse,
        status_code=201,
    )
    def collect_sample(
        payload: CollectionSampleRequest,
        request: Request,
    ) -> CollectionSampleResponse:
        recognizer: SignRecognizer = request.app.state.recognizer
        dataset: GestureDataset = request.app.state.gesture_dataset
        if not recognizer.landmarker_configured:
            raise HTTPException(
                status_code=503,
                detail="Collection requires the MediaPipe hand_landmarker.task file.",
            )

        features = []
        for frame_index, encoded_frame in enumerate(payload.frames, start=1):
            try:
                image_bytes = base64.b64decode(encoded_frame, validate=True)
                landmarks = recognizer.extract_landmarks(image_bytes)
            except ValueError as error:
                raise HTTPException(
                    status_code=400,
                    detail=f"Frame {frame_index}: {error}",
                ) from error
            if landmarks is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"No hand was detected in frame {frame_index}; no sample was saved. Keep the hand visible and try again.",
                )
            features.append(landmarks)

        counts = dataset.append(payload.label, payload.session_id, features)
        status = dataset.status(recognizer.landmarker_configured, "")
        return CollectionSampleResponse(
            status="stored",
            label=payload.label,
            label_count=counts[payload.label],
            target_samples_per_label=TARGET_SAMPLES_PER_LABEL,
            total_samples=status["total_samples"],
        )

    return app


app = create_app()
