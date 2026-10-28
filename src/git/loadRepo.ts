import type { Commit, Repo } from './types';
import type { WorkerRequest, WorkerResponse, WorkerSource } from './reader.worker';

export type Progress = { label: string; done: number; total: number };

export const supportsDirectoryPicker = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = (window as unknown as { showDirectoryPicker: (o?: object) => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;
  return picker({ mode: 'read', id: 'git-retrospectiva' });
}

export function filesFromInput(list: FileList) {
  return [...list]
    .filter((f) => f.webkitRelativePath.includes('/.git/') || f.webkitRelativePath.startsWith('.git/'))
    .map((file) => ({ path: file.webkitRelativePath, file }));
}

export function openRepo(source: WorkerSource, onProgress: (p: Progress) => void): Promise<Repo> {
  const worker = new Worker(new URL('./reader.worker.ts', import.meta.url), { type: 'module' });
  let pending: { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void } | null = null;

  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const msg = ev.data;
    if (msg.type === 'progress') onProgress(msg);
    else if (msg.type === 'error') pending?.reject(new Error(msg.message));
    else pending?.resolve(msg);
  };
  worker.onerror = (ev) => pending?.reject(new Error(ev.message || 'Falha no worker'));

  const request = (req: WorkerRequest) =>
    new Promise<WorkerResponse>((resolve, reject) => {
      pending = { resolve, reject };
      worker.postMessage(req);
    });

  return request({ type: 'open', source }).then((res) => {
    if (res.type !== 'opened') throw new Error('Resposta inesperada');
    const repo: Repo = {
      name: res.name,
      commits: res.commits,
      async loadDiffs(commits, progress) {
        const todo = commits.filter((c) => !c.files);
        const byHash = new Map(todo.map((c) => [c.hash, c]));
        const prev = onProgress;
        onProgress = (p) => progress(p.done, p.total);
        try {
          const out = await request({ type: 'diff', hashes: todo.map((c) => c.hash) });
          if (out.type !== 'diffs') throw new Error('Resposta inesperada');
          for (const r of out.results) {
            const c = byHash.get(r.hash);
            if (c) c.files = r.files;
          }
        } finally {
          onProgress = prev;
        }
      },
    };
    return repo;
  });
}

/** The command users run to produce input for {@link parseGitLog}. */
export const GIT_LOG_COMMAND =
  "git log --numstat --date=iso-strict --format='@@@%H|%P|%an|%ae|%ad|%s'";

export function parseGitLog(text: string, name = 'repositório'): Repo {
  const commits: Commit[] = [];
  let current: Commit | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('@@@')) {
      const [hash, parents, author, email, date, ...subject] = line.slice(3).split('|');
      const m = /([+-])(\d\d):?(\d\d)$/.exec(date ?? '');
      const tz = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
      const time = Date.parse(date);
      if (!hash || Number.isNaN(time)) {
        current = null;
        continue;
      }
      current = {
        hash,
        author: author || 'desconhecido',
        email: (email || author || '').toLowerCase(),
        time,
        tz,
        message: subject.join('|'),
        parents: parents ? parents.split(' ').filter(Boolean).length : 0,
        files: [],
      };
      commits.push(current);
    } else if (current && line) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
      if (!m) continue;
      const binary = m[1] === '-';
      current.files!.push({
        path: renameTarget(m[3]),
        added: binary ? 0 : Number(m[1]),
        removed: binary ? 0 : Number(m[2]),
        binary,
      });
    }
  }
  if (!commits.length) throw new Error('Não encontrei commits nesse texto. Use o comando exatamente como mostrado.');
  return { name, commits, loadDiffs: async () => {} };
}

/** numstat prints renames as `dir/{old => new}/file` or `old => new`. */
function renameTarget(path: string) {
  if (!path.includes(' => ')) return path;
  const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(path);
  if (brace) return (brace[1] + brace[3] + brace[4]).replace(/\/\//g, '/');
  return path.split(' => ')[1];
}
