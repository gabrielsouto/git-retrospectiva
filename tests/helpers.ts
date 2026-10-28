import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { ReadOnlyFs } from '../src/git/fsAdapter';

export function git(cwd: string, ...args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1 << 30,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
}

/** Creates a small repository with edits, renames, deletions, a binary file and a merge. */
export function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'retro-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Ana Lima');
  git(dir, 'config', 'user.email', 'Ana@Exemplo.dev');
  git(dir, 'config', 'commit.gpgsign', 'false');
  const write = (path: string, content: string | Buffer) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  };
  const commit = (msg: string, date: string, author = 'Ana Lima <Ana@Exemplo.dev>') => {
    git(dir, 'add', '-A');
    execFileSync('git', ['commit', '-q', '-m', msg, `--author=${author}`, `--date=${date}`], {
      cwd: dir,
      env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
  };
  write('README.md', '# Demo\n\nOlá\n');
  write('src/index.ts', 'export const a = 1;\nexport const b = 2;\n');
  commit('feat: primeira versão', '2025-03-03T09:15:00-03:00');
  write('src/index.ts', 'export const a = 1;\nexport const b = 3;\nexport const c = 4;\n');
  write('src/util/math.ts', Array.from({ length: 50 }, (_, i) => `export const n${i} = ${i};`).join('\n') + '\n');
  commit('feat: adiciona utilitários de math', '2025-03-04T23:40:00-03:00');
  write('logo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 1, 2, 3]));
  write('README.md', '# Demo\n\nOlá mundo\nSegunda linha\n');
  commit('docs: readme', '2025-03-05T10:00:00-03:00', 'Bruno Costa <bruno@exemplo.dev>');
  git(dir, 'checkout', '-q', '-b', 'feature');
  write('src/feature.ts', 'export function f() {\n  return 42;\n}\n');
  commit('feat: feature', '2025-03-08T14:00:00-03:00');
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'rm', '-q', 'src/util/math.ts');
  commit('refactor: remove math', '2025-03-09T03:30:00-03:00');
  execFileSync('git', ['merge', '-q', '--no-ff', '-m', 'Merge feature', 'feature'], {
    cwd: dir,
    env: { ...process.env, GIT_COMMITTER_DATE: '2025-03-10T12:00:00-03:00', GIT_AUTHOR_DATE: '2025-03-10T12:00:00-03:00', GIT_CONFIG_GLOBAL: '/dev/null' },
  });
  return dir;
}

/** Indexes `<dir>/.git` the same way the browser worker does. */
export function fsFromDisk(dir: string) {
  const fs = new ReadOnlyFs();
  const root = join(dir, '.git');
  const walk = (p: string) => {
    for (const name of readdirSync(p)) {
      const full = join(p, name);
      if (statSync(full).isDirectory()) walk(full);
      else {
        const bytes = readFileSync(full);
        fs.add('/.git/' + relative(root, full), async () => new File([bytes], name));
      }
    }
  };
  walk(root);
  return fs;
}
