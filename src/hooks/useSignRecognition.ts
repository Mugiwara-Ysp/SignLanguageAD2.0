import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { fetchServerHealth, recognizeSequence, RecognitionError } from '@/services/recognitionApi';
import { captureFrame } from '@/lib/captureFrame';
import { FRAME_INTERVAL_MS, RECOGNITION_SEQUENCE_LENGTH, STABLE_FRAME_COUNT } from '@/config';
import type { RecognitionResponse, RecognitionStatus, ServerHealth } from '@/types/recognition';

export type ServerState = 'checking' | 'online' | 'offline';

export interface LiveResult {
  status: RecognitionStatus;
  word: string | null;
  confidence: number | null;
}

export interface Notice {
  tone: 'warning' | 'error';
  message: string;
}

type HealthCheck = { ok: true; health: ServerHealth } | { ok: false; message: string };

export interface SignRecognition {
  running: boolean;
  starting: boolean;
  live: LiveResult | null;
  serverState: ServerState;
  modelConfigured: boolean | null;
  serverMessage: string;
  notice: Notice | null;
  start: () => Promise<void>;
  stop: () => void;
}

interface SignRecognitionOptions {
  videoRef: RefObject<HTMLVideoElement>;
  cameraActive: boolean;
  onWordConfirmed: (word: string) => void;
}

export function useSignRecognition({
  videoRef,
  cameraActive,
  onWordConfirmed,
}: SignRecognitionOptions): SignRecognition {
  const [requested, setRequested] = useState(false);
  const [starting, setStarting] = useState(false);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [serverState, setServerState] = useState<ServerState>('checking');
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);
  const [serverMessage, setServerMessage] = useState('');

  const running = requested && cameraActive;

  const onWordRef = useRef(onWordConfirmed);
  useEffect(() => {
    onWordRef.current = onWordConfirmed;
  }, [onWordConfirmed]);

  const refreshServerHealth = useCallback(async (): Promise<HealthCheck> => {
    try {
      const health = await fetchServerHealth();
      setServerState('online');
      setModelConfigured(health.modelConfigured);
      setServerMessage(health.message);
      return { ok: true, health };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The recognition server is not reachable.';
      setServerState('offline');
      setModelConfigured(null);
      setServerMessage(message);
      return { ok: false, message };
    }
  }, []);

  useEffect(() => {
    void refreshServerHealth();
  }, [refreshServerHealth]);

  useEffect(() => {
    if (!running) return;

    const controller = new AbortController();
    let timer: number | undefined;
    let candidate: string | null = null;
    let candidateCount = 0;
    let confirmedWord: string | null = null;
    let frames: string[] = [];

    function scheduleNext() {
      timer = window.setTimeout(tick, FRAME_INTERVAL_MS);
    }

    function applyResult(result: RecognitionResponse): boolean {
      setModelConfigured(result.status !== 'not_configured');
      switch (result.status) {
        case 'not_configured': {
          setServerMessage(result.message);
          setNotice({
            tone: 'warning',
            message: result.message || 'The recognition model is not configured.',
          });
          setLive(null);
          return false;
        }
        case 'no_hand':
          candidate = null;
          candidateCount = 0;
          confirmedWord = null;
          setLive({ status: 'no_hand', word: null, confidence: null });
          return true;
        case 'unknown':
          candidate = null;
          candidateCount = 0;
          confirmedWord = null;
          setLive({ status: 'unknown', word: 'UNKNOWN', confidence: result.confidence });
          return true;
        case 'ok': {
          if (result.word === null) return true;
          const word = result.word;
          setLive({ status: 'ok', word, confidence: result.confidence });
          if (word === candidate) {
            candidateCount += 1;
          } else {
            candidate = word;
            candidateCount = 1;
          }
          if (candidateCount >= STABLE_FRAME_COUNT && word !== confirmedWord) {
            confirmedWord = word;
            onWordRef.current(word);
          }
          return true;
        }
      }
    }

    async function tick() {
      const frame = captureFrame(videoRef.current);
      if (!frame) {
        scheduleNext();
        return;
      }
      frames.push(frame);
      if (frames.length < RECOGNITION_SEQUENCE_LENGTH) {
        scheduleNext();
        return;
      }
      const sequence = frames;
      frames = [];

      try {
        const result = await recognizeSequence(sequence, controller.signal);
        if (controller.signal.aborted) return;

        setServerState('online');
        const shouldContinue = applyResult(result);
        if (!shouldContinue) {
          setRequested(false);
          return;
        }
        setNotice(null);
        scheduleNext();
      } catch (error) {
        if (controller.signal.aborted) return;
        setServerState('offline');
        setLive(null);
        setNotice({
          tone: 'error',
          message:
            error instanceof RecognitionError
              ? `${error.message} Press Start Translation to try again.`
              : 'Recognition stopped because of an unexpected error. Press Start Translation to try again.',
        });
        setRequested(false);
      }
    }

    void tick();

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [running, videoRef]);

  const start = useCallback(async () => {
    setStarting(true);
    setNotice(null);
    setLive(null);
    try {
      const check = await refreshServerHealth();
      if (!check.ok || !check.health.modelConfigured) return;
      setRequested(true);
    } finally {
      setStarting(false);
    }
  }, [refreshServerHealth]);

  const stop = useCallback(() => {
    setRequested(false);
    setLive(null);
  }, []);

  return {
    running,
    starting,
    live: running ? live : null,
    serverState,
    modelConfigured,
    serverMessage,
    notice,
    start,
    stop,
  };
}
