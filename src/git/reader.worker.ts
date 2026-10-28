import './buffer-polyfill';
import { MemoryFs } from './fsAdapter';
import { cloneRemote, diffCommit, GITDIR, readCommits } from './reader';
import type { Commit, FileChange } from './types';

export type WorkerSource =
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  | { kind: 'files'; files: { path: string; file: File }[] }
  | { kind: 'url'; url: string; corsProxy: string };

export type WorkerRequest =
  | { type: 'open'; source: WorkerSource }
  | { type: 'diff'; hashes: string[] };

export type WorkerResponse =
  | { type: 'progress'; label: string; done: number; total: number }
  | { type: 'opened'; name: string; commits: Commit[] }
  | { type: 'diffs'; results: { hash: string; files: FileChange[] }[] }
  | { type: 'error'; message: string };

let fs: MemoryFs | null = null;

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

async function indexHandle(root: FileSystemDirectoryHandle) {
  const index = new MemoryFs();
  let gitDir: FileSystemDirectoryHandle;
  try {
    gitDir = await root.getDirectoryHandle('.git');
  } catch {
    // The user may have picked the .git folder itself.
    try {
      await root.getFileHandle('HEAD');
      gitDir = root;
    } catch {
      throw new Error('Essa pasta não parece ser um repositório git (não encontrei a pasta .git).');
    }
  }
  let count = 0;
  const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, entry] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      const path = `${prefix}/${name}`;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path);
      else {
        const fh = entry as FileSystemFileHandle;
        index.add(path, () => fh.getFile());
        if (++count % 500 === 0) post({ type: 'progress', label: 'Lendo a pasta .git', done: count, total: 0 });
      }
    }
  };
  // Hooks, logs and the index are never needed and can be large.
  for await (const [name, entry] of (gitDir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (['hooks', 'logs', 'index', 'lfs', 'modules'].includes(name)) continue;
    if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, `${GITDIR}/${name}`);
    else {
      const fh = entry as FileSystemFileHandle;
      index.add(`${GITDIR}/${name}`, () => fh.getFile());
    }
  }
  return { index, name: gitDir === root ? 'repositório' : root.name };
}

function indexFiles(files: { path: string; file: File }[]) {
  const index = new MemoryFs();
  let name = 'repositório';
  for (const { path, file } of files) {
    const parts = path.split('/');
    const at = parts.indexOf('.git');
    if (at === -1) continue;
    if (at > 0) name = parts[at - 1];
    const rest = parts.slice(at + 1);
    if (['hooks', 'logs', 'index', 'lfs', 'modules'].includes(rest[0])) continue;
    index.add(`${GITDIR}/${rest.join('/')}`, async () => file);
  }
  if (!index.has(`${GITDIR}/HEAD`)) {
    throw new Error('Não encontrei a pasta .git dentro do que foi selecionado.');
  }
  return { index, name };
}

async function indexRemote(url: string, corsProxy: string) {
  const index = new MemoryFs();
  await cloneRemote(index, url, corsProxy, (label, done, total) => post({ type: 'progress', label, done, total }));
  const name = url.replace(/\.git$/, '').split('/').filter(Boolean).pop() ?? 'repositório';
  return { index, name };
}

async function open(source: WorkerSource) {
  const { index, name } =
    source.kind === 'handle'
      ? await indexHandle(source.handle)
      : source.kind === 'url'
        ? await indexRemote(source.url, source.corsProxy)
        : indexFiles(source.files);
  fs = index;
  if (!index.has(`${GITDIR}/HEAD`)) throw new Error('Arquivo .git/HEAD não encontrado.');
  post({ type: 'progress', label: 'Lendo o histórico', done: 0, total: 0 });
  const commits = await readCommits(index);
  post({ type: 'opened', name, commits });
}

async function diff(hashes: string[]) {
  if (!fs) throw new Error('Repositório não aberto');
  const results: { hash: string; files: FileChange[] }[] = [];
  for (let i = 0; i < hashes.length; i++) {
    try {
      results.push({ hash: hashes[i], files: await diffCommit(fs, hashes[i]) });
    } catch {
      results.push({ hash: hashes[i], files: [] });
    }
    if (i % 10 === 0) post({ type: 'progress', label: 'Analisando as mudanças', done: i, total: hashes.length });
  }
  post({ type: 'diffs', results });
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  try {
    if (ev.data.type === 'open') await open(ev.data.source);
    else await diff(ev.data.hashes);
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
