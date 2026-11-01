export const API_BASE_URL = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '') ?? '';

export const BACKEND_URL_CONFIGURED = API_BASE_URL.length > 0;

export const HEALTH_TIMEOUT_MS = 5000;

export const RECOGNITION_TIMEOUT_MS = 15000;

export const FRAME_INTERVAL_MS = 120;

export const RECOGNITION_SEQUENCE_LENGTH = 12;

export const STABLE_FRAME_COUNT = 3;

export const CAPTURE_MAX_WIDTH = 640;

export const JPEG_QUALITY = 0.8;
