import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'unavailable' | 'error';

export type PermissionValue = PermissionState | 'unknown';

interface CameraFailure {
  status: CameraStatus;
  message: string;
}

function describeCameraError(error: unknown): CameraFailure {
  const name = error instanceof DOMException ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        status: 'denied',
        message:
          "Camera access was blocked. Allow camera access for this site in your browser's settings, then press Start Camera again.",
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return { status: 'unavailable', message: 'No camera was found on this device.' };
    case 'NotReadableError':
    case 'AbortError':
      return {
        status: 'error',
        message: 'The camera could not be started. Another application may be using it.',
      };
    default:
      return { status: 'error', message: 'The camera could not be started. Please try again.' };
  }
}

export interface CameraState {
  videoRef: RefObject<HTMLVideoElement>;
  status: CameraStatus;
  errorMessage: string | null;
  permission: PermissionValue;
  start: () => Promise<void>;
  stop: () => void;
}

export function useCamera(): CameraState {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startPendingRef = useRef(false);
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionValue>('unknown');

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    startPendingRef.current = false;
    releaseStream();
    setStatus('idle');
    setErrorMessage(null);
  }, [releaseStream]);

  const start = useCallback(async () => {
    if (startPendingRef.current || streamRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable');
      setErrorMessage(
        'This browser cannot access the camera. Use a current version of Chrome, Edge, Firefox or Safari on a secure (HTTPS) connection.',
      );
      return;
    }

    const requestId = ++requestIdRef.current;
    startPendingRef.current = true;
    setStatus('requesting');
    setErrorMessage(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        if (video?.srcObject === stream) video.srcObject = null;
        return;
      }

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;
        releaseStream();
        setStatus('error');
        setErrorMessage('The camera was disconnected or access was revoked.');
      });
      setStatus('active');
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      releaseStream();
      const failure = describeCameraError(error);
      setStatus(failure.status);
      setErrorMessage(failure.message);
    } finally {
      if (requestId === requestIdRef.current) startPendingRef.current = false;
    }
  }, [releaseStream]);

  useEffect(() => {
    if (!navigator.permissions?.query) return;

    let active = true;
    let permissionStatus: PermissionStatus | null = null;

    navigator.permissions
      .query({ name: 'camera' as PermissionName })
      .then((result) => {
        if (!active) return;
        permissionStatus = result;
        setPermission(result.state);
        result.onchange = () => setPermission(result.state);
      })
      .catch(() => setPermission('unknown'));

    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  useEffect(() => {
    function stopForPageExit() {
      requestIdRef.current += 1;
      startPendingRef.current = false;
      releaseStream();
    }

    window.addEventListener('pagehide', stopForPageExit);
    return () => {
      window.removeEventListener('pagehide', stopForPageExit);
      stopForPageExit();
    };
  }, [releaseStream]);

  return { videoRef, status, errorMessage, permission, start, stop };
}
