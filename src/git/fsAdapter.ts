import { Buffer } from 'buffer';

/**
 * An in-memory filesystem that satisfies the subset of the Node `fs.promises`
 * API isomorphic-git uses. Files can be lazy (a local `.git` folder picked by
 * the user, read on demand) or written in memory (a repository cloned over
 * HTTP).
 */
export type FileSource = () => Promise<File>;

function fsError(code: string, path: string) {
  const err = new Error(`${code}: '${path}'`) as Error & { code: string };
  err.code = code;
  return err;
}

function normalize(path: string) {
  return '/' + path.split('/').filter((p) => p && p !== '.').join('/');
}

function parentOf(p: string) {
  return p.slice(0, p.lastIndexOf('/')) || '/';
}

function toBytes(data: Uint8Array | ArrayBuffer | string) {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export class MemoryFs {
  private files = new Map<string, FileSource | Uint8Array>();
  private dirs = new Map<string, Set<string>>([['/', new Set()]]);
  private cache = new Map<string, Uint8Array>();

  /** Registers a lazily read file, creating its parent directories. */
  add(path: string, source: FileSource | Uint8Array) {
    const p = normalize(path);
    this.files.set(p, source);
    this.cache.delete(p);
    this.ensureDir(parentOf(p));
    this.dirs.get(parentOf(p))!.add(p.slice(p.lastIndexOf('/') + 1));
  }

  has(path: string) {
    return this.files.has(normalize(path));
  }

  private ensureDir(p: string) {
    let child = p;
    while (!this.dirs.has(child)) {
      this.dirs.set(child, new Set());
      const parent = parentOf(child);
      this.ensureDir(parent);
      this.dirs.get(parent)!.add(child.slice(child.lastIndexOf('/') + 1));
      child = parent;
    }
  }

  private async bytes(p: string) {
    const src = this.files.get(p);
    if (!src) throw fsError('ENOENT', p);
    if (src instanceof Uint8Array) return src;
    const cached = this.cache.get(p);
    if (cached) return cached;
    const data = new Uint8Array(await (await src()).arrayBuffer());
    // Packfiles are read many times; small loose files are cheap to re-read.
    if (p.endsWith('.pack') || p.endsWith('.idx') || data.byteLength < 64 * 1024) this.cache.set(p, data);
    return data;
  }

  private remove(p: string) {
    this.files.delete(p);
    this.cache.delete(p);
    this.dirs.get(parentOf(p))?.delete(p.slice(p.lastIndexOf('/') + 1));
  }

  promises = {
    readFile: async (path: string, opts?: { encoding?: string } | string) => {
      const data = await this.bytes(normalize(path));
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      if (encoding === 'utf8') return new TextDecoder().decode(data);
      return Buffer.from(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    },
    writeFile: async (path: string, data: Uint8Array | ArrayBuffer | string) => {
      const p = normalize(path);
      if (!this.dirs.has(parentOf(p))) throw fsError('ENOENT', path);
      // Copy: callers may reuse the buffer they hand us.
      this.add(p, toBytes(data).slice());
    },
    unlink: async (path: string) => {
      const p = normalize(path);
      if (!this.files.has(p)) throw fsError('ENOENT', path);
      this.remove(p);
    },
    readdir: async (path: string) => {
      const entries = this.dirs.get(normalize(path));
      if (!entries) throw fsError('ENOENT', path);
      return [...entries];
    },
    mkdir: async (path: string) => {
      const p = normalize(path);
      if (this.dirs.has(p) || this.files.has(p)) throw fsError('EEXIST', path);
      if (!this.dirs.has(parentOf(p))) throw fsError('ENOENT', path);
      this.ensureDir(p);
    },
    rmdir: async (path: string) => {
      const p = normalize(path);
      const entries = this.dirs.get(p);
      if (!entries) throw fsError('ENOENT', path);
      if (entries.size) throw fsError('ENOTEMPTY', path);
      this.dirs.delete(p);
      this.dirs.get(parentOf(p))?.delete(p.slice(p.lastIndexOf('/') + 1));
    },
    rename: async (from: string, to: string) => {
      const a = normalize(from);
      const src = this.files.get(a);
      if (!src) throw fsError('ENOENT', from);
      this.remove(a);
      this.add(to, src);
    },
    stat: async (path: string) => this.statSync(path),
    lstat: async (path: string) => this.statSync(path),
    readlink: async (path: string) => {
      throw fsError('ENOENT', path);
    },
    symlink: async (_target: string, path: string) => {
      throw fsError('EPERM', path);
    },
    chmod: async () => {},
  };

  private statSync(path: string) {
    const p = normalize(path);
    const file = this.files.get(p);
    const isFile = file !== undefined;
    const isDir = !isFile && this.dirs.has(p);
    if (!isFile && !isDir) throw fsError('ENOENT', path);
    return {
      type: isFile ? 'file' : 'dir',
      mode: isFile ? 0o100644 : 0o40000,
      size: file instanceof Uint8Array ? file.byteLength : 0,
      ino: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      uid: 1,
      gid: 1,
      dev: 1,
      isFile: () => isFile,
      isDirectory: () => isDir,
      isSymbolicLink: () => false,
    };
  }
}
