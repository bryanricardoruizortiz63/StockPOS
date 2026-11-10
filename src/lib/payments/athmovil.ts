/**
 * ATH Móvil Business — Payment Button API.
 * Flujo: crear pago → el cliente lo aprueba en su app ATH Móvil → se autoriza → referenceNumber.
 * El ecommerceId se crea UNA vez por llave de idempotencia; un reintento reutiliza el mismo pago.
 *
 * Requiere VITE_ATHM_PUBLIC_TOKEN (token público de ATH Business). Si no está configurado,
 * la caja usa el modo manual: el cliente paga a la cuenta ATH de la tienda y el cajero
 * escribe el número de referencia que aparece en la confirmación.
 *
 * Verifica los endpoints contra la documentación vigente de ATH Business antes de producción.
 */
const TOKEN = import.meta.env.VITE_ATHM_PUBLIC_TOKEN as string | undefined;
const BASE = 'https://payments.athmovil.com/api/business-transaction/ecommerce';

export const athConfigured = () => !!TOKEN;

const created = new Map<string, { ecommerceId: string; authToken: string }>();

export interface AthRequest {
  idempotencyKey: string;
  phone: string; // teléfono ATH del cliente
  total: number; subtotal: number; tax: number; // centavos
  items: { name: string; quantity: number; price: number }[];
}

const dollars = (c: number) => (c / 100).toFixed(2);

async function post<T>(path: string, body: unknown, bearer?: string): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === 'error') throw new Error(json.message || 'ATH Móvil no respondió.');
  return json.data as T;
}

export async function startAthPayment(r: AthRequest) {
  const prior = created.get(r.idempotencyKey);
  if (prior) return prior;
  const data = await post<{ ecommerceId: string; auth_token: string }>('/payment', {
    env: import.meta.env.VITE_ATHM_ENV === 'production' ? 'production' : 'sandbox',
    publicToken: TOKEN,
    timeout: 300,
    total: dollars(r.total), subtotal: dollars(r.subtotal), tax: dollars(r.tax),
    metadata1: r.idempotencyKey.slice(0, 40), metadata2: 'StockPOS',
    items: r.items.map((i) => ({ name: i.name.slice(0, 32), description: '', quantity: String(i.quantity), price: dollars(i.price), tax: '0', metadata: '' })),
    phoneNumber: r.phone.replace(/\D/g, ''),
  });
  const v = { ecommerceId: data.ecommerceId, authToken: data.auth_token };
  created.set(r.idempotencyKey, v);
  return v;
}

export type AthStatus = 'OPEN' | 'CONFIRM' | 'COMPLETED' | 'CANCEL';

export async function athStatus(ecommerceId: string): Promise<AthStatus> {
  const data = await post<{ ecommerceStatus: AthStatus }>('/business/findPayment', { ecommerceId, publicToken: TOKEN });
  return data.ecommerceStatus;
}

export async function authorizeAth(authToken: string): Promise<string> {
  const data = await post<{ referenceNumber: string }>('/authorization', {}, authToken);
  return data.referenceNumber;
}

/** Espera la aprobación del cliente y devuelve el número de referencia. */
export async function waitForAth(key: string, signal: AbortSignal, onStatus?: (s: AthStatus) => void): Promise<string> {
  const p = created.get(key);
  if (!p) throw new Error('Pago ATH no iniciado');
  while (!signal.aborted) {
    const s = await athStatus(p.ecommerceId);
    onStatus?.(s);
    if (s === 'CONFIRM' || s === 'COMPLETED') return authorizeAth(p.authToken);
    if (s === 'CANCEL') throw new Error('El cliente canceló o el pago expiró.');
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error('Cancelado');
}

/** Validación del número de referencia en modo manual. */
export function validAthReference(ref: string) {
  return /^[A-Za-z0-9-]{6,40}$/.test(ref.trim());
}
