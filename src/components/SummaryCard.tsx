import { toPng } from 'html-to-image';
import { motion } from 'motion/react';
import { useRef, useState } from 'react';
import type { Stats } from '../stats/compute';
import { fmt, safeFilename, shortPath } from './format';
import { useVideoExport } from './StoryPlayer';

export function SummaryCard({ s }: { s: Stats }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const video = useVideoExport();
  const peak = s.hours.indexOf(Math.max(...s.hours));

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement('a');
      a.href = url;
      a.download = safeFilename(`retrospectiva-${s.repoName}-${s.periodLabel}.png`);
      a.click();
    } finally {
      setBusy(false);
    }
  };

  const items = [
    { label: 'Commits', value: fmt(s.totalCommits) },
    { label: 'Linhas +/−', value: `+${fmt(s.linesAdded)} / −${fmt(s.linesRemoved)}` },
    { label: 'Dias ativos', value: fmt(s.activeDays) },
    { label: 'Maior sequência', value: `${fmt(s.longestStreak.length)} dias` },
    { label: 'Linguagem', value: s.languages[0]?.name ?? '—' },
    { label: 'Horário de pico', value: `${peak}h` },
  ];

  return (
    <div className="center">
      <motion.div
        ref={ref}
        className="card"
        initial={{ opacity: 0, rotateY: -25, scale: 0.9 }}
        animate={{ opacity: 1, rotateY: 0, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="card-head">
          <span className="card-kicker">Git Retrospectiva · {s.periodLabel}</span>
          <h2>{s.repoName}</h2>
          <span className="card-who">{s.authorLabel}</span>
        </div>
        <div className="card-persona">
          <span>{s.personality.emoji}</span>
          <strong>{s.personality.title}</strong>
        </div>
        <dl className="card-grid">
          {items.map((it, i) => (
            <motion.div key={it.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.08 }}>
              <dt>{it.label}</dt>
              <dd>{it.value}</dd>
            </motion.div>
          ))}
        </dl>
        {s.topFiles[0] && (
          <div className="card-foot">
            <span>Arquivo nº 1</span>
            <strong>{shortPath(s.topFiles[0].path, 38)}</strong>
          </div>
        )}
      </motion.div>
      <motion.div className="card-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        <button className="btn primary" onClick={download} disabled={busy}>
          {busy ? 'Gerando…' : 'Baixar imagem'}
        </button>
        {video && (
          <button className="btn" onClick={video.startRecording} disabled={video.busy}>
            Baixar vídeo
          </button>
        )}
      </motion.div>
    </div>
  );
}
