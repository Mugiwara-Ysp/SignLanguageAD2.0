import {
  API_BASE_URL,
  BACKEND_URL_CONFIGURED,
  HEALTH_TIMEOUT_MS,
  RECOGNITION_TIMEOUT_MS,
} from '@/config';
import type { RecognitionResponse, RecognitionStatus, ServerHealth } from '@/types/recognition';

const RECOGNITION_STATUSES: readonly RecognitionStatus[] = ['ok', 'no_hand', 'unknown', 'not_configured'];
const GESTURE_WORDS = ['HELLO', 'THANK_YOU', 'YES', 'NO', 'PLEASE'] as const;

export class RecognitionError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function unreachableMessage(): string {
  return `Could not reach the recognition server at ${API_BASE_URL}. Check that the backend is running and that its allowed origins include this site.`;
}

function parseRecognitionResponse(data: unknown): RecognitionResponse {
  if (!isRecord(data) || typeof data.status !== 'string' || typeof data.message !== 'string') {
    throw new RecognitionError('The recognition server sent an unexpected response.');
  }
  if (!RECOGNITION_STATUSES.includes(data.status as RecognitionStatus)) {
    throw new RecognitionError('The recognition server sent an unknown status.');
  }
  if (data.word !== undefined && data.word !== null && typeof data.word !== 'string') {
    throw new RecognitionError('The recognition server sent an unexpected response.');
  }
  if (
    data.confidence !== undefined &&
    data.confidence !== null &&
    (typeof data.confidence !== 'number' ||
      !Number.isFinite(data.confidence) ||
      data.confidence < 0 ||
      data.confidence > 1)
  ) {
    throw new RecognitionError('The recognition server sent an invalid confidence value.');
  }

  const word = typeof data.word === 'string' ? data.word : null;
  const confidence = typeof data.confidence === 'number' ? data.confidence : null;
  if ((data.status === 'ok' && (!word?.trim() || confidence === null)) ||
      (data.status === 'unknown' && (word !== 'UNKNOWN' || confidence === null))) {
    throw new RecognitionError('The recognition server sent an incomplete recognition result.');
  }
  if (data.status === 'ok' && word === 'UNKNOWN') {
    throw new RecognitionError('The recognition server returned UNKNOWN as a recognized gesture.');
  }
  if (data.status === 'ok' && !GESTURE_WORDS.some((gesture) => gesture === word)) {
    throw new RecognitionError('The recognition server returned a label outside the five configured gestures.');
  }

  return {
    status: data.status as RecognitionStatus,
    message: data.message,
    word,
    confidence,
  };
}

async function requestJson(path: string, init: RequestInit = {}, timeoutMs?: number): Promise<unknown> {
  if (!BACKEND_URL_CONFIGURED) {
    throw new RecognitionError('The backend address is not configured. Set VITE_API_URL to the deployed backend URL.');
  }

  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort();
  callerSignal?.addEventListener('abort', abortFromCaller);
  const timer = timeoutMs ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new RecognitionError(
        `The recognition server at ${API_BASE_URL} did not respond within ${Math.round((timeoutMs ?? 0) / 1000)} seconds.`,
      );
    }
    throw new RecognitionError(unreachableMessage());
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    throw new RecognitionError(
      `The recognition server at ${API_BASE_URL} returned an error (HTTP ${response.status}). Check the backend logs.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new RecognitionError('The recognition server sent an unreadable response.');
  }
}

export async function fetchServerHealth(): Promise<ServerHealth> {
  const data = await requestJson('/health', {}, HEALTH_TIMEOUT_MS);
  if (
    !isRecord(data) ||
    data.status !== 'ok' ||
    data.service !== 'signlanguagead1-recognition' ||
    typeof data.version !== 'string' ||
    typeof data.model_configured !== 'boolean' ||
    typeof data.message !== 'string'
  ) {
    throw new RecognitionError(
      `The server at ${API_BASE_URL} responded, but it is not the SignLanguageAD1 recognition backend.`,
    );
  }
  return {
    service: data.service,
    version: data.version,
    modelConfigured: data.model_configured,
    message: data.message,
  };
}

export async function recognizeSequence(frames: string[], signal?: AbortSignal): Promise<RecognitionResponse> {
  if (frames.length !== 12 || frames.some((frame) => !frame)) {
    throw new RecognitionError('Recognition requires exactly 12 valid camera frames.');
  }
  const data = await requestJson('/api/recognize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ frames }),
    signal,
  }, RECOGNITION_TIMEOUT_MS);
  return parseRecognitionResponse(data);
}
