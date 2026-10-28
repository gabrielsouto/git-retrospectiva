import { Buffer } from 'buffer';

/**
 * A read-only, in-memory index of a `.git` directory that satisfies the subset
 * of the Node `fs.promises` API isomorphic-git uses for reading.
 */
export type FileSource = () => Promise<File>;

function enoent(path: string) {
  const err = new Error(`ENOENT: no such file or directory, '${path}'`) as Error & { code: string };
  err.code = 'ENOENT';
  return err;
}

function normalize(path: string) {
  return '/' + path.split('/').filter((p) => p && p !== '.').join('/');
}

export class ReadOnlyFs {
  private files = new Map<string, FileSource>();
  private dirs = new Map<string, Set<string>>();
  private cache = new Map<string, Uint8Array>();

  constructor() {
    this.dirs.set('/', new Set());
  }

  add(path: string, source: FileSource) {
    const p = normalize(path);
    this.files.set(p, source);
    let child = p;
    while (child !== '/') {
      const parent = child.slice(0, child.lastIndexOf('/')) || '/';
      const name = child.slice(child.lastIndexOf('/') + 1);
      if (!this.dirs.has(parent)) this.dirs.set(parent, new Set());
      this.dirs.get(parent)!.add(name);
      child = parent;
    }
  }

  has(path: string) {
    return this.files.has(normalize(path));
  }

  private async bytes(p: string) {
    const cached = this.cache.get(p);
    if (cached) return cached;
    const src = this.files.get(p);
    if (!src) throw enoent(p);
    const data = new Uint8Array(await (await src()).arrayBuffer());
    // Packfiles are read many times; small loose files are cheap to re-read.
    if (p.endsWith('.pack') || p.endsWith('.idx') || data.byteLength < 64 * 1024) this.cache.set(p, data);
    return data;
  }

  promises = {
    readFile: async (path: string, opts?: { encoding?: string } | string) => {
      const p = normalize(path);
      const data = await this.bytes(p);
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      if (encoding === 'utf8') return new TextDecoder().decode(data);
      return Buffer.from(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
    },
    readdir: async (path: string) => {
      const entries = this.dirs.get(normalize(path));
      if (!entries) throw enoent(path);
      return [...entries];
    },
    stat: async (path: string) => this.statSync(path),
    lstat: async (path: string) => this.statSync(path),
    readlink: async (path: string) => {
      throw enoent(path);
    },
    writeFile: async () => {
      throw new Error('read-only filesystem');
    },
    mkdir: async () => {
      throw new Error('read-only filesystem');
    },
    rmdir: async () => {
      throw new Error('read-only filesystem');
    },
    unlink: async () => {
      throw new Error('read-only filesystem');
    },
    symlink: async () => {
      throw new Error('read-only filesystem');
    },
    chmod: async () => {
      throw new Error('read-only filesystem');
    },
  };

  private statSync(path: string) {
    const p = normalize(path);
    const isFile = this.files.has(p);
    const isDir = this.dirs.has(p);
    if (!isFile && !isDir) throw enoent(path);
    return {
      type: isFile ? 'file' : 'dir',
      mode: isFile ? 0o100644 : 0o40000,
      size: 0,
      ino: 0,
      mtimeMs: 0,
      ctimeMs: 0,
      uid: 1,
      gid: 1,
      dev: 1,
      isFile: () => isFile,
      isDirectory: () => isDir && !isFile,
      isSymbolicLink: () => false,
    };
  }
}
