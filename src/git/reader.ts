import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import type { MemoryFs } from './fsAdapter';
import { countLineChanges, isBinary } from './lineDiff';
import type { Commit, FileChange } from './types';

export const GITDIR = '/.git';
const MAX_BLOB_BYTES = 1024 * 1024;
const cache = {};

const PHASES: Record<string, string> = {
  'Counting objects': 'Contando objetos no servidor',
  'Compressing objects': 'Compactando objetos no servidor',
  'Receiving objects': 'Baixando o histórico',
  'Resolving deltas': 'Montando o histórico',
  'Analyzing workdir': 'Preparando',
  'Updating workdir': 'Preparando',
};

/** Clones only the git database (no working tree) of a remote repository into memory. */
export async function cloneRemote(
  fs: MemoryFs,
  url: string,
  corsProxy: string,
  onProgress: (label: string, done: number, total: number) => void,
) {
  try {
    await git.clone({
      fs,
      http,
      dir: '/',
      gitdir: GITDIR,
      url,
      corsProxy: corsProxy || undefined,
      singleBranch: true,
      noCheckout: true,
      noTags: true,
      cache,
      onProgress: (e) => onProgress(PHASES[e.phase] ?? e.phase, e.loaded, e.total ?? 0),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/401|403|404|Unauthorized|Forbidden|Not Found/i.test(message)) {
      throw new Error(`Não consegui acessar ${url}. Confira se a URL está certa e se o repositório é público.`);
    }
    if (/fetch|network|CORS/i.test(message)) {
      throw new Error(`Falha de rede ao baixar o repositório (${message}). O proxy CORS pode estar fora do ar ou limitando requisições.`);
    }
    throw e;
  }
}

export async function readCommits(fs: MemoryFs): Promise<Commit[]> {
  let entries;
  try {
    entries = await git.log({ fs, gitdir: GITDIR, ref: 'HEAD', cache });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/shallow|Could not find/i.test(message)) {
      throw new Error(`Não consegui ler todo o histórico (${message}). Clones rasos (--depth) não são suportados por completo.`);
    }
    throw e;
  }
  const commits: Commit[] = entries.map((e) => ({
    hash: e.oid,
    author: e.commit.author.name,
    email: e.commit.author.email.toLowerCase(),
    time: e.commit.author.timestamp * 1000,
    tz: -e.commit.author.timezoneOffset,
    message: e.commit.message.trim(),
    parents: e.commit.parent.length,
  }));
  return commits;
}

type TreeEntry = { path: string; oid: string; type: string };

async function readTree(fs: MemoryFs, oid: string | null): Promise<TreeEntry[]> {
  if (!oid) return [];
  const { tree } = await git.readTree({ fs, gitdir: GITDIR, oid, cache });
  return tree;
}

/** Yields [path, oldBlob, newBlob] for every blob that differs between two trees. */
async function diffTrees(fs: MemoryFs, a: string | null, b: string | null, prefix: string, out: [string, string | null, string | null][]) {
  if (a === b) return;
  const [ta, tb] = await Promise.all([readTree(fs, a), readTree(fs, b)]);
  const byName = new Map<string, [TreeEntry | null, TreeEntry | null]>();
  for (const e of ta) byName.set(e.path, [e, null]);
  for (const e of tb) byName.set(e.path, [byName.get(e.path)?.[0] ?? null, e]);
  for (const [name, [ea, eb]] of byName) {
    if (ea?.oid === eb?.oid) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    const aTree = ea?.type === 'tree' ? ea.oid : null;
    const bTree = eb?.type === 'tree' ? eb.oid : null;
    const aBlob = ea?.type === 'blob' ? ea.oid : null;
    const bBlob = eb?.type === 'blob' ? eb.oid : null;
    if (aTree || bTree) await diffTrees(fs, aTree, bTree, path, out);
    if (aBlob || bBlob) out.push([path, aBlob, bBlob]);
  }
}

async function readText(fs: MemoryFs, oid: string | null): Promise<string | null | 'binary' | 'large'> {
  if (!oid) return null;
  const { blob } = await git.readBlob({ fs, gitdir: GITDIR, oid, cache });
  if (blob.byteLength > MAX_BLOB_BYTES) return 'large';
  if (isBinary(blob)) return 'binary';
  return new TextDecoder().decode(blob);
}

export async function diffCommit(fs: MemoryFs, hash: string): Promise<FileChange[]> {
  const { commit } = await git.readCommit({ fs, gitdir: GITDIR, oid: hash, cache });
  let parentTree: string | null = null;
  if (commit.parent[0]) {
    const parent = await git.readCommit({ fs, gitdir: GITDIR, oid: commit.parent[0], cache }).catch(() => null);
    parentTree = parent?.commit.tree ?? null;
  }
  const changed: [string, string | null, string | null][] = [];
  await diffTrees(fs, parentTree, commit.tree, '', changed);
  const files: FileChange[] = [];
  for (const [path, before, after] of changed) {
    const [a, b] = await Promise.all([readText(fs, before), readText(fs, after)]);
    if (a === 'binary' || b === 'binary' || a === 'large' || b === 'large') {
      files.push({ path, added: 0, removed: 0, binary: true });
    } else {
      files.push({ path, ...countLineChanges(a, b), binary: false });
    }
  }
  return files;
}

