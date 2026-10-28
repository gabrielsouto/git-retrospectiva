const nf = new Intl.NumberFormat('pt-BR');

export const fmt = (n: number) => nf.format(Math.round(n));

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export function fmtDate(dateKey: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  if (!dateKey) return '';
  return new Date(dateKey + 'T12:00:00Z').toLocaleDateString('pt-BR', { ...opts, timeZone: 'UTC' });
}

export const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function plural(n: number, one: string, many: string) {
  return `${fmt(n)} ${n === 1 ? one : many}`;
}

/** Shortens a path from the left, keeping whole trailing segments: `…/Controller/Acordo.php`. */
export function shortPath(path: string, max = 34) {
  if (path.length <= max) return path;
  const parts = path.split('/');
  let out = parts.pop()!;
  if (out.length + 2 > max) return '…' + out.slice(-(max - 1));
  while (parts.length && parts[parts.length - 1].length + out.length + 3 <= max) out = `${parts.pop()}/${out}`;
  return `…/${out}`;
}

/** Splits `dir/name.ext` into its parts; dotfiles like `.env` have no extension. */
export function splitPath(path: string) {
  const slash = path.lastIndexOf('/');
  const file = path.slice(slash + 1);
  const dot = file.lastIndexOf('.');
  const hasExt = dot > 0;
  return {
    dir: slash > 0 ? path.slice(0, slash) : '',
    name: hasExt ? file.slice(0, dot) : file,
    ext: hasExt ? file.slice(dot + 1) : '',
  };
}

/** ASCII-only file name: some browsers drop `download` names with accents. */
export function safeFilename(name: string) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}
