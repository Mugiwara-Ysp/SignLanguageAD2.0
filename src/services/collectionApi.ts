import { API_BASE_URL, BACKEND_URL_CONFIGURED } from '@/config';

export const GESTURE_LABELS = ['HELLO', 'THANK_YOU', 'YES', 'NO', 'PLEASE'] as const;
export type GestureLabel = (typeof GESTURE_LABELS)[number];

export const COLLECTION_SEQUENCE_LENGTH = 12;

export interface CollectionStatus {
  counts: Record<GestureLabel, number>;
  targetSamplesPerLabel: number;
  sessionCount: number;
  totalSamples: number;
  landmarkerConfigured: boolean;
  message: string;
}

export interface HandDetectionResult {
  detected: boolean;
  landmarkCount: number;
  coordinateCount: number;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  if (!BACKEND_URL_CONFIGURED) {
    throw new Error('Set VITE_API_URL to the FastAPI backend address before collecting gesture samples.');
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : null;
      throw new Error(detail ?? `The collection backend returned HTTP ${response.status}.`);
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The collection request timed out. Check the backend and try again.');
    }
    if (error instanceof TypeError) {
      throw new Error(`Could not reach the collection backend at ${API_BASE_URL}. Check the server and CORS settings.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchCollectionStatus(): Promise<CollectionStatus> {
  const payload = await request('/api/collection/status');
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.labels) ||
    payload.labels.length !== GESTURE_LABELS.length ||
    !payload.labels.every((label, index) => label === GESTURE_LABELS[index]) ||
    !isRecord(payload.counts) ||
    payload.target_samples_per_label !== 200 ||
    typeof payload.session_count !== 'number' ||
    !Number.isInteger(payload.session_count) ||
    payload.session_count < 0 ||
    typeof payload.total_samples !== 'number' ||
    !Number.isInteger(payload.total_samples) ||
    payload.total_samples < 0 ||
    typeof payload.landmarker_configured !== 'boolean' ||
    typeof payload.message !== 'string'
  ) {
    throw new Error('The collection backend sent an unexpected status response.');
  }

  const counts: Record<GestureLabel, number> = {
    HELLO: 0,
    THANK_YOU: 0,
    YES: 0,
    NO: 0,
    PLEASE: 0,
  };
  for (const label of GESTURE_LABELS) {
    const count = payload.counts[label];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error('The collection backend sent invalid sample counts.');
    }
    counts[label] = count;
  }
  if (Object.values(counts).reduce((sum, count) => sum + count, 0) !== payload.total_samples) {
    throw new Error('The collection backend sent inconsistent sample counts.');
  }

  return {
    counts,
    targetSamplesPerLabel: payload.target_samples_per_label,
    sessionCount: payload.session_count,
    totalSamples: payload.total_samples,
    landmarkerConfigured: payload.landmarker_configured,
    message: payload.message,
  };
}

export async function saveGestureSequence(
  label: GestureLabel,
  sessionId: string,
  frames: string[],
): Promise<void> {
  if (frames.length !== COLLECTION_SEQUENCE_LENGTH || frames.some((frame) => !frame)) {
    throw new Error(`A real recording must contain ${COLLECTION_SEQUENCE_LENGTH} camera frames.`);
  }
  const payload = await request('/api/collection/samples', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label, session_id: sessionId, frames }),
  });
  if (!isRecord(payload) || payload.status !== 'stored' || payload.label !== label) {
    throw new Error('The collection backend did not confirm that the sample was saved.');
  }
}

export async function detectCurrentFrame(image: string): Promise<HandDetectionResult> {
  const payload = await request('/api/collection/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  if (
    !isRecord(payload) ||
    (payload.status !== 'detected' && payload.status !== 'no_hand') ||
    typeof payload.message !== 'string' ||
    typeof payload.landmark_count !== 'number' ||
    typeof payload.coordinate_count !== 'number' ||
    !Number.isInteger(payload.landmark_count) ||
    !Number.isInteger(payload.coordinate_count)
  ) {
    throw new Error('The collection backend sent an unexpected hand-detection response.');
  }
  if (
    (payload.status === 'detected' && (payload.landmark_count !== 21 || payload.coordinate_count !== 63)) ||
    (payload.status === 'no_hand' && (payload.landmark_count !== 0 || payload.coordinate_count !== 0))
  ) {
    throw new Error('The collection backend returned inconsistent landmark counts.');
  }
  return {
    detected: payload.status === 'detected',
    landmarkCount: payload.landmark_count,
    coordinateCount: payload.coordinate_count,
    message: payload.message,
  };
}
