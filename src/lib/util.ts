export const uid = () => crypto.randomUUID();

const TZ = 'America/Puerto_Rico';

/** Fecha YYYY-MM-DD en hora de Puerto Rico. */
export function dayKey(ts: number | Date = Date.now()): string {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function fmtDate(ts: number | string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  const d = typeof ts === 'string' ? new Date(ts + (ts.length === 10 ? 'T12:00:00' : '')) : new Date(ts);
  return new Intl.DateTimeFormat('es-PR', { timeZone: TZ, ...opts }).format(d);
}
export const fmtDateTime = (ts: number) => fmtDate(ts, { dateStyle: 'medium', timeStyle: 'short' });
export const fmtTime = (ts: number) => fmtDate(ts, { timeStyle: 'short' });

/** Parse YYYY-MM-DD como mediodía UTC para aritmética de días segura. */
export function parseDay(day: string): Date {
  return new Date(day + 'T12:00:00Z');
}
export function addDays(day: string, n: number): string {
  const d = parseDay(day);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekdayOf(day: string): number {
  return parseDay(day).getUTCDay();
}
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}
export function startOfWeek(day: string): string {
  return addDays(day, -weekdayOf(day));
}

export function clsx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
