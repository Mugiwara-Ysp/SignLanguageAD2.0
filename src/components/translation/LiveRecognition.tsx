import { LoaderCircle, Play, Square } from 'lucide-react';
import { BACKEND_URL_CONFIGURED } from '@/config';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { LiveResult, Notice, ServerState } from '@/hooks/useSignRecognition';

interface LiveRecognitionProps {
  cameraActive: boolean;
  running: boolean;
  starting: boolean;
  live: LiveResult | null;
  serverState: ServerState;
  modelConfigured: boolean | null;
  serverMessage: string;
  notice: Notice | null;
  onStart: () => void;
  onStop: () => void;
}

function LiveWordDisplay({ running, live }: { running: boolean; live: LiveResult | null }) {
  if (!running) {
    return <p className="text-sm text-slate-400">Translation is paused. Press Start Translation to begin.</p>;
  }
  if (!live) {
    return <p className="text-sm text-slate-400">Waiting for the first frame...</p>;
  }
  if (live.status === 'no_hand') {
    return <p className="text-sm text-slate-300">No hand detected. Hold your hand clearly inside the frame.</p>;
  }
  if (live.status === 'unknown') {
    return (
      <div>
        <p className="mb-1 text-xs text-slate-400">No configured gesture passed the confidence threshold.</p>
        <p className="animate-fade-in-up text-3xl font-bold tracking-tight text-slate-200 sm:text-4xl">UNKNOWN</p>
        {live.confidence !== null && (
          <p className="mt-2 text-xs text-slate-400">Top class confidence: {Math.round(live.confidence * 100)}%</p>
        )}
      </div>
    );
  }
  if (live.status === 'ok' && live.word) {
    return (
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="animate-fade-in-up text-3xl font-bold tracking-tight text-white sm:text-4xl" key={live.word}>
          {live.word}
        </p>
        {live.confidence !== null && (
          <div className="w-full min-w-[160px] sm:w-auto">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Confidence</span>
              <span>{Math.round(live.confidence * 100)}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-navy-950">
              <div
                className="h-full rounded-full bg-electric-400 transition-all duration-300"
                style={{ width: `${Math.round(live.confidence * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  }
  return null;
}

export function LiveRecognition({
  cameraActive,
  running,
  starting,
  live,
  serverState,
  modelConfigured,
  serverMessage,
  notice,
  onStart,
  onStop,
}: LiveRecognitionProps) {
  return (
    <div className="space-y-5">
      {notice ? (
        <Alert tone={notice.tone} title={notice.tone === 'error' ? 'Recognition stopped' : 'Model not configured'}>
          {notice.message}
        </Alert>
      ) : serverState === 'offline' ? (
        <Alert
          tone="error"
          title={BACKEND_URL_CONFIGURED ? 'Recognition server not reachable' : 'Recognition backend not configured'}
        >
          {serverMessage || 'The recognition server is not reachable.'}{' '}
          {BACKEND_URL_CONFIGURED
            ? 'Start the backend, then press Start Translation.'
            : 'The FastAPI backend is a separate service and is not deployed yet. Manual sentence building is available below.'}
        </Alert>
      ) : modelConfigured === false ? (
        <Alert tone="warning" title="Recognition model not configured">
          {serverMessage || 'Connect a trained ISL model to the backend to enable word recognition.'}
        </Alert>
      ) : null}

      <div className="min-h-[7.5rem] rounded-xl border border-white/10 bg-navy-950/60 p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-electric-300">Detected sign</p>
        <LiveWordDisplay running={running} live={live} />
      </div>

      {!cameraActive && <p className="text-xs text-slate-400">Start the camera to enable translation.</p>}

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={onStart}
          disabled={!cameraActive || running || starting}
          aria-busy={starting}
          icon={
            starting ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Play className="h-4 w-4" aria-hidden="true" />
            )
          }
        >
          {starting ? 'Checking backend...' : 'Start Translation'}
        </Button>
        <Button
          variant="secondary"
          onClick={onStop}
          disabled={!running}
          icon={<Square className="h-4 w-4" aria-hidden="true" />}
        >
          Stop Translation
        </Button>
      </div>
    </div>
  );
}
