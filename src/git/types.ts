export interface FileChange {
  path: string;
  added: number;
  removed: number;
  binary?: boolean;
}

export interface Commit {
  hash: string;
  author: string;
  email: string;
  /** Unix time in milliseconds (UTC). */
  time: number;
  /** Author timezone, in minutes east of UTC (e.g. -180 for UTC-3). */
  tz: number;
  message: string;
  parents: number;
  /** Filled in once the diff has been computed. */
  files?: FileChange[];
}

export interface Repo {
  name: string;
  commits: Commit[];
  /** Computes file changes for the given commits, in place. */
  loadDiffs(commits: Commit[], onProgress: (done: number, total: number) => void): Promise<void>;
}

/** Calendar fields in the author's own timezone. */
export function localParts(c: Commit) {
  const d = new Date(c.time + c.tz * 60_000);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  return {
    year,
    month,
    day,
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),
    dateKey: `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}
