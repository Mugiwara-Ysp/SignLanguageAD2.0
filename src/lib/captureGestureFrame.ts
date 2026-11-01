export function captureGestureFrame(video: HTMLVideoElement | null): string {
  if (!video?.srcObject || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0) {
    throw new Error('The camera frame is not ready. Wait for the live preview and try again.');
  }

  const scale = Math.min(1, 320 / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not capture a camera frame.');

  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}
