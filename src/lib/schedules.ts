import { addDays, daysBetween, startOfWeek, weekdayOf } from './util';
import type { Schedule } from './types';

export interface Occurrence { day: string; start: string; end: string; scheduleId: string; employeeId: string; storeId: string }

/** Semana del ciclo (0..cycleWeeks-1) para un día dado. */
export function cycleWeek(s: Schedule, day: string): number {
  const weeks = Math.floor(daysBetween(startOfWeek(s.startDate), startOfWeek(day)) / 7);
  const n = Math.max(1, s.kind === 'fixed' ? 1 : s.cycleWeeks);
  return ((weeks % n) + n) % n;
}

export function occurrences(s: Schedule, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d < s.startDate) continue;
    const w = cycleWeek(s, d);
    const wd = weekdayOf(d);
    for (const b of s.blocks) {
      if (b.weekday === wd && (s.kind === 'fixed' || b.week === w)) {
        out.push({ day: d, start: b.start, end: b.end, scheduleId: s.id, employeeId: s.employeeId, storeId: s.storeId });
      }
    }
  }
  return out.sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
}

export function blockHours(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // turno que cruza medianoche
  return mins / 60;
}

export function weeklyScheduledHours(s: Schedule, week = 0): number {
  return s.blocks.filter((b) => s.kind === 'fixed' || b.week === week).reduce((h, b) => h + blockHours(b.start, b.end), 0);
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
