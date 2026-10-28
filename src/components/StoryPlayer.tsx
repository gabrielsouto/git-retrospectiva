import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Recording } from './videoRecorder';
import { downloadBlob, supportsVideo } from './videoSupport';

export interface StorySlide {
  id: string;
  /** Seconds before auto-advancing; 0 waits for the user. */
  duration: number;
  background: string;
  render: () => ReactNode;
}

/** How long the final, static slide stays on screen in the video. */
const VIDEO_TAIL_SECONDS = 5;

/** Lets slides (the summary card) trigger the video export. */
const VideoContext = createContext<{ startRecording: () => void; busy: boolean } | null>(null);
export const useVideoExport = () => useContext(VideoContext);

type RecordState = { phase: 'idle' } | { phase: 'starting' } | { phase: 'recording'; recording: Recording } | { phase: 'saving' };

export function StoryPlayer({ slides, onExit, videoName }: { slides: StorySlide[]; onExit: () => void; videoName: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [record, setRecord] = useState<RecordState>({ phase: 'idle' });
  const [recordError, setRecordError] = useState('');
  const [run, setRun] = useState(0);
  const elapsed = useRef(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const slide = slides[index];
  const recording = record.phase === 'recording' ? record.recording : null;
  const totalSeconds = slides.reduce((s, x) => s + (x.duration || VIDEO_TAIL_SECONDS), 0);
  const [recordedSeconds, setRecordedSeconds] = useState(0);

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
      elapsed.current = 0;
      setProgress(0);
    },
    [slides.length],
  );

  const finishRecording = useCallback(
    async (rec: Recording) => {
      setRecord({ phase: 'saving' });
      const { blob, extension } = await rec.stop();
      downloadBlob(blob, `${videoName}.${extension}`);
      setRecord({ phase: 'idle' });
    },
    [videoName],
  );

  // Auto-advance; while recording, the last slide ends the video after a short tail.
  useEffect(() => {
    const duration = slide.duration || (recording ? VIDEO_TAIL_SECONDS : 0);
    if (paused || !duration) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      elapsed.current += (now - last) / 1000;
      last = now;
      const p = elapsed.current / duration;
      setProgress(Math.min(1, p));
      if (p >= 1) {
        if (index < slides.length - 1) go(1);
        else if (recording) finishRecording(recording);
        return;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [index, paused, slide.duration, slides.length, go, recording, finishRecording]);

  useEffect(() => {
    if (!recording) return;
    const started = performance.now();
    const t = setInterval(() => setRecordedSeconds((performance.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, [recording]);

  const startRecording = async () => {
    setRecordError('');
    setRecord({ phase: 'starting' });
    let rec: Recording;
    try {
      const { requestRecording } = await import('./videoRecorder');
      rec = await requestRecording();
    } catch (e) {
      setRecord({ phase: 'idle' });
      if (!(e instanceof DOMException && e.name === 'NotAllowedError')) setRecordError(e instanceof Error ? e.message : String(e));
      return;
    }
    rec.onEnded = () => {
      rec.cancel();
      setRecord({ phase: 'idle' });
    };
    // Switch to the 9:16 frame (paused), crop the capture to it, then rewind and film.
    setRecordedSeconds(0);
    setPaused(true);
    setRecord({ phase: 'recording', recording: rec });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (frameRef.current) await rec.crop(frameRef.current);
    setIndex(0);
    elapsed.current = 0;
    setProgress(0);
    setRun((r) => r + 1);
    setPaused(false);
    rec.start();
  };

  const cancelRecording = useCallback(() => {
    if (record.phase === 'recording') record.recording.cancel();
    setRecord({ phase: 'idle' });
  }, [record]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (record.phase === 'recording') {
        if (e.key === 'Escape') cancelRecording();
        return;
      }
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onExit, record.phase, cancelRecording]);

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (recording || (e.target as HTMLElement).closest('button, a, input, select')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1);
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <VideoContext.Provider value={supportsVideo ? { startRecording, busy: record.phase !== 'idle' } : null}>
    <div className={`player ${recording ? 'recording' : ''}`}>
      <motion.div ref={frameRef} className="player-frame" animate={{ background: slide.background }} transition={{ duration: 0.8 }}>
        <div className="player-bars" aria-hidden>
          {slides.map((s, i) => (
            <div key={s.id} className="player-bar">
              <div
                className="player-bar-fill"
                style={{ transform: `scaleX(${i < index ? 1 : i === index ? (slide.duration || recording ? progress : 1) : 0})` }}
              />
            </div>
          ))}
        </div>
        {!recording && (
          <div className="player-controls">
            {supportsVideo && (
              <button
                className="icon-btn"
                onClick={startRecording}
                disabled={record.phase !== 'idle'}
                aria-label="Baixar como vídeo"
                title="Baixar como vídeo"
              >
                {record.phase === 'saving' ? '…' : '⬇︎'}
              </button>
            )}
            <button className="icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Continuar' : 'Pausar'}>
              {paused ? '▶' : '❚❚'}
            </button>
            <button className="icon-btn" onClick={onExit} aria-label="Sair">
              ✕
            </button>
          </div>
        )}
        <div className="player-stage" onClick={onTap}>
          <AnimatePresence mode="wait">
            <motion.section
              key={`${run}-${slide.id}`}
              className="slide"
              initial={{ opacity: 0, scale: 0.96, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.04, y: -24 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              {slide.render()}
            </motion.section>
          </AnimatePresence>
        </div>
        <div className="player-hint" aria-live="polite">
          {recording ? 'Git Retrospectiva' : `${index + 1} / ${slides.length}`}
        </div>
      </motion.div>
      {recording && (
        <div className="recording-bar" role="status">
          <span className="rec-dot" aria-hidden />
          Gravando {mmss(recordedSeconds)} / {mmss(totalSeconds)}. Mantenha esta aba aberta.
          <button className="btn small" onClick={cancelRecording}>
            Cancelar
          </button>
        </div>
      )}
      {record.phase === 'saving' && <div className="recording-bar" role="status">Preparando o vídeo…</div>}
      {recordError && (
        <div className="recording-bar error-bar" role="alert">
          Não foi possível gravar: {recordError}
          <button className="btn small" onClick={() => setRecordError('')}>
            Ok
          </button>
        </div>
      )}
    </div>
    </VideoContext.Provider>
  );
}
