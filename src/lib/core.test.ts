import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from './db';
import { computeChange, computeTotals, quickTenders, toCents } from './money';
import { resetKeyCache } from './crypto';
import { initialSetup } from './setup';
import { saveProduct, transferProducts } from './inventory';
import { beginPayment, commitSale, DuplicatePaymentError } from './sales';
import { recordPunch, verifyChain } from './timeclock';
import { computeHours, pairPunches, DEFAULT_RULES, computeDeductions } from './payroll';
import { occurrences } from './schedules';
import { createSignedDoc, verifyDocument, verificationCode } from './docs';
import { createStore } from './setup';
import type { Punch, Schedule, User } from './types';

let n = 0;
beforeEach(() => { useTestDb('t' + ++n); resetKeyCache(); });

async function setup() {
  const { store, admin } = await initialSetup({ adminName: 'Ana', email: 'ana@x.pr', password: 'clave12345', storeName: 'Colmado', ivuRate: 0.115, color: 'coral' });
  const p = await saveProduct({ storeId: store.id, barcode: '123', description: 'Café', salePrice: 1000, quantity: 5 });
  return { store, admin, p };
}

describe('dinero', () => {
  it('calcula IVU 11.5% redondeado al centavo', () => {
    expect(computeTotals([{ qty: 3, unitPrice: 333 }], 0.115)).toEqual({ subtotal: 999, ivu: 115, total: 1114 });
  });
  it('cambio y billetes rápidos', () => {
    expect(computeChange(1114, 2000)).toBe(886);
    expect(computeChange(1114, 1000)).toBeNull();
    expect(quickTenders(1114)).toContain(2000);
    expect(toCents('12.345')).toBe(1235);
  });
});

describe('ventas idempotentes', () => {
  it('la misma llave nunca descuenta ni cobra dos veces', async () => {
    const { store, admin, p } = await setup();
    const items = [{ productId: p.id, description: p.description, barcode: p.barcode, qty: 2, unitPrice: 1000 }];
    const input = { idempotencyKey: 'k1', store, shiftId: 's', employeeId: admin.id, items, method: 'cash' as const, tendered: 5000 };
    const [a, b] = await Promise.all([commitSale(input), commitSale(input)]);
    expect(a.sale.id).toBe(b.sale.id);
    expect([a.duplicate, b.duplicate].sort()).toEqual([false, true]);
    const { db } = await import('./db');
    expect((await db.products.get(p.id))!.quantity).toBe(3);
    expect(await db.sales.count()).toBe(1);
  });
  it('rechaza reusar una confirmación ATH en otra venta', async () => {
    const { store, admin, p } = await setup();
    const items = [{ productId: p.id, description: p.description, barcode: p.barcode, qty: 1, unitPrice: 1000 }];
    await commitSale({ idempotencyKey: 'a', store, shiftId: 's', employeeId: admin.id, items, method: 'athmovil', paymentRef: 'REF-123456' });
    await expect(commitSale({ idempotencyKey: 'b', store, shiftId: 's', employeeId: admin.id, items, method: 'athmovil', paymentRef: 'REF-123456' })).rejects.toBeInstanceOf(DuplicatePaymentError);
  });
  it('un intento de pago ya cobrado se devuelve igual', async () => {
    const { store } = await setup();
    await beginPayment('z', store.id, 'card', 500);
    await expect(beginPayment('z', store.id, 'card', 600)).rejects.toBeInstanceOf(DuplicatePaymentError);
  });
  it('no vende más de lo que hay', async () => {
    const { store, admin, p } = await setup();
    const items = [{ productId: p.id, description: p.description, barcode: p.barcode, qty: 9, unitPrice: 1000 }];
    await expect(commitSale({ idempotencyKey: 'x', store, shiftId: 's', employeeId: admin.id, items, method: 'cash', tendered: 99999 })).rejects.toThrow(/Solo quedan/);
  });
});

describe('inventario entre tiendas', () => {
  it('exporta solo la descripción y transfiere existencias', async () => {
    const { p } = await setup();
    const other = await createStore({ name: 'Sucursal', color: 'mango', ivuRate: 0.115 });
    expect(await transferProducts([p.id], other.id, 'description')).toEqual({ created: 1, updated: 0 });
    await transferProducts([p.id], other.id, 'stock', { [p.id]: 2 });
    const { db } = await import('./db');
    const dest = await db.products.where('storeId').equals(other.id).first();
    expect(dest).toMatchObject({ description: 'Café', quantity: 2, salePrice: 0 });
    expect((await db.products.get(p.id))!.quantity).toBe(3);
  });
});

describe('ponches', () => {
  it('cadena de hashes detecta alteraciones', async () => {
    const { store, admin } = await setup();
    await recordPunch({ storeId: store.id, employeeId: admin.id, method: 'kiosk' });
    const out = await recordPunch({ storeId: store.id, employeeId: admin.id, method: 'kiosk' });
    expect(out.type).toBe('out');
    expect((await verifyChain()).ok).toBe(true);
    const { db } = await import('./db');
    await db.punches.update(out.id, { at: out.at - 3_600_000 });
    expect(await verifyChain()).toMatchObject({ ok: false, brokenAt: 2 });
  });
});

describe('nómina', () => {
  const P = (type: 'in' | 'out', iso: string) => ({ type, at: Date.parse(iso) }) as Punch;
  it('horas extra diarias (>8) y semanales (>40)', () => {
    const punches: Punch[] = [];
    for (const d of ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']) {
      punches.push(P('in', `${d}T08:00:00-04:00`), P('out', `${d}T18:00:00-04:00`));
    }
    const { intervals } = pairPunches(punches);
    expect(computeHours(intervals, DEFAULT_RULES)).toMatchObject({ regularHours: 40, overtimeHours: 10 });
  });
  it('deducciones de porcentaje, fijas y plan médico', () => {
    const user = { deductionIds: ['ss', 'medicare', 'plan-medico', 'x'], healthPlan: 5000 } as User;
    const lines = computeDeductions(100000, user, [
      { id: 'ss', name: 'Seguro Social', kind: 'percent', value: 0.062, active: true },
      { id: 'medicare', name: 'Medicare', kind: 'percent', value: 0.0145, active: true },
      { id: 'plan-medico', name: 'Plan médico', kind: 'healthPlan', value: 0, active: true },
      { id: 'x', name: 'Préstamo', kind: 'fixed', value: 2500, active: true },
    ]);
    expect(lines.map((l) => l.amount)).toEqual([6200, 1450, 5000, 2500]);
  });
});

describe('horarios rotativos', () => {
  it('alterna semanas en un ciclo de 2', () => {
    const s: Schedule = { id: 's', employeeId: 'e', storeId: 'x', kind: 'rotation', cycleWeeks: 2, startDate: '2026-03-01', updatedAt: 0,
      blocks: [{ week: 0, weekday: 1, start: '08:00', end: '16:00' }, { week: 1, weekday: 1, start: '14:00', end: '22:00' }] };
    expect(occurrences(s, '2026-03-01', '2026-03-21').map((o) => o.start)).toEqual(['08:00', '14:00', '08:00']);
  });
});

describe('documentos firmados', () => {
  it('verifica y detecta alteración', async () => {
    await setup();
    const doc = await createSignedDoc('pay-stub', 'Talonario', { net: 1000 });
    expect((await verifyDocument(verificationCode(doc))).status).toBe('valid');
    const { db } = await import('./db');
    await db.docs.update(doc.id, { payload: { net: 999999 } });
    expect((await verifyDocument(verificationCode(doc))).status).toBe('tampered');
  });
});
