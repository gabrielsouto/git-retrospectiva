import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface StorySlide {
  id: string;
  /** Seconds before auto-advancing; 0 waits for the user. */
  duration: number;
  background: string;
  render: () => ReactNode;
}

export function StoryPlayer({ slides, onExit }: { slides: StorySlide[]; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const elapsed = useRef(0);
  const slide = slides[index];

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta)));
      elapsed.current = 0;
      setProgress(0);
    },
    [slides.length],
  );

  useEffect(() => {
    if (paused || !slide.duration) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      elapsed.current += (now - last) / 1000;
      last = now;
      const p = elapsed.current / slide.duration;
      setProgress(Math.min(1, p));
      if (p >= 1) {
        if (index < slides.length - 1) go(1);
        return;
      }
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [index, paused, slide.duration, slides.length, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === ' ') {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onExit]);

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    go(e.clientX - rect.left < rect.width / 3 ? -1 : 1);
  };

  return (
    <motion.div className="player" animate={{ background: slide.background }} transition={{ duration: 0.8 }}>
      <div className="player-bars" aria-hidden>
        {slides.map((s, i) => (
          <div key={s.id} className="player-bar">
            <div
              className="player-bar-fill"
              style={{ transform: `scaleX(${i < index ? 1 : i === index ? (slide.duration ? progress : 1) : 0})` }}
            />
          </div>
        ))}
      </div>
      <div className="player-controls">
        <button className="icon-btn" onClick={() => setPaused((p) => !p)} aria-label={paused ? 'Continuar' : 'Pausar'}>
          {paused ? '▶' : '❚❚'}
        </button>
        <button className="icon-btn" onClick={onExit} aria-label="Sair">
          ✕
        </button>
      </div>
      <div className="player-stage" onClick={onTap}>
        <AnimatePresence mode="wait">
          <motion.section
            key={slide.id}
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
        {index + 1} / {slides.length}
      </div>
    </motion.div>
  );
}
