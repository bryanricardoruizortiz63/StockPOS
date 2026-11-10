/** Todo el dinero se maneja en centavos enteros. */
export const toCents = (dollars: number | string): number => {
  const n = typeof dollars === 'string' ? Number(dollars.replace(/[^0-9.\-]/g, '')) : dollars;
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
};

const fmt = new Intl.NumberFormat('es-PR', { style: 'currency', currency: 'USD' });
export const money = (cents: number) => fmt.format((cents || 0) / 100);

/** Redondeo half-up a centavo de un monto fraccional en centavos. */
const roundCents = (x: number) => Math.round(x + Number.EPSILON);

export interface Totals { subtotal: number; ivu: number; total: number }

export function computeTotals(lines: { qty: number; unitPrice: number }[], ivuRate: number): Totals {
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const ivu = roundCents(subtotal * ivuRate);
  return { subtotal, ivu, total: subtotal + ivu };
}

export function computeChange(total: number, tendered: number): number | null {
  if (!Number.isFinite(tendered) || tendered < total) return null;
  return tendered - total;
}

/** Billetes sugeridos para pago rápido en efectivo. */
export function quickTenders(total: number): number[] {
  const bills = [100, 500, 1000, 2000, 5000, 10000];
  const out = new Set<number>([total]);
  for (const b of bills) {
    const up = Math.ceil(total / b) * b;
    if (up >= total) out.add(up);
  }
  return [...out].sort((a, b) => a - b).slice(0, 5);
}

/** Formatea fracción de IVU como porcentaje legible: 0.115 → "11.5%" */
export const pct = (rate: number) => `${+(rate * 100).toFixed(3)}%`;
