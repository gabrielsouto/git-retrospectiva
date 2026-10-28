import { describe, expect, it } from 'vitest';
import '../src/git/buffer-polyfill';
import { parseGitLog, GIT_LOG_COMMAND } from '../src/git/loadRepo';
import { diffCommit, readCommits } from '../src/git/reader';
import { fsFromDisk, git, makeRepo } from './helpers';

describe('reading a repository from .git', () => {
  const dir = makeRepo();

  for (const packed of [false, true]) {
    it(`matches git numstat (${packed ? 'packfile' : 'loose objects'})`, async () => {
      if (packed) git(dir, 'gc', '-q', '--aggressive');
      const fs = fsFromDisk(dir);
      const commits = await readCommits(fs);
      const expected = parseGitLog(git(dir, 'log', '--numstat', '--date=iso-strict', '--format=@@@%H|%P|%an|%ae|%ad|%s'));
      expect(commits.map((c) => c.hash)).toEqual(expected.commits.map((c) => c.hash));

      for (const c of commits) {
        const e = expected.commits.find((x) => x.hash === c.hash)!;
        expect(c.email).toBe(e.email);
        expect(c.tz).toBe(e.tz);
        expect(c.time).toBe(e.time);
        expect(c.parents).toBe(e.parents);
        if (c.parents > 1) continue;
        const files = (await diffCommit(fs, c.hash)).sort((a, b) => a.path.localeCompare(b.path));
        const want = e.files!.sort((a, b) => a.path.localeCompare(b.path));
        expect(files).toEqual(want);
      }
    });
  }
});

describe('parseGitLog', () => {
  it('handles renames and binary files', () => {
    const repo = parseGitLog(
      [
        '@@@abc|def|Ana|ANA@x.dev|2025-01-02T03:04:05+05:30|feat: a | b',
        '3\t1\tsrc/{old => new}/file.ts',
        '-\t-\timg.png',
        '1\t0\told.md => new.md',
      ].join('\n'),
    );
    const [c] = repo.commits;
    expect(c.message).toBe('feat: a | b');
    expect(c.email).toBe('ana@x.dev');
    expect(c.tz).toBe(330);
    expect(c.files).toEqual([
      { path: 'src/new/file.ts', added: 3, removed: 1, binary: false },
      { path: 'img.png', added: 0, removed: 0, binary: true },
      { path: 'new.md', added: 1, removed: 0, binary: false },
    ]);
  });

  it('documents a command that produces the expected format', () => {
    expect(GIT_LOG_COMMAND).toContain('@@@%H|%P|%an|%ae|%ad|%s');
  });

  it('rejects text without commits', () => {
    expect(() => parseGitLog('nada aqui')).toThrow();
  });
});
