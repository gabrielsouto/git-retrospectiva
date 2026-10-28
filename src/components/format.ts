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

export function shortPath(path: string, max = 34) {
  if (path.length <= max) return path;
  const parts = path.split('/');
  const file = parts.pop()!;
  return `…/${file}`.length <= max ? `…/${parts.length ? parts[parts.length - 1] + '/' : ''}${file}`.slice(-max) : file.slice(-max);
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
