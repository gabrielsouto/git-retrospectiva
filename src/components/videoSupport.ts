import { safeFilename } from './format';

// Kept apart from videoRecorder.ts so the encoder (and its muxer) only load when a video is requested.

export const supportsVideo =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  (typeof VideoEncoder !== 'undefined' || typeof MediaRecorder !== 'undefined');

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
