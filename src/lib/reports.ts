import { db } from './db';
import { addDays, dayKey, startOfWeek } from './util';
import type { PayMethod, Product, Sale } from './types';

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export function periodRange(kind: PeriodKind, anchor: string): [string, string] {
  const [y, m] = anchor.split('-').map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  switch (kind) {
    case 'day': return [anchor, anchor];
    case 'week': { const s = startOfWeek(anchor); return [s, addDays(s, 6)]; }
    case 'month': return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
  }
}

export function shiftPeriod(kind: PeriodKind, anchor: string, dir: -1 | 1): string {
  const [y, m, d] = anchor.split('-').map(Number);
  const iso = (dt: Date) => dt.toISOString().slice(0, 10);
  switch (kind) {
    case 'day': return addDays(anchor, dir);
    case 'week': return addDays(anchor, 7 * dir);
    case 'month': return iso(new Date(Date.UTC(y, m - 1 + dir, Math.min(d, 28))));
    case 'year': return `${y + dir}-${String(m).padStart(2, '0')}-${String(Math.min(d, 28)).padStart(2, '0')}`;
  }
}

export interface ProductStat { productId: string; description: string; barcode: string; qty: number; revenue: number }

export interface SalesSummary {
  from: string; to: string;
  count: number; subtotal: number; ivu: number; total: number; average: number;
  byMethod: Record<PayMethod, number>;
  byEmployee: { employeeId: string; total: number; count: number }[];
  byDay: { day: string; total: number }[];
  top: ProductStat[];
  sales: Sale[];
}

export async function salesBetween(storeId: string, from: string, to: string) {
  return (await db.sales.where('[storeId+day]').between([storeId, from], [storeId, to], true, true).toArray())
    .filter((s) => s.status === 'completed');
}

export function summarize(sales: Sale[], from: string, to: string): SalesSummary {
  const byMethod: Record<PayMethod, number> = { cash: 0, athmovil: 0, card: 0 };
  const emp = new Map<string, { total: number; count: number }>();
  const days = new Map<string, number>();
  const prod = new Map<string, ProductStat>();
  let subtotal = 0, ivu = 0, total = 0;
  for (const s of sales) {
    subtotal += s.subtotal; ivu += s.ivu; total += s.total;
    byMethod[s.method] += s.total;
    const e = emp.get(s.employeeId) ?? { total: 0, count: 0 };
    e.total += s.total; e.count++; emp.set(s.employeeId, e);
    days.set(s.day, (days.get(s.day) ?? 0) + s.total);
    for (const it of s.items) {
      const p = prod.get(it.productId) ?? { productId: it.productId, description: it.description, barcode: it.barcode, qty: 0, revenue: 0 };
      p.qty += it.qty; p.revenue += it.qty * it.unitPrice; prod.set(it.productId, p);
    }
  }
  const byDay: { day: string; total: number }[] = [];
  if (from === to || to > from) {
    const span = Math.min(400, Math.round((Date.parse(to) - Date.parse(from)) / 864e5));
    for (let i = 0; i <= span; i++) { const d = addDays(from, i); byDay.push({ day: d, total: days.get(d) ?? 0 }); }
  }
  return {
    from, to, count: sales.length, subtotal, ivu, total,
    average: sales.length ? Math.round(total / sales.length) : 0,
    byMethod,
    byEmployee: [...emp].map(([employeeId, v]) => ({ employeeId, ...v })).sort((a, b) => b.total - a.total),
    byDay,
    top: [...prod.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue),
    sales,
  };
}

export interface Recommendation {
  product: Product;
  soldThisPeriod: number;
  soldPrevPeriod: number;
  growth: number | null; // fracción; null si no hubo ventas antes
  perDay: number;
  daysOfCover: number | null;
  suggestedOrder: number;
  reason: string;
}

/**
 * Orienta la compra: toma las ventas de los últimos 30 días frente a los 30 anteriores,
 * calcula cuántos días de inventario quedan y sugiere cuánto comprar para cubrir `coverDays`.
 */
export async function recommendations(storeId: string, today = dayKey(), coverDays = 21): Promise<Recommendation[]> {
  const curFrom = addDays(today, -29), prevFrom = addDays(today, -59), prevTo = addDays(today, -30);
  const [cur, prev, products] = await Promise.all([
    salesBetween(storeId, curFrom, today), salesBetween(storeId, prevFrom, prevTo),
    db.products.where('storeId').equals(storeId).toArray(),
  ]);
  const qty = (ss: Sale[]) => {
    const m = new Map<string, number>();
    for (const s of ss) for (const it of s.items) m.set(it.productId, (m.get(it.productId) ?? 0) + it.qty);
    return m;
  };
  const c = qty(cur), p = qty(prev);
  const out: Recommendation[] = [];
  for (const prod of products) {
    const sold = c.get(prod.id) ?? 0;
    if (!sold) continue;
    const before = p.get(prod.id) ?? 0;
    const perDay = sold / 30;
    const daysOfCover = perDay > 0 ? prod.quantity / perDay : null;
    const suggestedOrder = Math.max(0, Math.ceil(perDay * coverDays - prod.quantity));
    const growth = before ? (sold - before) / before : null;
    let reason = perDay >= 1 ? `Se venden ${perDay.toFixed(1)} al día.` : `Se venden ~${Math.max(1, Math.round(perDay * 7))} por semana.`;
    if (daysOfCover != null) reason += daysOfCover < 1 ? ' Se agota hoy.' : daysOfCover > 120 ? ' Hay de sobra.' : ` Alcanza para ~${Math.floor(daysOfCover)} días.`;
    if (growth != null && growth > 0.15) reason += ` Ventas +${Math.round(growth * 100)}% vs. mes anterior.`;
    out.push({ product: prod, soldThisPeriod: sold, soldPrevPeriod: before, growth, perDay, daysOfCover, suggestedOrder, reason });
  }
  return out.sort((a, b) => b.soldThisPeriod - a.soldThisPeriod);
}
