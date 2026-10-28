import { localParts, type Commit } from '../git/types';
import { isNoise, languageOf } from './languages';

export type Period = { kind: 'year'; year: number } | { kind: 'last12' } | { kind: 'all' };

export interface Filters {
  period: Period;
  /** Author email, or null for everyone. */
  email: string | null;
}

export interface CommitRef {
  hash: string;
  message: string;
  author: string;
  dateKey: string;
  hour: number;
  minute: number;
  lines: number;
}

export interface Personality {
  emoji: string;
  title: string;
  description: string;
}

export interface Stats {
  repoName: string;
  periodLabel: string;
  authorLabel: string;
  totalCommits: number;
  merges: number;
  activeDays: number;
  spanDays: number;
  linesAdded: number;
  linesRemoved: number;
  filesTouched: number;
  days: { dateKey: string; count: number }[];
  busiestDay: { dateKey: string; count: number } | null;
  months: { label: string; count: number }[];
  hours: number[];
  weekdays: number[];
  weekendShare: number;
  longestStreak: { length: number; start: string; end: string };
  languages: { name: string; color: string; lines: number; share: number }[];
  topFiles: { path: string; commits: number; lines: number }[];
  contributors: { name: string; email: string; commits: number; added: number; removed: number }[];
  words: { word: string; count: number }[];
  biggestCommit: CommitRef | null;
  latestCommit: CommitRef | null;
  shortestMessage: CommitRef | null;
  personality: Personality;
  /** Ordered oldest first, for the growing-tree animation. */
  timeline: { time: number; author: string; paths: string[] }[];
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const STOPWORDS = new Set(
  ('the and for with from into that this are was were not but add adds added update updates updated ' +
    'use uses using when then than also only some more most into onto over under about after before ' +
    'para com que uma dos das nos nas por pelo pela como mais sem sob sobre entre até ' +
    'merge branch pull request master main origin into the de da do em um os as ao à é e o a').split(/\s+/),
);

export function periodRange(period: Period, now = Date.now()): [number, number] {
  if (period.kind === 'year') return [Date.UTC(period.year, 0, 1), Date.UTC(period.year + 1, 0, 1)];
  if (period.kind === 'last12') return [now - 365 * 86_400_000, now + 86_400_000];
  return [-Infinity, Infinity];
}

export function periodLabel(period: Period) {
  if (period.kind === 'year') return String(period.year);
  if (period.kind === 'last12') return 'últimos 12 meses';
  return 'todo o histórico';
}

/** Commits matching the filters; merge commits are kept so they can be counted. */
export function selectCommits(commits: Commit[], filters: Filters) {
  const [from, to] = periodRange(filters.period);
  return commits.filter((c) => {
    const local = c.time + c.tz * 60_000;
    return local >= from && local < to && (!filters.email || c.email === filters.email);
  });
}

function addDays(dateKey: string, n: number) {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a: string, b: string) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

export function computeStats(repoName: string, all: Commit[], filters: Filters, authorName?: string): Stats {
  const selected = selectCommits(all, filters);
  const commits = selected.filter((c) => c.parents <= 1);
  const merges = selected.length - commits.length;

  const perDay = new Map<string, number>();
  const hours = new Array(24).fill(0);
  const weekdays = new Array(7).fill(0);
  const perMonth = new Map<string, number>();
  const langLines = new Map<string, { color: string; lines: number }>();
  const files = new Map<string, { commits: number; lines: number }>();
  const people = new Map<string, { name: string; email: string; commits: number; added: number; removed: number }>();
  const words = new Map<string, number>();
  let linesAdded = 0;
  let linesRemoved = 0;
  let biggest: CommitRef | null = null;
  let latest: CommitRef | null = null;
  let latestScore = -1;
  let shortest: CommitRef | null = null;

  for (const c of commits) {
    const p = localParts(c);
    perDay.set(p.dateKey, (perDay.get(p.dateKey) ?? 0) + 1);
    hours[p.hour]++;
    weekdays[p.weekday]++;
    const monthKey = `${p.year}-${String(p.month + 1).padStart(2, '0')}`;
    perMonth.set(monthKey, (perMonth.get(monthKey) ?? 0) + 1);

    let added = 0;
    let removed = 0;
    for (const f of c.files ?? []) {
      if (isNoise(f.path)) continue;
      added += f.added;
      removed += f.removed;
      const entry = files.get(f.path) ?? { commits: 0, lines: 0 };
      entry.commits++;
      entry.lines += f.added + f.removed;
      files.set(f.path, entry);
      const lang = languageOf(f.path);
      const le = langLines.get(lang.name) ?? { color: lang.color, lines: 0 };
      le.lines += f.added + f.removed + (f.binary ? 0 : 1);
      langLines.set(lang.name, le);
    }
    linesAdded += added;
    linesRemoved += removed;

    const person = people.get(c.email) ?? { name: c.author, email: c.email, commits: 0, added: 0, removed: 0 };
    person.commits++;
    person.added += added;
    person.removed += removed;
    people.set(c.email, person);

    const subject = c.message.split('\n')[0];
    for (const w of subject.toLowerCase().match(/[\p{L}][\p{L}\p{N}_-]{2,}/gu) ?? []) {
      if (!STOPWORDS.has(w)) words.set(w, (words.get(w) ?? 0) + 1);
    }

    const ref: CommitRef = {
      hash: c.hash, message: subject, author: c.author, dateKey: p.dateKey,
      hour: p.hour, minute: p.minute, lines: added + removed,
    };
    if (!biggest || ref.lines > biggest.lines) biggest = ref;
    // "Latest" means deepest into the night: 4am beats 11pm.
    const score = ((p.hour + 20) % 24) * 60 + p.minute;
    if (score > latestScore) {
      latestScore = score;
      latest = ref;
    }
    if (subject.trim() && (!shortest || subject.trim().length < shortest.message.trim().length)) shortest = ref;
  }

  const dayKeys = [...perDay.keys()].sort();
  const firstDay = dayKeys[0];
  const lastDay = dayKeys[dayKeys.length - 1];

  // Heatmap covers the selected year, or the last 53 weeks of activity otherwise.
  const days: { dateKey: string; count: number }[] = [];
  if (firstDay) {
    let start: string;
    let end: string;
    if (filters.period.kind === 'year') {
      start = `${filters.period.year}-01-01`;
      end = `${filters.period.year}-12-31`;
    } else {
      end = lastDay;
      start = addDays(end, -370) > firstDay ? addDays(end, -370) : firstDay;
    }
    for (let d = start; d <= end; d = addDays(d, 1)) days.push({ dateKey: d, count: perDay.get(d) ?? 0 });
  }

  let longestStreak = { length: 0, start: '', end: '' };
  let runStart = '';
  let prev = '';
  for (const d of dayKeys) {
    if (!prev || diffDays(prev, d) !== 1) runStart = d;
    const length = diffDays(runStart, d) + 1;
    if (length > longestStreak.length) longestStreak = { length, start: runStart, end: d };
    prev = d;
  }

  const busiestDay = dayKeys.reduce<{ dateKey: string; count: number } | null>(
    (best, d) => (!best || perDay.get(d)! > best.count ? { dateKey: d, count: perDay.get(d)! } : best),
    null,
  );

  const monthKeys = [...perMonth.keys()].sort();
  let months: { label: string; count: number }[];
  if (filters.period.kind === 'year') {
    months = MONTHS.map((label, i) => ({
      label,
      count: perMonth.get(`${filters.period.kind === 'year' ? filters.period.year : 0}-${String(i + 1).padStart(2, '0')}`) ?? 0,
    }));
  } else if (monthKeys.length && monthSpan(monthKeys[0], monthKeys[monthKeys.length - 1]) > 24) {
    const perYear = new Map<string, number>();
    for (const [k, v] of perMonth) perYear.set(k.slice(0, 4), (perYear.get(k.slice(0, 4)) ?? 0) + v);
    months = [...perYear.keys()].sort().map((y) => ({ label: y, count: perYear.get(y)! }));
  } else {
    months = [];
    if (monthKeys.length) {
      let [y, m] = monthKeys[0].split('-').map(Number);
      const [ey, em] = monthKeys[monthKeys.length - 1].split('-').map(Number);
      while (y < ey || (y === ey && m <= em)) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        months.push({ label: `${MONTHS[m - 1]}/${String(y).slice(2)}`, count: perMonth.get(key) ?? 0 });
        if (++m > 12) {
          m = 1;
          y++;
        }
      }
    }
  }

  const totalLangLines = [...langLines.values()].reduce((s, l) => s + l.lines, 0) || 1;
  const languages = [...langLines.entries()]
    .map(([name, l]) => ({ name, color: l.color, lines: l.lines, share: l.lines / totalLangLines }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 6);

  const topFiles = [...files.entries()]
    .map(([path, f]) => ({ path, ...f }))
    .sort((a, b) => b.commits - a.commits || b.lines - a.lines)
    .slice(0, 5);

  const total = commits.length || 1;
  const weekendShare = (weekdays[0] + weekdays[6]) / total;

  const timeline = [...commits]
    .sort((a, b) => a.time - b.time)
    .map((c) => ({ time: c.time, author: c.author, paths: (c.files ?? []).map((f) => f.path).filter((p) => !isNoise(p)) }));

  return {
    repoName,
    periodLabel: periodLabel(filters.period),
    authorLabel: filters.email ? authorName ?? filters.email : 'todo o time',
    totalCommits: commits.length,
    merges,
    activeDays: perDay.size,
    spanDays: firstDay ? diffDays(firstDay, lastDay) + 1 : 0,
    linesAdded,
    linesRemoved,
    filesTouched: files.size,
    days,
    busiestDay,
    months,
    hours,
    weekdays,
    weekendShare,
    longestStreak,
    languages,
    topFiles,
    contributors: [...people.values()].sort((a, b) => b.commits - a.commits).slice(0, 5),
    words: [...words.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 24),
    biggestCommit: biggest,
    latestCommit: latest,
    shortestMessage: shortest,
    personality: personalityOf(hours, weekendShare, commits.length),
    timeline,
  };
}

function monthSpan(a: string, b: string) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am) + 1;
}

export function personalityOf(hours: number[], weekendShare: number, total: number): Personality {
  const share = (from: number, to: number) => {
    let n = 0;
    for (let h = from; h !== to; h = (h + 1) % 24) n += hours[h];
    return n / (total || 1);
  };
  if (share(22, 5) >= 0.3) {
    return { emoji: '🦉', title: 'Coruja noturna', description: 'Quando a casa dorme, o seu código acorda.' };
  }
  if (share(5, 10) >= 0.3) {
    return { emoji: '🌅', title: 'Madrugador', description: 'Seus commits chegam antes do café esfriar.' };
  }
  if (weekendShare >= 0.3) {
    return { emoji: '⚔️', title: 'Guerreiro de fim de semana', description: 'Sábado e domingo também são dias de deploy.' };
  }
  if (share(18, 22) >= 0.35) {
    return { emoji: '🌆', title: 'Turno da noite', description: 'O expediente acaba, a inspiração começa.' };
  }
  return { emoji: '🕘', title: 'Relógio suíço', description: 'Das 9 às 18, com a precisão de um cronômetro.' };
}

export function availableYears(commits: Commit[]) {
  const years = new Set(commits.map((c) => localParts(c).year));
  return [...years].sort((a, b) => b - a);
}

export function authorsOf(commits: Commit[]) {
  const map = new Map<string, { email: string; name: string; commits: number }>();
  for (const c of commits) {
    const a = map.get(c.email) ?? { email: c.email, name: c.author, commits: 0 };
    a.commits++;
    map.set(c.email, a);
  }
  return [...map.values()].sort((a, b) => b.commits - a.commits);
}
