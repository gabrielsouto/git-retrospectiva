import confetti from 'canvas-confetti';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';
import { CountUp } from '../components/CountUp';
import { fmt, fmtDate, pct, plural, shortPath, WEEKDAYS, WEEKDAYS_SHORT } from '../components/format';
import { GrowingTree } from '../components/GrowingTree';
import { SummaryCard } from '../components/SummaryCard';
import type { StorySlide } from '../components/StoryPlayer';
import type { Stats } from '../stats/compute';

const g = (a: string, b: string) => `linear-gradient(145deg, ${a} 0%, ${b} 100%)`;

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 28 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
});

function Kicker({ children, delay = 0.1 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.p className="kicker" {...rise(delay)}>
      {children}
    </motion.p>
  );
}

function Big({ children, delay = 0.3 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.h2 className="big" {...rise(delay)}>
      {children}
    </motion.h2>
  );
}

function Note({ children, delay = 1.2 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.p className="note" {...rise(delay)}>
      {children}
    </motion.p>
  );
}

function Confetti({ delay = 900 }: { delay?: number }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.65 }, colors: ['#ffffff', '#1ed760', '#ff4fd8', '#ffd84f'] });
    }, delay);
    return () => clearTimeout(t);
  }, [delay, reduce]);
  return null;
}

function Intro({ s }: { s: Stats }) {
  return (
    <div className="center">
      <motion.div
        className="intro-orb"
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      >
        🎁
      </motion.div>
      <Kicker delay={0.4}>Retrospectiva de {s.periodLabel}</Kicker>
      <Big delay={0.6}>{s.repoName}</Big>
      <Note delay={1.1}>
        {s.authorLabel === 'todo o time' ? 'Vamos ver o que o time construiu.' : `Preparado para ${s.authorLabel}.`}{' '}
        <span className="tap-hint">Toque para avançar.</span>
      </Note>
    </div>
  );
}

function Commits({ s }: { s: Stats }) {
  const perDay = s.spanDays / Math.max(1, s.totalCommits);
  return (
    <div className="center">
      <Kicker>Ao todo foram</Kicker>
      <Big>
        <span className="huge">
          <CountUp to={s.totalCommits} />
        </span>
        <span className="unit">commits</span>
      </Big>
      <Note>
        {perDay <= 1
          ? `Uma média de ${fmt(s.totalCommits / Math.max(1, s.spanDays))} por dia.`
          : `Um commit a cada ${perDay.toFixed(1).replace('.', ',')} dias.`}{' '}
        Em {plural(s.activeDays, 'dia ativo', 'dias ativos')}.
      </Note>
      {s.merges > 0 && <Note delay={1.6}>E mais {plural(s.merges, 'merge', 'merges')} pelo caminho.</Note>}
      <Confetti />
    </div>
  );
}

function Lines({ s }: { s: Stats }) {
  const max = Math.max(s.linesAdded, s.linesRemoved, 1);
  return (
    <div className="center wide">
      <Kicker>Você mexeu em {plural(s.filesTouched, 'arquivo', 'arquivos')}</Kicker>
      <div className="lines">
        {[
          { label: 'linhas adicionadas', value: s.linesAdded, cls: 'plus', sign: '+' },
          { label: 'linhas removidas', value: s.linesRemoved, cls: 'minus', sign: '−' },
        ].map((row, i) => (
          <div key={row.cls} className="lines-row">
            <div className={`lines-value ${row.cls}`}>
              {row.sign}
              <CountUp to={row.value} delay={0.3 + i * 0.4} />
            </div>
            <div className="lines-track">
              <motion.div
                className={`lines-bar ${row.cls}`}
                initial={{ width: 0 }}
                animate={{ width: `${(row.value / max) * 100}%` }}
                transition={{ delay: 0.3 + i * 0.4, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="lines-label">{row.label}</div>
          </div>
        ))}
      </div>
      <Note delay={1.8}>
        {s.linesRemoved > s.linesAdded
          ? 'Mais apagou do que escreveu. Código bom é código que não existe.'
          : `Saldo de ${fmt(s.linesAdded - s.linesRemoved)} linhas novas no mundo.`}
      </Note>
    </div>
  );
}

function Heatmap({ s }: { s: Stats }) {
  if (!s.days.length) return null;
  const max = Math.max(...s.days.map((d) => d.count), 1);
  const level = (n: number) => (n === 0 ? 0 : Math.ceil((n / max) * 4));
  // One mini calendar per month reads well on both phones and wide screens.
  const months: { key: string; offset: number; days: typeof s.days }[] = [];
  for (const d of s.days) {
    const key = d.dateKey.slice(0, 7);
    let m = months[months.length - 1];
    if (!m || m.key !== key) {
      m = { key, offset: new Date(d.dateKey + 'T12:00:00Z').getUTCDay(), days: [] };
      months.push(m);
    }
    m.days.push(d);
  }
  return (
    <div className="center wide">
      <Kicker>{s.periodLabel.match(/^\d+$/) ? 'Seu ano, dia a dia' : 'Os últimos 12 meses, dia a dia'}</Kicker>
      <div className="calendar">
        {months.map((m, mi) => (
          <div key={m.key} className="calendar-month">
            <span className="calendar-label">{fmtDate(m.key + '-01', { month: 'short' }).replace('.', '')}</span>
            <div className="calendar-grid">
              {Array.from({ length: m.offset }, (_, i) => (
                <div key={`pad${i}`} />
              ))}
              {m.days.map((d, i) => (
                <motion.div
                  key={d.dateKey}
                  className={`cell l${level(d.count)}`}
                  title={`${fmtDate(d.dateKey)}: ${d.count}`}
                  initial={{ opacity: 0, scale: 0.2 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + mi * 0.12 + i * 0.008, duration: 0.3 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {s.busiestDay && (
        <Note delay={1.9}>
          O dia mais intenso foi {fmtDate(s.busiestDay.dateKey, { day: 'numeric', month: 'long', year: 'numeric' })}, com{' '}
          {plural(s.busiestDay.count, 'commit', 'commits')}.
        </Note>
      )}
    </div>
  );
}

function Months({ s }: { s: Stats }) {
  const max = Math.max(...s.months.map((m) => m.count), 1);
  const best = s.months.reduce((a, b) => (b.count > a.count ? b : a), s.months[0]);
  return (
    <div className="center wide">
      <Kicker>O seu mês de pico foi</Kicker>
      <Big delay={0.2}>{s.peakMonth?.label}</Big>
      <div className="bars">
        {s.months.map((m, i) => (
          <div key={m.label} className="bars-col">
            <motion.div
              className={`bars-bar ${m === best ? 'hot' : ''}`}
              initial={{ height: 0 }}
              animate={{ height: `${(m.count / max) * 100}%` }}
              transition={{ delay: 0.5 + i * 0.06, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
            <span className="bars-label">{m.label}</span>
          </div>
        ))}
      </div>
      <Note delay={1.6}>
        {plural(s.peakMonth?.count ?? 0, 'commit', 'commits')} só nesse mês.
        {s.monthsByYear && best && ` E ${best.label} foi o ano mais movimentado, com ${plural(best.count, 'commit', 'commits')}.`}
      </Note>
    </div>
  );
}

function Clock({ s }: { s: Stats }) {
  const max = Math.max(...s.hours, 1);
  const peak = s.hours.indexOf(Math.max(...s.hours));
  const R = 120;
  return (
    <div className="center">
      <Kicker>Seu horário favorito para commitar</Kicker>
      <svg className="clock" viewBox="-160 -160 320 320" role="img" aria-label={`Pico às ${peak}h`}>
        <circle r={R * 0.32} className="clock-face" />
        {s.hours.map((n, h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
          const len = R * 0.35 + (n / max) * R * 0.65;
          const x = Math.cos(angle);
          const y = Math.sin(angle);
          return (
            <motion.line
              key={h}
              x1={x * R * 0.35}
              y1={y * R * 0.35}
              x2={x * len}
              y2={y * len}
              className={h === peak ? 'clock-ray hot' : 'clock-ray'}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: 0.3 + h * 0.04, duration: 0.6 }}
            />
          );
        })}
        {[0, 6, 12, 18].map((h) => {
          const angle = (h / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <text key={h} x={Math.cos(angle) * (R + 22)} y={Math.sin(angle) * (R + 22) + 5} className="clock-label">
              {h}h
            </text>
          );
        })}
        <text y={8} className="clock-center">
          {peak}h
        </text>
      </svg>
      <motion.div className="badge" {...rise(1.5)}>
        <span className="badge-emoji">{s.personality.emoji}</span>
        <div>
          <strong>{s.personality.title}</strong>
          <span>{s.personality.description}</span>
        </div>
      </motion.div>
    </div>
  );
}

function Weekdays({ s }: { s: Stats }) {
  const max = Math.max(...s.weekdays, 1);
  const best = s.weekdays.indexOf(Math.max(...s.weekdays));
  return (
    <div className="center wide">
      <Kicker>O dia da semana mais produtivo</Kicker>
      <Big delay={0.2}>{WEEKDAYS[best]}</Big>
      <div className="week">
        {s.weekdays.map((n, i) => (
          <div key={i} className="week-col">
            <motion.div
              className={`week-dot ${i === best ? 'hot' : ''} ${i === 0 || i === 6 ? 'weekend' : ''}`}
              initial={{ scale: 0 }}
              animate={{ scale: 0.35 + (n / max) * 0.65 }}
              transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 160, damping: 12 }}
            />
            <span>{WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>
      <Note delay={1.5}>
        {s.weekendShare > 0.15
          ? `${pct(s.weekendShare)} dos commits caíram no fim de semana. Descansar também é importante!`
          : `Só ${pct(s.weekendShare)} no fim de semana. Equilíbrio é tudo.`}
      </Note>
    </div>
  );
}

function Streak({ s }: { s: Stats }) {
  return (
    <div className="center">
      <motion.div
        className="flame"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1], rotate: [0, -6, 6, -3, 0] }}
        transition={{ duration: 1.2 }}
      >
        🔥
      </motion.div>
      <Kicker delay={0.4}>Sua maior sequência</Kicker>
      <Big delay={0.6}>
        <span className="huge">
          <CountUp to={s.longestStreak.length} delay={0.6} />
        </span>
        <span className="unit">{s.longestStreak.length === 1 ? 'dia seguido' : 'dias seguidos'}</span>
      </Big>
      {s.longestStreak.length > 1 && (
        <Note delay={1.4}>
          De {fmtDate(s.longestStreak.start)} a {fmtDate(s.longestStreak.end)}, sem falhar um dia.
        </Note>
      )}
    </div>
  );
}

function Languages({ s }: { s: Stats }) {
  const top = s.languages[0];
  return (
    <div className="center wide">
      <Kicker>Sua linguagem do ano</Kicker>
      <Big delay={0.2}>
        <span style={{ color: top?.color === '#292929' ? undefined : top?.color }} className="lang-name">
          {top?.name ?? '—'}
        </span>
      </Big>
      <ol className="ranking">
        {s.languages.map((l, i) => (
          <motion.li key={l.name} {...rise(0.6 + i * 0.12)}>
            <span className="rank">{i + 1}</span>
            <span className="rank-name">{l.name}</span>
            <span className="rank-track">
              <motion.span
                className="rank-bar"
                style={{ background: l.color }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(2, (l.share / (s.languages[0]?.share || 1)) * 100)}%` }}
                transition={{ delay: 0.8 + i * 0.12, duration: 0.9 }}
              />
            </span>
            <span className="rank-value">{pct(l.share)}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function TopFiles({ s }: { s: Stats }) {
  return (
    <div className="center wide">
      <Kicker>Os hits do ano</Kicker>
      <Note delay={0.3}>Os arquivos que você mais "ouviu".</Note>
      <ol className="tracks">
        {s.topFiles.map((f, i) => (
          <motion.li key={f.path} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 + i * 0.18, duration: 0.6 }}>
            <span className="track-n">{i + 1}</span>
            <span className="track-cover" style={{ background: `hsl(${(i * 67 + 140) % 360} 80% 60%)` }}>
              {f.path.split('.').pop()?.slice(0, 3)}
            </span>
            <span className="track-meta">
              <strong title={f.path}>{shortPath(f.path.split('/').pop() ?? f.path, 30)}</strong>
              <span>
                {shortPath(f.path, 40)} · {plural(f.commits, 'commit', 'commits')}
              </span>
            </span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

function Contributors({ s }: { s: Stats }) {
  const podium = s.contributors.slice(0, 3);
  const order = [1, 0, 2].filter((i) => podium[i]);
  const heights = [100, 72, 52];
  return (
    <div className="center wide">
      <Kicker>O pódio do repositório</Kicker>
      <div className="podium">
        {order.map((i, k) => (
          <div key={podium[i].email} className="podium-col">
            <motion.div className="podium-avatar" {...rise(1 + k * 0.2)}>
              {initials(podium[i].name)}
            </motion.div>
            <motion.div className="podium-name" {...rise(1.1 + k * 0.2)}>
              {podium[i].name}
            </motion.div>
            <motion.div
              className={`podium-step p${i + 1}`}
              initial={{ height: 0 }}
              animate={{ height: heights[i] * 1.6 }}
              transition={{ delay: 0.3 + (2 - i) * 0.25, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            >
              <span>{i + 1}º</span>
              <small>{plural(podium[i].commits, 'commit', 'commits')}</small>
            </motion.div>
          </div>
        ))}
      </div>
      {s.contributors.length > 3 && (
        <Note delay={2}>
          E também: {s.contributors.slice(3).map((c) => c.name).join(', ')}.
        </Note>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function Words({ s }: { s: Stats }) {
  const max = s.words[0]?.count ?? 1;
  return (
    <div className="center wide">
      <Kicker>As palavras que mais apareceram nos commits</Kicker>
      <div className="cloud">
        {s.words.map((w, i) => (
          <motion.span
            key={w.word}
            style={{ fontSize: `${0.9 + (w.count / max) * 2.4}rem`, opacity: 0.55 + (w.count / max) * 0.45 }}
            initial={{ opacity: 0, scale: 0.3, rotate: (i % 3) * 8 - 8 }}
            animate={{ opacity: 0.55 + (w.count / max) * 0.45, scale: 1, rotate: 0 }}
            transition={{ delay: 0.3 + i * 0.07, type: 'spring', stiffness: 140, damping: 12 }}
          >
            {w.word}
          </motion.span>
        ))}
      </div>
      {s.words[0] && <Note delay={2.2}>"{s.words[0].word}" apareceu {plural(s.words[0].count, 'vez', 'vezes')}.</Note>}
    </div>
  );
}

function Highlights({ s }: { s: Stats }) {
  const items = [
    s.biggestCommit && {
      emoji: '🐘',
      title: 'O commit gigante',
      body: `"${s.biggestCommit.message}" mexeu em ${fmt(s.biggestCommit.lines)} linhas`,
      meta: fmtDate(s.biggestCommit.dateKey),
    },
    s.latestCommit && {
      emoji: '🌙',
      title: 'O mais tarde da noite',
      body: `"${s.latestCommit.message}"`,
      meta: `${fmtDate(s.latestCommit.dateKey)} às ${String(s.latestCommit.hour).padStart(2, '0')}:${String(s.latestCommit.minute).padStart(2, '0')}`,
    },
    s.shortestMessage && {
      emoji: '🤐',
      title: 'A mensagem mais econômica',
      body: `"${s.shortestMessage.message}"`,
      meta: `por ${s.shortestMessage.author}`,
    },
  ].filter(Boolean) as { emoji: string; title: string; body: string; meta: string }[];
  return (
    <div className="center wide">
      <Kicker>Momentos memoráveis</Kicker>
      <div className="moments">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            className="moment"
            initial={{ opacity: 0, rotateX: -70, y: 30 }}
            animate={{ opacity: 1, rotateX: 0, y: 0 }}
            transition={{ delay: 0.4 + i * 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="moment-emoji">{it.emoji}</span>
            <div>
              <strong>{it.title}</strong>
              <p>{it.body}</p>
              <small>{it.meta}</small>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Tree({ s }: { s: Stats }) {
  return (
    <div className="center full">
      <Kicker>Seu projeto crescendo</Kicker>
      <GrowingTree timeline={s.timeline} duration={13} />
    </div>
  );
}

export function buildSlides(s: Stats): StorySlide[] {
  const slides: (StorySlide | false)[] = [
    { id: 'intro', duration: 5, background: g('#1e0b3a', '#5b1fa8'), render: () => <Intro s={s} /> },
    { id: 'commits', duration: 6, background: g('#04261a', '#0f8a4f'), render: () => <Commits s={s} /> },
    s.linesAdded + s.linesRemoved > 0 && { id: 'lines', duration: 7, background: g('#0b1a3a', '#1b4fd6'), render: () => <Lines s={s} /> },
    s.days.length > 0 && { id: 'heatmap', duration: 8, background: g('#071f1a', '#0c5c4a'), render: () => <Heatmap s={s} /> },
    s.months.length > 1 && { id: 'months', duration: 7, background: g('#3a0b23', '#c2185b'), render: () => <Months s={s} /> },
    { id: 'clock', duration: 8, background: g('#0a0a2e', '#3b2f8f'), render: () => <Clock s={s} /> },
    { id: 'weekdays', duration: 7, background: g('#3a1d04', '#d9640f'), render: () => <Weekdays s={s} /> },
    s.longestStreak.length > 0 && { id: 'streak', duration: 6, background: g('#3a0606', '#e0301e'), render: () => <Streak s={s} /> },
    s.languages.length > 0 && { id: 'languages', duration: 7, background: g('#14062e', '#7b2ff7'), render: () => <Languages s={s} /> },
    s.topFiles.length > 0 && { id: 'files', duration: 8, background: g('#121212', '#1db954'), render: () => <TopFiles s={s} /> },
    s.contributors.length > 1 && { id: 'people', duration: 8, background: g('#2e1a04', '#c9a227'), render: () => <Contributors s={s} /> },
    s.words.length > 3 && { id: 'words', duration: 8, background: g('#04202e', '#0aa3c2'), render: () => <Words s={s} /> },
    { id: 'moments', duration: 9, background: g('#2a0b2e', '#a81fa0'), render: () => <Highlights s={s} /> },
    s.timeline.length > 1 && { id: 'tree', duration: 15, background: g('#020208', '#0d1030'), render: () => <Tree s={s} /> },
    { id: 'summary', duration: 0, background: g('#120724', '#3d0f6b'), render: () => <SummaryCard s={s} /> },
  ];
  return slides.filter(Boolean) as StorySlide[];
}
