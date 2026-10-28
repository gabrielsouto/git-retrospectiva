import { describe, expect, it } from 'vitest';
import '../src/git/buffer-polyfill';
import { MemoryFs } from '../src/git/fsAdapter';
import { normalizeRepoUrl } from '../src/git/loadRepo';
import { cloneRemote, diffCommit, readCommits } from '../src/git/reader';

describe('normalizeRepoUrl', () => {
  it.each([
    ['sindresorhus/slugify', 'https://github.com/sindresorhus/slugify.git'],
    ['https://github.com/sindresorhus/slugify', 'https://github.com/sindresorhus/slugify.git'],
    ['github.com/sindresorhus/slugify.git', 'https://github.com/sindresorhus/slugify.git'],
    ['https://github.com/sindresorhus/slugify/tree/main/src', 'https://github.com/sindresorhus/slugify.git'],
    ['https://gitlab.com/group/sub/project.git', 'https://gitlab.com/group/sub/project.git'],
    ['https://github.com/sindresorhus', null],
    ['nada', null],
  ])('%s', (input, expected) => {
    expect(normalizeRepoUrl(input)).toBe(expected);
  });
});

describe('MemoryFs', () => {
  it('supports the write operations clone needs', async () => {
    const fs = new MemoryFs();
    await fs.promises.mkdir('/a');
    await fs.promises.mkdir('/a/b');
    await fs.promises.writeFile('/a/b/c.txt', 'olá');
    expect(await fs.promises.readFile('/a/b/c.txt', 'utf8')).toBe('olá');
    expect(await fs.promises.readdir('/a')).toEqual(['b']);
    await fs.promises.rename('/a/b/c.txt', '/a/d.txt');
    expect(await fs.promises.readdir('/a/b')).toEqual([]);
    await fs.promises.rmdir('/a/b');
    expect((await fs.promises.stat('/a/d.txt')).isFile()).toBe(true);
    await expect(fs.promises.mkdir('/x/y')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.promises.mkdir('/a')).rejects.toMatchObject({ code: 'EEXIST' });
  });
});

// Opt-in, needs network: NETWORK=1 npx vitest run tests/clone.test.ts
it.runIf(process.env.NETWORK)('clones a public GitHub repository into memory', async () => {
  const fs = new MemoryFs();
  await cloneRemote(fs, 'https://github.com/sindresorhus/slugify.git', process.env.CORS_PROXY ?? '', () => {});
  const commits = await readCommits(fs);
  expect(commits.length).toBeGreaterThan(50);
  expect((await diffCommit(fs, commits[commits.length - 1].hash)).length).toBeGreaterThan(0);
}, 120_000);
