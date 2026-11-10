import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Tarjetas contactless con Stripe Terminal.
 * - App nativa (Capacitor) + plugin @capacitor-community/stripe-terminal: Tap to Pay en iPhone/Android.
 * - Navegador/PC: no hay acceso NFC a tarjetas; se cobra con una terminal física y se registra
 *   la autorización (modo externo).
 *
 * El backend (supabase/functions/stripe-terminal) crea el PaymentIntent con la MISMA llave de
 * idempotencia de la venta, por lo que un reintento nunca genera un segundo cargo.
 */
const BACKEND = import.meta.env.VITE_STRIPE_TERMINAL_BACKEND as string | undefined;

interface StripeTerminalPlugin {
  initialize(o: { tokenProviderEndpoint: string; isTest: boolean }): Promise<void>;
  discoverReaders(o: { type: string; locationId?: string }): Promise<{ readers: unknown[] }>;
  connectReader(o: { reader: unknown }): Promise<void>;
  collectPaymentMethod(o: { paymentIntent: string }): Promise<void>;
  confirmPaymentIntent(): Promise<void>;
  cancelCollectPaymentMethod(): Promise<void>;
}
const StripeTerminal = registerPlugin<StripeTerminalPlugin>('StripeTerminal');

export const tapToPayAvailable = () => Capacitor.isNativePlatform() && !!BACKEND;

let ready: Promise<void> | null = null;
function init() {
  ready ??= (async () => {
    await StripeTerminal.initialize({ tokenProviderEndpoint: `${BACKEND}/connection-token`, isTest: import.meta.env.DEV });
    const { readers } = await StripeTerminal.discoverReaders({ type: 'tap-to-pay' });
    if (!readers.length) throw new Error('Este dispositivo no soporta Tap to Pay.');
    await StripeTerminal.connectReader({ reader: readers[0] });
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

async function api<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.text()) || 'Error del servidor de pagos');
  return res.json();
}

export async function chargeTapToPay(idempotencyKey: string, amount: number, description: string) {
  await init();
  const intent = await api<{ id: string; client_secret: string; status: string; last4?: string }>(
    '/payment-intents', { amount, currency: 'usd', description }, idempotencyKey);
  if (intent.status === 'succeeded') return { id: intent.id, last4: intent.last4 };
  await StripeTerminal.collectPaymentMethod({ paymentIntent: intent.client_secret });
  await StripeTerminal.confirmPaymentIntent();
  const captured = await api<{ id: string; status: string; last4?: string }>('/capture', { id: intent.id }, idempotencyKey + ':capture');
  if (captured.status !== 'succeeded') throw new Error('La tarjeta no fue aprobada.');
  return { id: captured.id, last4: captured.last4 };
}

export async function cancelTapToPay() {
  try { await StripeTerminal.cancelCollectPaymentMethod(); } catch { /* nada que cancelar */ }
}
