import { it } from 'vitest';
import '../src/git/buffer-polyfill';
import { parseGitLog } from '../src/git/loadRepo';
import { diffCommit, readCommits } from '../src/git/reader';
import { fsFromDisk, git } from './helpers';

// Opt-in: REPO=/path/to/repo [N=1000] npx vitest run tests/benchmark.test.ts
it.runIf(process.env.REPO)('reads a real repository and compares with git numstat', async () => {
  const dir = process.env.REPO!;
  const t = Date.now();
  const fs = fsFromDisk(dir);
  const commits = await readCommits(fs);
  const t1 = Date.now();
  const expected = parseGitLog(git(dir, 'log', '--numstat', '--date=iso-strict', '--format=@@@%H|%P|%an|%ae|%ad|%s'));
  let mismatch = 0, total = 0, ours = 0, theirs = 0;
  const sample = commits.filter((c) => c.parents <= 1).slice(0, Number(process.env.N ?? 1e9));
  for (const c of sample) {
    const files = await diffCommit(fs, c.hash);
    const e = expected.commits.find((x) => x.hash === c.hash)!;
    const a = files.reduce((s, f) => s + f.added + f.removed, 0);
    const b = e.files!.reduce((s, f) => s + f.added + f.removed, 0);
    ours += a; theirs += b; total++;
    if (a !== b) mismatch++;
  }
  console.log({ commits: commits.length, logMs: t1 - t, diffMs: Date.now() - t1, total, mismatch, ours, theirs });
}, 600_000);
