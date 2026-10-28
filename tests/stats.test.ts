import { describe, expect, it } from 'vitest';
import { demoRepo } from '../src/git/demo';
import { parseGitLog } from '../src/git/loadRepo';
import { countLineChanges } from '../src/git/lineDiff';
import { computeStats, personalityOf } from '../src/stats/compute';

const log = [
  '@@@1|0|Ana|ana@x.dev|2025-03-03T23:30:00-03:00|feat: login',
  '10\t2\tsrc/a.ts',
  '500\t0\tpackage-lock.json',
  '@@@2|1|Ana|ana@x.dev|2025-03-04T01:10:00-03:00|fix: login quebrado',
  '1\t1\tsrc/a.ts',
  '@@@3|2|Bruno|bruno@x.dev|2025-03-05T10:00:00-03:00|docs',
  '4\t0\tREADME.md',
  '@@@4|3 9|Ana|ana@x.dev|2025-03-08T10:00:00-03:00|Merge branch x',
  '@@@5|4|Ana|ana@x.dev|2024-12-31T23:00:00-03:00|ano anterior',
  '1\t0\tsrc/a.ts',
].join('\n');

describe('computeStats', () => {
  const repo = parseGitLog(log, 'demo');

  it('aggregates a year in the author timezone', () => {
    const s = computeStats('demo', repo.commits, { period: { kind: 'year', year: 2025 }, email: null });
    expect(s.totalCommits).toBe(3);
    expect(s.merges).toBe(1);
    expect(s.linesAdded).toBe(15); // lockfile ignored
    expect(s.linesRemoved).toBe(3);
    expect(s.activeDays).toBe(3);
    expect(s.longestStreak).toEqual({ length: 3, start: '2025-03-03', end: '2025-03-05' });
    expect(s.hours[23]).toBe(1);
    expect(s.hours[1]).toBe(1);
    expect(s.topFiles[0]).toMatchObject({ path: 'src/a.ts', commits: 2 });
    expect(s.languages[0].name).toBe('TypeScript');
    expect(s.latestCommit?.hash).toBe('2');
    expect(s.shortestMessage?.message).toBe('docs');
    expect(s.biggestCommit?.hash).toBe('1');
    expect(s.days).toHaveLength(365);
    expect(s.months).toHaveLength(12);
    expect(s.months[2].count).toBe(3);
    expect(s.monthsByYear).toBe(false);
    expect(s.peakMonth).toEqual({ label: 'março de 2025', count: 3 });
    expect(s.contributors.map((c) => c.name)).toEqual(['Ana', 'Bruno']);
    expect(s.words.find((w) => w.word === 'login')?.count).toBe(2);
  });

  it('filters by author', () => {
    const s = computeStats('demo', repo.commits, { period: { kind: 'all' }, email: 'bruno@x.dev' }, 'Bruno');
    expect(s.totalCommits).toBe(1);
    expect(s.authorLabel).toBe('Bruno');
  });

  it('groups long histories by year but still names the peak month', () => {
    const long = parseGitLog(
      [
        '@@@a||Ana|ana@x.dev|2018-10-31T10:00:00-03:00|um',
        '@@@b||Ana|ana@x.dev|2018-10-30T10:00:00-03:00|dois',
        '@@@c||Ana|ana@x.dev|2021-02-01T10:00:00-03:00|três',
      ].join('\n'),
    );
    const s = computeStats('x', long.commits, { period: { kind: 'all' }, email: null });
    expect(s.monthsByYear).toBe(true);
    expect(s.months.map((m) => m.label)).toEqual(['2018', '2019', '2020', '2021']);
    expect(s.peakMonth).toEqual({ label: 'outubro de 2018', count: 2 });
  });

  it('builds stats for the demo repository', () => {
    const demo = demoRepo();
    const s = computeStats(demo.name, demo.commits, { period: { kind: 'all' }, email: null });
    expect(s.totalCommits).toBeGreaterThan(100);
    expect(s.contributors.length).toBeGreaterThan(1);
  });
});

describe('personalityOf', () => {
  it('detects night owls', () => {
    const hours = new Array(24).fill(0);
    hours[23] = 5;
    hours[14] = 5;
    expect(personalityOf(hours, 0, 10).title).toBe('Coruja noturna');
  });
});

describe('countLineChanges', () => {
  it('counts moved and edited lines like numstat', () => {
    expect(countLineChanges('a\nb\nc\n', 'a\nB\nc\nd\n')).toEqual({ added: 2, removed: 1 });
    expect(countLineChanges(null, 'x\ny')).toEqual({ added: 2, removed: 0 });
    expect(countLineChanges('x\n', null)).toEqual({ added: 0, removed: 1 });
  });
});

describe('safeFilename', () => {
  it('strips accents and spaces', async () => {
    const { safeFilename } = await import('../src/components/format');
    expect(safeFilename('retrospectiva-Meu Repo-todo o histórico.mp4')).toBe('retrospectiva-meu-repo-todo-o-historico.mp4');
  });
});
