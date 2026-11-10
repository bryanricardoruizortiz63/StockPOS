import { db } from './db';
import { uid } from './util';
import type { Product, Store } from './types';

/** Umbral efectivo: producto → categoría → tienda. */
export function effectiveThreshold(p: Product, store: Store): number {
  if (p.alertThreshold != null) return p.alertThreshold;
  if (p.category && store.categoryThresholds[p.category] != null) return store.categoryThresholds[p.category];
  return store.defaultAlertThreshold;
}

export const isLow = (p: Product, store: Store) => p.quantity <= effectiveThreshold(p, store);

export async function lowStock(store: Store): Promise<Product[]> {
  const all = await db.products.where('storeId').equals(store.id).toArray();
  return all.filter((p) => isLow(p, store)).sort((a, b) => a.quantity - b.quantity);
}

export async function findByBarcode(storeId: string, barcode: string) {
  return db.products.where('[storeId+barcode]').equals([storeId, barcode.trim()]).first();
}

export type ProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export function validateProduct(p: Partial<ProductInput>): string | null {
  if (!p.barcode?.trim()) return 'Escanea o escribe el código de barras.';
  if (!p.description?.trim()) return 'Escribe una descripción.';
  if (p.salePrice == null || !Number.isFinite(p.salePrice) || p.salePrice <= 0) return 'El precio de venta es obligatorio.';
  if (p.quantity == null || !Number.isInteger(p.quantity) || p.quantity < 0) return 'La cantidad es obligatoria (número entero).';
  if (p.marketPrice != null && (!Number.isFinite(p.marketPrice) || p.marketPrice < 0)) return 'Precio en el mercado inválido.';
  return null;
}

export async function saveProduct(input: ProductInput, id?: string): Promise<Product> {
  const err = validateProduct(input);
  if (err) throw new Error(err);
  const barcode = input.barcode.trim();
  const dup = await findByBarcode(input.storeId, barcode);
  if (dup && dup.id !== id) throw new Error(`Ese código ya pertenece a "${dup.description}".`);
  const now = Date.now();
  if (id) {
    await db.products.update(id, { ...input, barcode, updatedAt: now });
    return (await db.products.get(id))!;
  }
  const p: Product = { ...input, barcode, description: input.description.trim(), id: uid(), createdAt: now, updatedAt: now };
  await db.products.add(p);
  return p;
}

export async function adjustStock(productId: string, delta: number) {
  await db.transaction('rw', db.products, async () => {
    const p = await db.products.get(productId);
    if (!p) throw new Error('Producto no encontrado');
    const q = p.quantity + delta;
    if (q < 0) throw new Error('La cantidad no puede quedar negativa.');
    await db.products.update(productId, { quantity: q, updatedAt: Date.now() });
  });
}

export type TransferMode = 'catalog' | 'description' | 'stock';

/**
 * Exporta productos a otra tienda.
 * - catalog: copia todo (código, descripción, precios, foto, categoría, alerta) con cantidad 0.
 * - description: copia solo código y descripción; precio y cantidad se completan en destino.
 * - stock: transfiere existencias (resta en origen, suma en destino).
 */
export async function transferProducts(
  productIds: string[], toStoreId: string, mode: TransferMode, qtyById: Record<string, number> = {},
) {
  let created = 0, updated = 0;
  await db.transaction('rw', db.products, async () => {
    for (const pid of productIds) {
      const src = await db.products.get(pid);
      if (!src || src.storeId === toStoreId) continue;
      const existing = await findByBarcode(toStoreId, src.barcode);
      const now = Date.now();
      const moveQty = mode === 'stock' ? Math.min(qtyById[pid] ?? src.quantity, src.quantity) : 0;
      if (mode === 'stock' && moveQty <= 0) continue;
      if (existing) {
        const patch: Partial<Product> = { updatedAt: now };
        if (mode !== 'stock') patch.description = src.description;
        if (mode === 'catalog') Object.assign(patch, { salePrice: src.salePrice, marketPrice: src.marketPrice, photo: src.photo, category: src.category });
        if (mode === 'stock') patch.quantity = existing.quantity + moveQty;
        await db.products.update(existing.id, patch);
        updated++;
      } else {
        const base: Product = {
          id: uid(), storeId: toStoreId, barcode: src.barcode, description: src.description,
          salePrice: mode === 'description' ? 0 : src.salePrice, quantity: moveQty,
          createdAt: now, updatedAt: now,
        };
        if (mode !== 'description') Object.assign(base, { marketPrice: src.marketPrice, photo: src.photo, category: src.category, alertThreshold: src.alertThreshold });
        await db.products.add(base);
        created++;
      }
      if (mode === 'stock') await db.products.update(src.id, { quantity: src.quantity - moveQty, updatedAt: now });
    }
  });
  return { created, updated };
}
