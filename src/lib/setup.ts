import { db } from './db';
import { createUser } from './auth';
import { ensureBuiltinDeductions } from './payroll';
import { newTotpSecret } from './totp';
import { uid } from './util';
import type { FacadeColor, Store } from './types';

export async function isSetUp() {
  return (await db.users.where('role').equals('admin').count()) > 0;
}

export async function createStore(input: { name: string; color: FacadeColor; ivuRate: number; address?: string; defaultAlertThreshold?: number }): Promise<Store> {
  const s: Store = {
    id: uid(), name: input.name.trim(), color: input.color, address: input.address?.trim() || undefined,
    ivuRate: input.ivuRate, defaultAlertThreshold: input.defaultAlertThreshold ?? 5,
    categoryThresholds: {}, punchSecret: newTotpSecret(), createdAt: Date.now(),
  };
  await db.stores.add(s);
  return s;
}

export async function initialSetup(input: { adminName: string; email: string; password: string; storeName: string; ivuRate: number; color: FacadeColor }) {
  if (await isSetUp()) throw new Error('StockPOS ya está configurado.');
  await ensureBuiltinDeductions();
  const store = await createStore({ name: input.storeName, color: input.color, ivuRate: input.ivuRate });
  const admin = await createUser({ name: input.adminName, email: input.email, password: input.password, role: 'admin', storeIds: [store.id] });
  return { store, admin };
}

/** Datos de ejemplo (etiquetados) para probar la app sin capturar todo a mano. */
export async function loadDemoData(storeId: string) {
  const items: [string, string, string, number, number, number?][] = [
    ['7501055303786', 'Café Yaucono 14 oz', 'Café', 649, 18, 799],
    ['0076808280142', 'Arroz Goya grano largo 3 lb', 'Granos', 399, 30],
    ['0041331024471', 'Habichuelas rosadas Goya 15.5 oz', 'Granos', 159, 4],
    ['0012000001536', 'Malta India 12 oz', 'Bebidas', 125, 48],
    ['0049000006346', 'Coca-Cola 2 L', 'Bebidas', 329, 12],
    ['0041789001406', 'Sopa instantánea pollo', 'Despensa', 45, 3],
    ['0073141151405', 'Pan sobao', 'Panadería', 299, 10],
    ['0028400090865', 'Papitas Lays clásicas', 'Snacks', 229, 2],
    ['0044000032029', 'Galletas Export Sodas', 'Snacks', 389, 15],
    ['0011110838285', 'Leche Suiza 1/2 galón', 'Lácteos', 459, 6],
  ];
  const now = Date.now();
  await db.products.bulkAdd(items.map(([barcode, description, category, salePrice, quantity, marketPrice]) => ({
    id: uid(), storeId, barcode, description: `${description}`, category, salePrice, quantity, marketPrice, createdAt: now, updatedAt: now,
  })));
}
