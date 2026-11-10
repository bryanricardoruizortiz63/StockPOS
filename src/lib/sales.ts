import { db } from './db';
import { computeTotals } from './money';
import { isLow } from './inventory';
import { notify } from './notify';
import { dayKey } from './util';
import type { PayMethod, PaymentAttempt, Sale, SaleItem, Store } from './types';

export class DuplicatePaymentError extends Error {}

/**
 * Paso 1 de un cobro: registra el intento con su llave de idempotencia ANTES de
 * hablar con el procesador. Si la llave ya cobró, devuelve el intento existente;
 * si está en curso, se rechaza un segundo intento simultáneo.
 */
export async function beginPayment(key: string, storeId: string, method: PayMethod, amount: number): Promise<PaymentAttempt> {
  return db.transaction('rw', db.payments, async () => {
    const existing = await db.payments.get(key);
    if (existing) {
      if (existing.status === 'succeeded') return existing;
      if (existing.status === 'pending' && existing.method !== method) {
        throw new DuplicatePaymentError('Ya hay un cobro en curso para esta venta con otro método.');
      }
      if (existing.amount !== amount) throw new DuplicatePaymentError('El monto cambió; inicia una venta nueva.');
      await db.payments.update(key, { status: 'pending', method, error: undefined, updatedAt: Date.now() });
      return { ...existing, status: 'pending', method };
    }
    const attempt: PaymentAttempt = { idempotencyKey: key, storeId, method, amount, status: 'pending', createdAt: Date.now(), updatedAt: Date.now() };
    await db.payments.add(attempt);
    return attempt;
  });
}

export async function failPayment(key: string, error: string) {
  await db.payments.update(key, { status: 'failed', error, updatedAt: Date.now() });
}

export interface CommitInput {
  idempotencyKey: string;
  store: Store;
  shiftId: string;
  employeeId: string;
  items: SaleItem[];
  method: PayMethod;
  tendered?: number;
  paymentRef?: string;
  cardLast4?: string;
}

/**
 * Paso 2: registra la venta y descuenta inventario en UNA transacción.
 * El id de la venta es la llave de idempotencia, así que repetir la llamada
 * (doble toque, reintento de red, recarga) devuelve la misma venta sin restar dos veces.
 */
export async function commitSale(input: CommitInput): Promise<{ sale: Sale; duplicate: boolean }> {
  const { store, items } = input;
  if (!items.length) throw new Error('El carrito está vacío.');
  const totals = computeTotals(items, store.ivuRate);

  const result = await db.transaction('rw', [db.sales, db.products, db.payments], async () => {
    const prior = await db.sales.get(input.idempotencyKey);
    if (prior) return { sale: prior, duplicate: true };

    if (input.method !== 'cash') {
      const ref = input.paymentRef?.trim();
      if (!ref) throw new Error('Falta el número de confirmación del pago.');
      const reused = await db.sales.where('paymentRef').equals(ref).first();
      if (reused) throw new DuplicatePaymentError(`La confirmación ${ref} ya se usó en otra venta.`);
    }
    if (input.method === 'cash' && (input.tendered == null || input.tendered < totals.total)) {
      throw new Error('El efectivo recibido no cubre el total.');
    }

    for (const it of items) {
      const p = await db.products.get(it.productId);
      if (!p) throw new Error(`"${it.description}" ya no existe en inventario.`);
      if (p.quantity < it.qty) throw new Error(`Solo quedan ${p.quantity} de "${p.description}".`);
    }
    for (const it of items) {
      const p = (await db.products.get(it.productId))!;
      await db.products.update(p.id, { quantity: p.quantity - it.qty, updatedAt: Date.now() });
    }

    const now = Date.now();
    const sale: Sale = {
      id: input.idempotencyKey,
      storeId: store.id,
      shiftId: input.shiftId,
      employeeId: input.employeeId,
      items,
      ...totals,
      ivuRate: store.ivuRate,
      method: input.method,
      tendered: input.method === 'cash' ? input.tendered : undefined,
      change: input.method === 'cash' ? input.tendered! - totals.total : undefined,
      paymentRef: input.paymentRef?.trim() || undefined,
      cardLast4: input.cardLast4,
      status: 'completed',
      createdAt: now,
      day: dayKey(now),
    };
    await db.sales.add(sale);
    const attempt = await db.payments.get(input.idempotencyKey);
    if (attempt) await db.payments.update(input.idempotencyKey, { status: 'succeeded', providerRef: sale.paymentRef, updatedAt: now });
    else await db.payments.add({ idempotencyKey: sale.id, storeId: store.id, method: sale.method, amount: sale.total, status: 'succeeded', providerRef: sale.paymentRef, createdAt: now, updatedAt: now });
    return { sale, duplicate: false };
  });

  if (!result.duplicate) {
    for (const it of items) {
      const p = await db.products.get(it.productId);
      // Avisar solo cuando la venta cruza el umbral, no en cada venta posterior.
      if (p && isLow(p, store) && !isLow({ ...p, quantity: p.quantity + it.qty }, store)) {
        await notify({ forRole: 'admin', storeId: store.id, title: 'Inventario bajo', body: `${p.description}: quedan ${p.quantity} en ${store.name}.`, link: '/inventario?filtro=bajo' });
      }
    }
  }
  return result;
}

export async function voidSale(saleId: string) {
  await db.transaction('rw', db.sales, db.products, async () => {
    const s = await db.sales.get(saleId);
    if (!s || s.status === 'voided') return;
    for (const it of s.items) {
      const p = await db.products.get(it.productId);
      if (p) await db.products.update(p.id, { quantity: p.quantity + it.qty, updatedAt: Date.now() });
    }
    await db.sales.update(saleId, { status: 'voided' });
  });
}
