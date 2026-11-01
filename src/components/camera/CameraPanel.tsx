import { Camera, CameraOff, Play, Square, VideoOff } from 'lucide-react';
import type { RefObject } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusPill, type StatusTone } from '@/components/ui/StatusPill';
import type { CameraStatus, PermissionValue } from '@/hooks/useCamera';

interface CameraPanelProps {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  errorMessage: string | null;
  permission: PermissionValue;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABELS: Record<CameraStatus, { tone: StatusTone; label: string; pulse?: boolean }> = {
  idle: { tone: 'neutral', label: 'Camera off' },
  requesting: { tone: 'info', label: 'Waiting for permission', pulse: true },
  active: { tone: 'success', label: 'Camera live', pulse: true },
  denied: { tone: 'error', label: 'Permission denied' },
  unavailable: { tone: 'error', label: 'No camera found' },
  error: { tone: 'error', label: 'Camera error' },
};

const PERMISSION_LABELS: Record<PermissionValue, string | null> = {
  granted: 'Browser permission: granted',
  prompt: 'Browser permission: not yet requested',
  denied: 'Browser permission: blocked',
  unknown: null,
};

const PLACEHOLDER_TEXT: Partial<Record<CameraStatus, string>> = {
  idle: 'Press Start Camera to show your webcam preview.',
  requesting: 'Allow camera access in the browser prompt.',
  denied: 'Camera access is blocked for this site.',
  unavailable: 'Connect a webcam and try again.',
  error: 'The camera is not available right now.',
};

export function CameraPanel({ videoRef, status, errorMessage, permission, onStart, onStop }: CameraPanelProps) {
  const isActive = status === 'active';
  const isBusy = status === 'requesting';
  const statusInfo = STATUS_LABELS[status];
  const permissionLabel = PERMISSION_LABELS[permission];

  return (
    <Card
      id="camera"
      title="Camera"
      description="Your webcam preview stays in the browser. Ordered 12-frame sequences are sent for recognition only while translation runs."
      icon={Camera}
      actions={<StatusPill tone={statusInfo.tone} label={statusInfo.label} pulse={statusInfo.pulse} />}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-navy-950 shadow-inner">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live webcam preview"
          className={`h-full w-full object-cover scale-x-[-1] transition-opacity duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
        />
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-800 text-electric-300 ring-1 ring-white/10">
              {status === 'denied' || status === 'unavailable' || status === 'error' ? (
                <VideoOff className="h-7 w-7" aria-hidden="true" />
              ) : (
                <Camera className="h-7 w-7" aria-hidden="true" />
              )}
            </span>
            <p className="max-w-xs text-sm leading-relaxed text-slate-300">
              {PLACEHOLDER_TEXT[status] ?? 'Starting camera...'}
            </p>
          </div>
        )}
        {isActive && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-navy-950/60 to-transparent" />
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          onClick={onStart}
          disabled={isActive || isBusy}
          icon={isBusy ? <Camera className="h-4 w-4 animate-pulse" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        >
          {isBusy ? 'Starting...' : 'Start Camera'}
        </Button>
        <Button
          variant="secondary"
          onClick={onStop}
          disabled={!isActive}
          icon={<CameraOff className="h-4 w-4" aria-hidden="true" />}
        >
          Stop Camera
        </Button>
        {permissionLabel && <p className="text-xs text-slate-400 sm:ml-auto">{permissionLabel}</p>}
      </div>

      {errorMessage && (
        <div className="mt-5">
          <Alert tone="error" title="Camera unavailable">
            {errorMessage}
          </Alert>
        </div>
      )}
      {!errorMessage && status === 'idle' && (
        <p className="mt-5 flex items-center gap-2 text-xs text-slate-400">
          <Square className="h-3 w-3 fill-slate-400" aria-hidden="true" />
          Your browser will ask for permission the first time you start the camera.
        </p>
      )}
    </Card>
  );
}
