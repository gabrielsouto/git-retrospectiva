import { safeFilename } from './format';

/**
 * Records the current tab with getDisplayMedia, cropped to one element when the
 * browser supports Region Capture, and returns the video once stopped.
 */
interface CropTargetStatic {
  fromElement(el: Element): Promise<unknown>;
}

type CroppableTrack = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> };

const MIME_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

export const supportsVideo =
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia && typeof MediaRecorder !== 'undefined';

export interface Recording {
  /** Starts recording once the page is ready to be filmed. */
  start(): void;
  stop(): Promise<{ blob: Blob; extension: string }>;
  cancel(): void;
  /** Crops the capture to `el` (Chrome's Region Capture). Returns false where unsupported. */
  crop(el: Element): Promise<boolean>;
  /** Called if the user stops sharing from the browser UI. */
  onEnded?: () => void;
}

export async function requestRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: 30 },
    audio: false,
    // Chrome: offer the current tab first and skip the picker list where allowed.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions);
  const track = stream.getVideoTracks()[0] as CroppableTrack;
  const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

  const recording: Recording = {
    start: () => recorder.start(1000),
    stop: () =>
      new Promise((resolve) => {
        recorder.onstop = () => {
          stopTracks();
          const type = recorder.mimeType || mimeType || 'video/webm';
          resolve({ blob: new Blob(chunks, { type }), extension: type.includes('mp4') ? 'mp4' : 'webm' });
        };
        if (recorder.state === 'inactive') recorder.onstop(new Event('stop'));
        else recorder.stop();
      }),
    crop: async (el) => {
      const CropTarget = (window as unknown as { CropTarget?: CropTargetStatic }).CropTarget;
      if (!CropTarget || !track.cropTo) return false;
      try {
        await track.cropTo(await CropTarget.fromElement(el));
        return true;
      } catch {
        return false;
      }
    },
    cancel: () => {
      if (recorder.state !== 'inactive') recorder.stop();
      stopTracks();
    },
  };
  track.addEventListener('ended', () => recording.onEnded?.());
  return recording;
}

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
