import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, WebMOutputFormat, type VideoCodec } from 'mediabunny';

/**
 * Films the slideshow by capturing the current tab with getDisplayMedia,
 * drawing each captured frame into a fixed 1080×1920 canvas (cropped to the
 * story frame) and encoding that canvas with WebCodecs.
 *
 * Encoding the canvas ourselves, instead of handing the capture stream to
 * MediaRecorder, keeps the resolution constant and avoids the corrupt MP4s some
 * Chrome builds produce when recording a cropped tab.
 */
interface CropTargetStatic {
  fromElement(el: Element): Promise<unknown>;
}

type CroppableTrack = MediaStreamTrack & { cropTo?: (target: unknown) => Promise<void> };

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
const FPS = 30;
const BITRATE = 12_000_000;

export interface Recording {
  /** Crops the capture to `el`; uses Region Capture where available and manual cropping elsewhere. */
  crop(el: Element): Promise<void>;
  /** Starts filming once the page is ready. */
  start(): void;
  stop(): Promise<{ blob: Blob; extension: string }>;
  cancel(): void;
  /** Called if the user stops sharing from the browser UI. */
  onEnded?: () => void;
}

type Encoder = {
  extension: string;
  begin(): void;
  addFrame(timestamp: number): Promise<void>;
  finish(): Promise<Blob>;
  cancel(): void;
};

async function pickCodec(): Promise<{ codec: VideoCodec; mp4: boolean; hardwareAcceleration: 'prefer-software' | 'no-preference' } | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const size = { width: VIDEO_WIDTH, height: VIDEO_HEIGHT, bitrate: BITRATE, frameRate: FPS };
  // Software H.264 first: hardware encoders are behind most of the broken files we have seen.
  for (const [codec, mp4] of [['avc', true], ['vp9', false], ['vp8', false]] as const) {
    for (const hardwareAcceleration of ['prefer-software', 'no-preference'] as const) {
      if (await canEncodeVideo(codec, { ...size, hardwareAcceleration }).catch(() => false)) {
        return { codec, mp4, hardwareAcceleration };
      }
    }
  }
  return null;
}

async function webCodecsEncoder(canvas: HTMLCanvasElement): Promise<Encoder | null> {
  const choice = await pickCodec();
  if (!choice) return null;
  const target = new BufferTarget();
  const output = new Output({
    format: choice.mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target,
  });
  const source = new CanvasSource(canvas, {
    codec: choice.codec,
    bitrate: BITRATE,
    keyFrameInterval: 1,
    hardwareAcceleration: choice.hardwareAcceleration,
  });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  return {
    extension: choice.mp4 ? 'mp4' : 'webm',
    begin: () => {},
    addFrame: (timestamp) => source.add(timestamp, 1 / FPS),
    finish: async () => {
      await output.finalize();
      return new Blob([target.buffer!], { type: choice.mp4 ? 'video/mp4' : 'video/webm' });
    },
    cancel: () => void output.cancel(),
  };
}

/** Fallback for browsers without WebCodecs: MediaRecorder on the (fixed-size) canvas. */
function mediaRecorderEncoder(canvas: HTMLCanvasElement): Encoder {
  const stream = canvas.captureStream(FPS);
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: BITRATE });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const type = mimeType || 'video/webm';
  return {
    extension: type.includes('mp4') ? 'mp4' : 'webm',
    begin: () => recorder.start(1000),
    addFrame: async () => {},
    finish: () =>
      new Promise((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type }));
        recorder.stop();
      }),
    cancel: () => recorder.state !== 'inactive' && recorder.stop(),
  };
}

export async function requestRecording(): Promise<Recording> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser', frameRate: FPS },
    audio: false,
    // Chrome: offer the current tab first.
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions);
  const track = stream.getVideoTracks()[0] as CroppableTrack;
  const stopTracks = () => stream.getTracks().forEach((t) => t.stop());

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingQuality = 'high';

  let cropEl: Element | null = null;
  let cropped = false;
  let encoder: Encoder;
  try {
    encoder = (await webCodecsEncoder(canvas)) ?? mediaRecorderEncoder(canvas);
  } catch (e) {
    stopTracks();
    throw e;
  }
  let timer = 0;
  let pending: Promise<void> | null = null;
  let started = 0;

  const draw = () => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;
    let sx = 0;
    let sy = 0;
    let sw = vw;
    let sh = vh;
    if (!cropped && cropEl) {
      // The capture is the tab viewport: map the frame's CSS box onto it.
      const r = cropEl.getBoundingClientRect();
      const kx = vw / window.innerWidth;
      const ky = vh / window.innerHeight;
      sx = r.left * kx;
      sy = r.top * ky;
      sw = r.width * kx;
      sh = r.height * ky;
    }
    const scale = Math.min(VIDEO_WIDTH / sw, VIDEO_HEIGHT / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
    ctx.drawImage(video, sx, sy, sw, sh, (VIDEO_WIDTH - dw) / 2, (VIDEO_HEIGHT - dh) / 2, dw, dh);
  };

  let lastFrame = -1;
  const tick = () => {
    if (pending) return; // Encoder busy: drop this frame to keep real-time pacing.
    // Snap to the frame grid so timestamps are strictly increasing; a skipped slot just holds the previous frame.
    const frame = Math.round(((performance.now() - started) / 1000) * FPS);
    if (frame <= lastFrame) return;
    lastFrame = frame;
    draw();
    pending = encoder.addFrame(frame / FPS).finally(() => {
      pending = null;
    });
  };

  const recording: Recording = {
    crop: async (el) => {
      cropEl = el;
      const CropTarget = (window as unknown as { CropTarget?: CropTargetStatic }).CropTarget;
      if (!CropTarget || !track.cropTo) return;
      try {
        await track.cropTo(await CropTarget.fromElement(el));
        cropped = true;
        // Let the first cropped frame arrive before filming.
        await new Promise((r) => setTimeout(r, 300));
      } catch {
        cropped = false;
      }
    },
    start: () => {
      draw();
      encoder.begin();
      started = performance.now();
      lastFrame = -1;
      tick();
      timer = window.setInterval(tick, 1000 / FPS);
    },
    stop: async () => {
      clearInterval(timer);
      await pending;
      stopTracks();
      const blob = await encoder.finish();
      return { blob, extension: encoder.extension };
    },
    cancel: () => {
      clearInterval(timer);
      encoder.cancel();
      stopTracks();
    },
  };
  track.addEventListener('ended', () => recording.onEnded?.());
  return recording;
}
