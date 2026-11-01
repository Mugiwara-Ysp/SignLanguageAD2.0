import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Activity, Database, RefreshCw, ScanSearch, Video } from 'lucide-react';
import { captureGestureFrame } from '@/lib/captureGestureFrame';
import {
  COLLECTION_SEQUENCE_LENGTH,
  detectCurrentFrame,
  fetchCollectionStatus,
  GESTURE_LABELS,
  saveGestureSequence,
  type CollectionStatus,
  type GestureLabel,
} from '@/services/collectionApi';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface GestureCollectionPanelProps {
  videoRef: RefObject<HTMLVideoElement>;
  cameraActive: boolean;
}

const CAPTURE_INTERVAL_MS = 120;
const TARGET_SAMPLES = 200;

const GESTURE_GUIDANCE: Record<GestureLabel, string> = {
  HELLO: 'Perform this sign naturally: hold its pose if it is static, or complete its full movement smoothly.',
  THANK_YOU: 'Perform this sign naturally: hold its pose if it is static, or complete its full movement smoothly.',
  YES: 'Perform this sign naturally: hold its pose if it is static, or complete its full movement smoothly.',
  NO: 'Perform this sign naturally: hold its pose if it is static, or complete its full movement smoothly.',
  PLEASE: 'Perform this sign naturally: hold its pose if it is static, or complete its full movement smoothly.',
};

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isGestureLabel(value: string): value is GestureLabel {
  return GESTURE_LABELS.some((label) => label === value);
}

export function GestureCollectionPanel({ videoRef, cameraActive }: GestureCollectionPanelProps) {
  const [selectedLabel, setSelectedLabel] = useState<GestureLabel>(GESTURE_LABELS[0]);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<CollectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [recording, setRecording] = useState(false);
  const [checkingHand, setCheckingHand] = useState(false);
  const [handCheck, setHandCheck] = useState<{ detected: boolean; message: string } | null>(null);
  const [frameProgress, setFrameProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await fetchCollectionStatus();
      if (mountedRef.current) setStatus(nextStatus);
    } catch (requestError) {
      if (mountedRef.current) {
        setError(requestError instanceof Error ? requestError.message : 'Could not load collection status.');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refreshStatus();
    return () => {
      mountedRef.current = false;
      recordingRef.current = false;
    };
  }, [refreshStatus]);

  async function collectSample() {
    if (recordingRef.current || !cameraActive || !status?.landmarkerConfigured) return;
    recordingRef.current = true;
    setRecording(true);
    setFrameProgress(0);
    setError(null);
    try {
      const frames: string[] = [];
      for (let index = 0; index < COLLECTION_SEQUENCE_LENGTH; index += 1) {
        if (!recordingRef.current) throw new Error('Recording was cancelled.');
        frames.push(captureGestureFrame(videoRef.current));
        setFrameProgress(index + 1);
        if (index < COLLECTION_SEQUENCE_LENGTH - 1) await wait(CAPTURE_INTERVAL_MS);
      }
      await saveGestureSequence(selectedLabel, sessionId, frames);
      await refreshStatus();
    } catch (captureError) {
      if (mountedRef.current) {
        setError(captureError instanceof Error ? captureError.message : 'The sample could not be saved.');
      }
    } finally {
      recordingRef.current = false;
      if (mountedRef.current) {
        setRecording(false);
        setFrameProgress(0);
      }
    }
  }

  async function checkCurrentFrame() {
    if (checkingHand || recording || !cameraActive || !status?.landmarkerConfigured) return;
    setCheckingHand(true);
    setError(null);
    setHandCheck(null);
    try {
      const result = await detectCurrentFrame(captureGestureFrame(videoRef.current));
      if (mountedRef.current) {
        setHandCheck({
          detected: result.detected,
          message: result.detected
            ? `${result.message} ${result.landmarkCount} landmarks, ${result.coordinateCount} coordinate values.`
            : result.message,
        });
      }
    } catch (detectionError) {
      if (mountedRef.current) {
        setError(detectionError instanceof Error ? detectionError.message : 'Could not check the current frame.');
      }
    } finally {
      if (mountedRef.current) setCheckingHand(false);
    }
  }

  function changeLabel(value: string) {
    if (isGestureLabel(value)) setSelectedLabel(value);
  }

  const canRecord = cameraActive && Boolean(status?.landmarkerConfigured) && !loading && !recording;

  return (
    <Card
      id="collection"
      title="Gesture data collection"
      description="Record real webcam examples for exactly five initial labels. No predictions or samples are generated automatically."
      icon={Database}
      actions={
        <Button
          variant="secondary"
          onClick={() => void refreshStatus()}
          disabled={loading || recording}
          aria-label="Refresh sample counts"
          icon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />}
        >
          Refresh
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Gesture sample counts">
          {GESTURE_LABELS.map((label) => {
            const count = status?.counts[label] ?? 0;
            const progress = Math.min(100, (count / TARGET_SAMPLES) * 100);
            return (
              <div key={label} className="rounded-xl border border-white/10 bg-navy-950/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wide text-white">{label.replace('_', ' ')}</span>
                  <span className="text-xs tabular-nums text-slate-300">{count} / {TARGET_SAMPLES}</span>
                </div>
                <div
                  className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label={`${label} sample target`}
                  aria-valuemin={0}
                  aria-valuemax={TARGET_SAMPLES}
                  aria-valuenow={Math.min(count, TARGET_SAMPLES)}
                >
                  <div className="h-full rounded-full bg-electric-400 transition-all" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2">
            <Database className="h-4 w-4 text-electric-300" aria-hidden="true" />
            {status?.totalSamples ?? 0} samples saved
          </span>
          <span className="inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-electric-300" aria-hidden="true" />
            {status?.sessionCount ?? 0} recording sessions
          </span>
          <span>Current session: {sessionId.slice(0, 8)}</span>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Decide one consistent gesture for each label and use that same form across sessions. Vary your position,
          speed, and lighting naturally; do not mix different signs under one label.
        </p>

        {status && !status.landmarkerConfigured && (
          <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm leading-relaxed text-amber-100">
            <p className="font-semibold">Collection is blocked: MediaPipe hand model not configured.</p>
            <p className="mt-1 text-amber-100/80">{status.message} Add the official
              <code className="mx-1 rounded bg-black/20 px-1.5 py-0.5">hand_landmarker.task</code>
              file under <code className="rounded bg-black/20 px-1.5 py-0.5">backend/models/</code>, then restart the backend.
            </p>
          </div>
        )}

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">
            {error}
          </p>
        )}

        {handCheck && (
          <p
            role="status"
            className={`rounded-xl border p-3 text-sm ${
              handCheck.detected
                ? 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200'
                : 'border-amber-400/20 bg-amber-400/5 text-amber-100'
            }`}
          >
            {handCheck.message}
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label htmlFor="gesture-label" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-electric-300">
              Recording label
            </label>
            <select
              id="gesture-label"
              value={selectedLabel}
              onChange={(event) => changeLabel(event.target.value)}
              disabled={recording || checkingHand}
              className="w-full rounded-xl border border-white/10 bg-navy-950 px-4 py-3 text-sm text-white focus:border-electric-400 focus:outline-none focus:ring-2 focus:ring-electric-400/30"
            >
              {GESTURE_LABELS.map((label) => <option key={label} value={label}>{label.replace('_', ' ')}</option>)}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              {GESTURE_GUIDANCE[selectedLabel]} A sample contains {COLLECTION_SEQUENCE_LENGTH} ordered frames for motion as well as static poses.
            </p>
          </div>
          <Button
            onClick={() => void collectSample()}
            disabled={!canRecord}
            icon={<Video className={`h-4 w-4 ${recording ? 'animate-pulse' : ''}`} aria-hidden="true" />}
          >
            {recording ? `Capturing ${frameProgress} / ${COLLECTION_SEQUENCE_LENGTH}` : 'Record one sample'}
          </Button>
        </div>
        {!cameraActive && (
          <p className="text-xs text-slate-400">Start the camera above before recording. Keep one hand visible for the full capture.</p>
        )}
        {cameraActive && status?.landmarkerConfigured && (
          <Button
            variant="secondary"
            onClick={() => void checkCurrentFrame()}
            disabled={checkingHand || recording}
            icon={<ScanSearch className={`h-4 w-4 ${checkingHand ? 'animate-pulse' : ''}`} aria-hidden="true" />}
          >
            {checkingHand ? 'Checking current frame...' : 'Check hand landmarks'}
          </Button>
        )}
        {recording && (
          <p className="text-xs text-electric-300" role="status">
            Capturing real camera frames. Complete one full gesture now; the backend saves the sample only if a hand is detected in every frame.
          </p>
        )}
        {error && error.includes('VITE_API_URL') && (
          <p className="text-xs text-slate-400">Configure the frontend backend URL and restart the frontend to load persistent counts.</p>
        )}
      </div>
    </Card>
  );
}
