import { db, getSetting, setSetting } from './db';
import { dayKey, startOfWeek, uid } from './util';
import type { Bonus, DeductionType, PayStub, PayStubLine, Punch, User } from './types';

export interface PayrollRules {
  weeklyOvertimeAfter: number; // horas
  dailyOvertimeAfter: number | null; // horas (Ley 379 de PR: 8 h diarias); null = no aplica
  overtimeMultiplier: number; // 1.5 por defecto
  frequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
}

export const DEFAULT_RULES: PayrollRules = { weeklyOvertimeAfter: 40, dailyOvertimeAfter: 8, overtimeMultiplier: 1.5, frequency: 'biweekly' };

export async function getRules(): Promise<PayrollRules> {
  return { ...DEFAULT_RULES, ...((await getSetting<Partial<PayrollRules>>('payrollRules')) ?? {}) };
}
export const saveRules = (r: PayrollRules) => setSetting('payrollRules', r);

export const BUILTIN_DEDUCTIONS: DeductionType[] = [
  { id: 'ss', name: 'Seguro Social', kind: 'percent', value: 0.062, active: true, builtin: true },
  { id: 'medicare', name: 'Medicare', kind: 'percent', value: 0.0145, active: true, builtin: true },
  { id: 'plan-medico', name: 'Plan médico', kind: 'healthPlan', value: 0, active: true, builtin: true },
];

export async function ensureBuiltinDeductions() {
  for (const d of BUILTIN_DEDUCTIONS) if (!(await db.deductions.get(d.id))) await db.deductions.add(d);
}

export interface Interval { in: number; out: number; day: string }

/** Empareja entradas con salidas. Una entrada sin salida queda abierta y no se paga. */
export function pairPunches(punches: Punch[]): { intervals: Interval[]; open: Punch[] } {
  const sorted = [...punches].sort((a, b) => a.at - b.at);
  const intervals: Interval[] = [];
  const open: Punch[] = [];
  let pending: Punch | null = null;
  for (const p of sorted) {
    if (p.type === 'in') {
      if (pending) open.push(pending);
      pending = p;
    } else if (pending) {
      intervals.push({ in: pending.at, out: p.at, day: dayKey(pending.at) });
      pending = null;
    }
  }
  if (pending) open.push(pending);
  return { intervals, open };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeHours(intervals: Interval[], rules: PayrollRules) {
  const byDay = new Map<string, number>();
  for (const iv of intervals) byDay.set(iv.day, (byDay.get(iv.day) ?? 0) + (iv.out - iv.in) / 3_600_000);
  const byWeek = new Map<string, { regular: number; daily: number }>();
  for (const [day, h] of byDay) {
    const wk = startOfWeek(day);
    const w = byWeek.get(wk) ?? { regular: 0, daily: 0 };
    const cap = rules.dailyOvertimeAfter;
    const dailyOt = cap != null ? Math.max(0, h - cap) : 0;
    w.regular += h - dailyOt;
    w.daily += dailyOt;
    byWeek.set(wk, w);
  }
  let regular = 0, overtime = 0;
  for (const w of byWeek.values()) {
    const weeklyOt = Math.max(0, w.regular - rules.weeklyOvertimeAfter);
    regular += w.regular - weeklyOt;
    overtime += w.daily + weeklyOt;
  }
  return { regularHours: round2(regular), overtimeHours: round2(overtime), days: byDay };
}

export function computeDeductions(gross: number, user: User, types: DeductionType[]): PayStubLine[] {
  const lines: PayStubLine[] = [];
  for (const t of types) {
    if (!t.active || !user.deductionIds.includes(t.id)) continue;
    let amount = 0;
    if (t.kind === 'percent') amount = Math.round(gross * t.value);
    else if (t.kind === 'fixed') amount = t.value;
    else if (t.kind === 'healthPlan') amount = user.healthPlan ?? 0;
    if (amount > 0) lines.push({ label: t.kind === 'percent' ? `${t.name} (${+(t.value * 100).toFixed(3)}%)` : t.name, amount });
  }
  return lines;
}

export type PayStubDraft = Omit<PayStub, 'id' | 'docId' | 'createdAt'> & { bonusIds: string[]; openPunches: number };

export async function draftPayStub(user: User, storeId: string, periodStart: string, periodEnd: string): Promise<PayStubDraft> {
  const rules = await getRules();
  const from = new Date(periodStart + 'T00:00:00-04:00').getTime();
  const to = new Date(periodEnd + 'T23:59:59.999-04:00').getTime();
  const punches = (await db.punches.where('[employeeId+at]').between([user.id, from], [user.id, to], true, true).toArray());
  const { intervals, open } = pairPunches(punches);
  const { regularHours, overtimeHours } = computeHours(intervals, rules);
  const otRate = user.overtimeRate ?? Math.round(user.hourlyRate * rules.overtimeMultiplier);
  const regularPay = Math.round(regularHours * user.hourlyRate);
  const overtimePay = Math.round(overtimeHours * otRate);
  const bonuses: Bonus[] = (await db.bonuses.where('employeeId').equals(user.id).toArray())
    .filter((b) => !b.payStubId && b.date >= periodStart && b.date <= periodEnd);
  const bonusLines = bonuses.map((b) => ({ label: b.description || 'Bono', amount: b.amount }));
  const gross = regularPay + overtimePay + bonusLines.reduce((s, b) => s + b.amount, 0);
  const order = BUILTIN_DEDUCTIONS.map((d) => d.id);
  const rank = (id: string) => (order.indexOf(id) + 1 || order.length + 1);
  const types = (await db.deductions.toArray()).sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
  const deductions = computeDeductions(gross, user, types);
  const net = gross - deductions.reduce((s, d) => s + d.amount, 0);
  return {
    employeeId: user.id, storeId, periodStart, periodEnd, regularHours, overtimeHours,
    hourlyRate: user.hourlyRate, overtimeRate: otRate, regularPay, overtimePay,
    bonuses: bonusLines, gross, deductions, net, bonusIds: bonuses.map((b) => b.id), openPunches: open.length,
  };
}

export async function saveIssuedStub(draft: PayStubDraft, docId: string): Promise<PayStub> {
  const { bonusIds, openPunches: _open, ...rest } = draft;
  void _open;
  const stub: PayStub = { ...rest, id: uid(), docId, createdAt: Date.now() };
  await db.transaction('rw', db.payStubs, db.bonuses, async () => {
    await db.payStubs.add(stub);
    for (const id of bonusIds) await db.bonuses.update(id, { payStubId: stub.id });
  });
  return stub;
}

/** Periodo de pago que contiene `day` según la frecuencia. */
export function periodFor(day: string, frequency: PayrollRules['frequency']): [string, string] {
  const [y, m, d] = day.split('-').map(Number);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  if (frequency === 'monthly') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (frequency === 'semimonthly') {
    return d <= 15 ? [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m - 1, 15)))]
      : [iso(new Date(Date.UTC(y, m - 1, 16))), iso(new Date(Date.UTC(y, m, 0)))];
  }
  const start = startOfWeek(day);
  if (frequency === 'weekly') return [start, iso(new Date(Date.parse(start + 'T12:00:00Z') + 6 * 864e5))];
  // Bisemanal anclado al domingo 2024-01-07.
  const weeks = Math.floor((Date.parse(start + 'T12:00:00Z') - Date.parse('2024-01-07T12:00:00Z')) / (7 * 864e5));
  const s = weeks % 2 === 0 ? start : iso(new Date(Date.parse(start + 'T12:00:00Z') - 7 * 864e5));
  return [s, iso(new Date(Date.parse(s + 'T12:00:00Z') + 13 * 864e5))];
}
