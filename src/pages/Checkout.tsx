import { useEffect, useRef, useState } from 'react';
import { Banknote, CheckCircle2, CreditCard, Loader2, Nfc, Smartphone } from 'lucide-react';
import { beginPayment, commitSale, failPayment } from '../lib/sales';
import { computeChange, money, quickTenders, type Totals } from '../lib/money';
import { athConfigured, startAthPayment, validAthReference, waitForAth, type AthStatus } from '../lib/payments/athmovil';
import { cancelTapToPay, chargeTapToPay, tapToPayAvailable } from '../lib/payments/stripeTerminal';
import { canonical } from '../lib/crypto';
import { clsx, uid } from '../lib/util';
import type { PayMethod, Sale, SaleItem, Store } from '../lib/types';
import { Banner, Button, Field, Input, MoneyInput, Sheet } from '../components/ui';
import { errMsg } from '../components/toast';

const METHODS: { id: PayMethod; label: string; icon: typeof Banknote }[] = [
  { id: 'cash', label: 'Efectivo', icon: Banknote },
  { id: 'athmovil', label: 'ATH Móvil', icon: Smartphone },
  { id: 'card', label: 'Tarjeta', icon: CreditCard },
];

/**
 * Cobro. La llave de idempotencia se crea al abrir y se conserva mientras el carrito
 * sea el mismo: doble toque, reintento o pago confirmado con error de red nunca
 * generan una segunda venta ni un segundo cargo.
 */
export function Checkout({ open, initialMethod = 'cash', onClose, store, shiftId, employeeId, items, totals, onDone }: {
  open: boolean; initialMethod?: PayMethod; onClose: () => void; store: Store; shiftId: string; employeeId: string; items: SaleItem[]; totals: Totals; onDone: () => void;
}) {
  const cartSig = canonical(items.map((i) => [i.productId, i.qty, i.unitPrice]));
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  if (open && (!keyRef.current || keyRef.current.sig !== cartSig)) keyRef.current = { sig: cartSig, key: uid() };
  const key = keyRef.current?.key ?? '';

  const [method, setMethod] = useState<PayMethod>(initialMethod);
  const [tendered, setTendered] = useState<number | undefined>();
  const [ref, setRef] = useState('');
  const [last4, setLast4] = useState('');
  const [phone, setPhone] = useState('');
  const [athState, setAthState] = useState<AthStatus | 'sending' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Sale | null>(null);
  const lock = useRef(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) { setDone(null); setError(null); setTendered(undefined); setRef(''); setLast4(''); setAthState(null); setMethod(initialMethod); }
    return () => abort.current?.abort();
  }, [open, initialMethod]);

  const change = tendered != null ? computeChange(totals.total, tendered) : null;

  async function finish(m: PayMethod, extra: { tendered?: number; paymentRef?: string; cardLast4?: string }) {
    const { sale } = await commitSale({ idempotencyKey: key, store, shiftId, employeeId, items, method: m, ...extra });
    setDone(sale);
    keyRef.current = null;
    onDone();
  }

  /** Un solo cobro a la vez, aunque se toque el botón varias veces. */
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errMsg(e)); } finally { lock.current = false; setBusy(false); }
  }

  const payCash = () => run(async () => {
    if (change == null) throw new Error('El efectivo recibido no cubre el total.');
    await beginPayment(key, store.id, 'cash', totals.total);
    await finish('cash', { tendered });
  });

  const payAthManual = () => run(async () => {
    if (!validAthReference(ref)) throw new Error('Escribe el número de referencia que aparece en la confirmación de ATH Móvil.');
    await beginPayment(key, store.id, 'athmovil', totals.total);
    await finish('athmovil', { paymentRef: ref.trim() });
  });

  const payAthOnline = () => run(async () => {
    if (phone.replace(/\D/g, '').length !== 10) throw new Error('Escribe el teléfono ATH Móvil del cliente (10 dígitos).');
    await beginPayment(key, store.id, 'athmovil', totals.total);
    setAthState('sending');
    try {
      await startAthPayment({ idempotencyKey: key, phone, total: totals.total, subtotal: totals.subtotal, tax: totals.ivu, items: items.map((i) => ({ name: i.description, quantity: i.qty, price: i.unitPrice })) });
      abort.current = new AbortController();
      const reference = await waitForAth(key, abort.current.signal, setAthState);
      await finish('athmovil', { paymentRef: reference });
    } catch (e) {
      await failPayment(key, errMsg(e));
      setAthState(null);
      throw e;
    }
  });

  const payTap = () => run(async () => {
    await beginPayment(key, store.id, 'card', totals.total);
    try {
      const r = await chargeTapToPay(key, totals.total, `${store.name} · venta ${key.slice(0, 8)}`);
      await finish('card', { paymentRef: r.id, cardLast4: r.last4 });
    } catch (e) { await failPayment(key, errMsg(e)); throw e; }
  });

  const payCardExternal = () => run(async () => {
    if (!/^[A-Za-z0-9]{4,12}$/.test(ref.trim())) throw new Error('Escribe el número de autorización del recibo de la terminal.');
    if (last4 && !/^\d{4}$/.test(last4)) throw new Error('Los últimos 4 dígitos deben ser 4 números.');
    await beginPayment(key, store.id, 'card', totals.total);
    await finish('card', { paymentRef: `AUT-${ref.trim().toUpperCase()}`, cardLast4: last4 || undefined });
  });

  const close = () => { if (busy && method !== 'cash') { abort.current?.abort(); void cancelTapToPay(); } onClose(); };

  if (done) {
    return (
      <Sheet open={open} onClose={onClose} title="Venta completada"
        footer={<Button size="lg" className="w-full" onClick={onClose} autoFocus>Nueva venta</Button>}>
        <div className="flex flex-col items-center py-4 text-center">
          <CheckCircle2 className="pop size-16 text-good" aria-hidden />
          <p className="num mt-3 text-ink-2">Total cobrado {money(done.total)}</p>
          {done.method === 'cash' ? (
            <>
              <p className="mt-6 text-lg font-semibold">Cambio a devolver</p>
              <p className="num pop text-[64px] leading-none font-bold tracking-[-0.03em] text-good">{money(done.change ?? 0)}</p>
            </>
          ) : (
            <p className="mt-6 font-semibold">{done.method === 'card' ? 'Tarjeta' : 'ATH Móvil'} · Confirmación <span className="num">{done.paymentRef}</span>{done.cardLast4 && <> · •••• {done.cardLast4}</>}</p>
          )}
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={close} title="Cobrar">
      <div className="rounded-2xl bg-adoquin px-5 py-4 text-on-adoquin">
        <div className="num flex justify-between text-sm text-on-adoquin-2"><span>Subtotal {money(totals.subtotal)}</span><span>IVU {money(totals.ivu)}</span></div>
        <div className="mt-1 flex items-baseline justify-between"><span className="font-semibold">Total</span><span className="num text-[44px] leading-none font-bold tracking-[-0.02em]">{money(totals.total)}</span></div>
      </div>

      <div role="tablist" aria-label="Método de pago" className="mt-5 grid grid-cols-3 gap-2">
        {METHODS.map((m) => (
          <button key={m.id} role="tab" aria-selected={method === m.id} disabled={busy} onClick={() => { setMethod(m.id); setError(null); setRef(''); }}
            className={clsx('flex h-16 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold ring-1 transition', method === m.id ? 'bg-facade-wash text-ink ring-[3px] ring-facade' : 'bg-white text-ink-2 ring-line hover:text-ink')}>
            <m.icon className="size-5" />{m.label}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {method === 'cash' && (
          <>
            <Field label="Efectivo recibido" htmlFor="tender">
              <MoneyInput id="tender" value={tendered} onChange={setTendered} autoFocus className="h-14 text-2xl font-bold" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {quickTenders(totals.total).map((t) => (
                <button key={t} onClick={() => setTendered(t)} className={clsx('num h-11 rounded-xl px-4 font-semibold ring-1', tendered === t ? 'bg-ink text-cal ring-ink' : 'bg-white ring-line hover:bg-cal-2')}>
                  {t === totals.total ? 'Exacto' : money(t)}
                </button>
              ))}
            </div>
            <div className={clsx('flex items-baseline justify-between rounded-2xl px-5 py-4', change != null ? 'bg-good-wash text-good' : 'bg-cal-2 text-ink-3')}>
              <span className="font-semibold">Cambio</span>
              <span className="num text-[40px] leading-none font-bold tracking-[-0.02em]">{change != null ? money(change) : tendered != null ? `Faltan ${money(totals.total - tendered)}` : '—'}</span>
            </div>
            <Button size="lg" busy={busy} disabled={change == null} onClick={payCash}>Completar venta</Button>
          </>
        )}

        {method === 'athmovil' && (athConfigured() ? (
          <>
            {athState ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl bg-facade-wash py-8 text-center text-facade-deep">
                <Loader2 className="size-8 animate-spin" />
                <p className="font-bold">{athState === 'sending' ? 'Enviando cobro…' : athState === 'CONFIRM' ? 'Confirmado, autorizando…' : 'Esperando que el cliente apruebe en ATH Móvil'}</p>
                <p className="text-sm">No cierres esta ventana.</p>
              </div>
            ) : (
              <Field label="Teléfono ATH Móvil del cliente" htmlFor="ath-phone" hint="Le llegará el cobro a su app; al aprobarlo, la confirmación se adjunta sola.">
                <Input id="ath-phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="787 555 0123" className="num h-14 text-xl" />
              </Field>
            )}
            <Button size="lg" busy={busy} onClick={payAthOnline} disabled={!!athState}>Enviar cobro ATH Móvil</Button>
          </>
        ) : (
          <>
            <Banner tone="facade" icon={<Smartphone className="size-5 shrink-0" />}>
              El cliente paga <b className="num">{money(totals.total)}</b> a la cuenta ATH Business de {store.name}. Escribe el número de referencia de su confirmación.
            </Banner>
            <Field label="Número de referencia ATH Móvil" htmlFor="ath-ref">
              <Input id="ath-ref" autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} className="num h-14 text-xl" autoFocus />
            </Field>
            <Button size="lg" busy={busy} disabled={!ref.trim()} onClick={payAthManual}>Adjuntar y completar</Button>
          </>
        ))}

        {method === 'card' && (tapToPayAvailable() ? (
          <>
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-facade-wash py-8 text-center text-facade-deep">
              <Nfc className={clsx('size-10', busy && 'animate-pulse')} />
              <p className="font-bold">{busy ? 'Acerca la tarjeta o el teléfono a la parte trasera' : 'Cobro contactless con este dispositivo'}</p>
            </div>
            <Button size="lg" busy={busy} onClick={payTap}>Cobrar {money(totals.total)} con Tap to Pay</Button>
          </>
        ) : (
          <>
            <Banner tone="facade" icon={<CreditCard className="size-5 shrink-0" />}>
              Cobra <b className="num">{money(totals.total)}</b> en la terminal de tarjetas. Tap to Pay se activa en la app instalada (iPhone/Android).
            </Banner>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field label="Núm. de autorización" htmlFor="auth"><Input id="auth" autoComplete="off" value={ref} onChange={(e) => setRef(e.target.value)} className="num" autoFocus /></Field>
              <Field label="Últimos 4" htmlFor="l4" optional><Input id="l4" inputMode="numeric" maxLength={4} value={last4} onChange={(e) => setLast4(e.target.value)} className="num" /></Field>
            </div>
            <Button size="lg" busy={busy} disabled={!ref.trim()} onClick={payCardExternal}>Registrar pago con tarjeta</Button>
          </>
        ))}

        {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
        <p className="num text-center text-xs text-ink-3">Transacción {key.slice(0, 8).toUpperCase()} · se registra una sola vez</p>
      </div>
    </Sheet>
  );
}
