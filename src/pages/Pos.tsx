import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Banknote, CreditCard, Minus, PackageSearch, Plus, ScanBarcode, Search, ShoppingCart, Smartphone, Trash2, Wallet } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { computeTotals, money, pct } from '../lib/money';
import { isLow } from '../lib/inventory';
import { currentShift, openShift } from '../lib/flows';
import { clsx } from '../lib/util';
import type { PayMethod, Product, SaleItem } from '../lib/types';
import { Banner, Button, Field, MoneyInput, Sheet } from '../components/ui';
import { Scanner } from '../components/Scanner';
import { errMsg, useToast } from '../components/toast';
import { Checkout } from './Checkout';

interface Line extends SaleItem { stock: number }

export function PosPage() {
  const { user, store } = useActive();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [cart, setCart] = useState<Line[]>([]);
  const [scan, setScan] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [pay, setPay] = useState<PayMethod | null>(null);
  const search = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(() => db.products.where('storeId').equals(store.id).toArray(), [store.id]) ?? [];
  const shift = useLiveQuery(async () => (await currentShift(user.id, store.id)) ?? null, [user.id, store.id]);

  useEffect(() => { setCart([]); }, [store.id]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean) as string[])].sort(), [products]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products
      .filter((p) => (!cat || p.category === cat) && (!t || p.description.toLowerCase().includes(t) || p.barcode.includes(t)))
      .sort((a, b) => a.description.localeCompare(b.description, 'es'));
  }, [products, q, cat]);

  const add = useCallback((p: Product) => {
    if (p.salePrice <= 0) return toast(`"${p.description}" no tiene precio de venta.`, 'bad');
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      const inCart = i >= 0 ? c[i].qty : 0;
      if (inCart + 1 > p.quantity) { toast(`Solo hay ${p.quantity} de "${p.description}".`, 'bad'); return c; }
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + 1, stock: p.quantity } : l));
      return [...c, { productId: p.id, description: p.description, barcode: p.barcode, qty: 1, unitPrice: p.salePrice, stock: p.quantity }];
    });
    navigator.vibrate?.(15);
  }, [toast]);

  const byBarcode = useCallback((code: string) => {
    const p = products.find((x) => x.barcode === code.trim());
    if (p) { add(p); return true; }
    return false;
  }, [products, add]);

  const onScan = useCallback((code: string) => {
    setScan(false);
    if (!byBarcode(code)) toast(`No hay producto con el código ${code}. Añádelo en Inventario.`, 'bad');
  }, [byBarcode, toast]);

  const setQty = (id: string, qty: number) => setCart((c) => c.flatMap((l) => (l.productId !== id ? [l] : qty <= 0 ? [] : [{ ...l, qty: Math.min(qty, l.stock) }])));
  const totals = computeTotals(cart, store.ivuRate);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  const cloneCart = (inSheet = false) => (
    <CartPanel inSheet={inSheet} cart={cart} setQty={setQty} totals={totals} ivuRate={store.ivuRate} canPay={!!shift && cart.length > 0}
      onPay={(m) => { setCartOpen(false); setPay(m); }} onClear={() => setCart([])} />
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col lg:flex-row">
      <section className="min-w-0 flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-8">
        {shift === null ? <OpenShiftBanner /> : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (q.trim() && byBarcode(q)) setQ(''); else if (shown.length === 1) { add(shown[0]); setQ(''); } }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
            <label htmlFor="pos-q" className="sr-only">Buscar producto o código</label>
            <input
              id="pos-q" ref={search} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder="Buscar o escanear código"
              className="h-12 w-full rounded-xl bg-white pr-3 pl-11 text-base ring-1 ring-line placeholder:text-ink-3 focus:ring-2 focus:ring-facade-deep focus:outline-none"
            />
          </div>
          <Button type="button" size="lg" className="h-12 px-4" onClick={() => setScan(true)} icon={<ScanBarcode className="size-5" />}><span className="hidden sm:inline">Escanear</span></Button>
        </form>

        {categories.length > 0 && (
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6">
            {[null, ...categories].map((c) => (
              <button key={c ?? 'all'} onClick={() => setCat(c)}
                className={clsx('h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors', cat === c ? 'bg-adoquin text-on-adoquin' : 'bg-white text-ink-2 ring-1 ring-line hover:text-ink')}>
                {c ?? 'Todo'}
              </button>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-facade-wash text-facade-deep"><PackageSearch className="size-7" /></div>
            <p className="mt-4 text-lg font-bold">Aún no hay productos</p>
            <p className="mt-1 max-w-[40ch] text-ink-2">Escanea el primer producto para añadirlo al inventario.</p>
            <Link to="/inventario/nuevo" className="mt-5"><Button icon={<Plus className="size-4" />}>Añadir producto</Button></Link>
          </div>
        ) : shown.length === 0 ? (
          <p className="mt-10 text-center text-ink-2">Nada coincide con “{q}”.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((p) => {
              const inCart = cart.find((l) => l.productId === p.id)?.qty ?? 0;
              const out = p.quantity <= 0;
              const low = isLow(p, store);
              return (
                <li key={p.id}>
                  <button
                    onClick={() => add(p)} disabled={out}
                    className={clsx('group relative flex h-full w-full flex-col overflow-hidden rounded-[var(--radius-tile)] bg-white text-left ring-1 transition-[box-shadow,transform] active:scale-[0.98] disabled:opacity-50',
                      inCart ? 'ring-[3px] ring-facade' : 'ring-line/70 hover:shadow-[var(--shadow-lift)]')}
                  >
                    {p.photo
                      ? <div className="aspect-[5/3] w-full bg-cal-2"><img src={p.photo} alt="" className="size-full object-cover" loading="lazy" /></div>
                      : <div className="h-1.5 w-full bg-facade" />}
                    {inCart > 0 && <span className="num pop absolute top-2 right-2 grid min-w-7 place-items-center rounded-full bg-facade px-2 py-0.5 text-sm font-bold text-ink shadow-sm">{inCart}</span>}
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 pr-8 text-[15px] leading-snug font-semibold">{p.description}</p>
                      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                        <span className="num text-xl font-bold">{p.salePrice > 0 ? money(p.salePrice) : 'Sin precio'}</span>
                        <span className={clsx('num text-xs font-semibold whitespace-nowrap', out ? 'text-bad' : low ? 'text-warn' : 'text-ink-3')}>{out ? 'Agotado' : `${p.quantity} disp.`}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[380px] shrink-0 flex-col border-l border-line bg-white lg:flex xl:w-[420px]">
        {cloneCart()}
      </aside>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-16 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] lg:hidden">
          <button onClick={() => setCartOpen(true)} className="pop flex h-14 w-full items-center gap-3 rounded-2xl bg-ink px-4 text-cal shadow-[var(--shadow-lift)]">
            <ShoppingCart className="size-5" />
            <span className="num font-semibold">{count} {count === 1 ? 'artículo' : 'artículos'}</span>
            <span className="num ml-auto text-lg font-bold">{money(totals.total)}</span>
            <span className="rounded-lg bg-facade px-3 py-1.5 text-sm font-bold text-ink">Ver</span>
          </button>
        </div>
      )}

      <Sheet open={cartOpen} onClose={() => setCartOpen(false)} title="Venta actual">
        <div className="-mx-5 -my-5 flex max-h-[75dvh] flex-col">{cloneCart(true)}</div>
      </Sheet>
      <Scanner open={scan} onClose={() => setScan(false)} onResult={onScan} title="Escanear producto" />
      {shift && (
        <Checkout
          open={pay != null} initialMethod={pay ?? 'cash'} onClose={() => setPay(null)} store={store} shiftId={shift.id} employeeId={user.id}
          items={cart.map(({ stock: _s, ...l }) => { void _s; return l; })} totals={totals}
          onDone={() => { setCart([]); search.current?.focus(); }}
        />
      )}
    </div>
  );
}

function CartPanel({ inSheet, cart, setQty, totals, ivuRate, canPay, onPay, onClear }: {
  inSheet?: boolean; cart: Line[]; setQty: (id: string, q: number) => void; totals: ReturnType<typeof computeTotals>; ivuRate: number; canPay: boolean; onPay: (m: PayMethod) => void; onClear: () => void;
}) {
  return (
    <>
      <div className={clsx('flex items-center justify-between px-5 pb-3', inSheet ? 'pt-3' : 'pt-5')}>
        {inSheet ? <span /> : <h2 className="text-lg font-bold">Venta actual</h2>}
        {cart.length > 0 && <Button size="sm" variant="ghost" onClick={onClear} icon={<Trash2 className="size-4" />}>Vaciar</Button>}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-5">
        {cart.length === 0 && <li className="py-12 text-center text-ink-3">Toca un producto o escanéalo para empezar.</li>}
        {cart.map((l) => (
          <li key={l.productId} className="flex items-center gap-3 border-b border-line/60 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{l.description}</p>
              <p className="num text-sm text-ink-2">{money(l.unitPrice)} c/u</p>
            </div>
            <div className="flex items-center rounded-xl bg-cal-2">
              <button className="grid size-10 place-items-center rounded-xl hover:bg-cal-3" onClick={() => setQty(l.productId, l.qty - 1)} aria-label={`Quitar uno de ${l.description}`}><Minus className="size-4" /></button>
              <span className="num w-7 text-center font-bold">{l.qty}</span>
              <button className="grid size-10 place-items-center rounded-xl hover:bg-cal-3 disabled:opacity-40" disabled={l.qty >= l.stock} onClick={() => setQty(l.productId, l.qty + 1)} aria-label={`Añadir uno de ${l.description}`}><Plus className="size-4" /></button>
            </div>
            <span className="num w-20 text-right font-semibold">{money(l.qty * l.unitPrice)}</span>
          </li>
        ))}
      </ul>
      <div className="pb-safe border-t border-line bg-cal/60 px-5 pt-4 pb-5">
        <dl className="num space-y-1 text-[15px]">
          <div className="flex justify-between text-ink-2"><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
          <div className="flex justify-between text-ink-2"><dt>IVU ({pct(ivuRate)})</dt><dd>{money(totals.ivu)}</dd></div>
          <div className="flex items-baseline justify-between pt-2"><dt className="text-lg font-bold">Total</dt><dd className="text-5xl leading-none font-bold tracking-[-0.02em]">{money(totals.total)}</dd></div>
        </dl>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([['cash', 'Efectivo', Banknote], ['athmovil', 'ATH Móvil', Smartphone], ['card', 'Tarjeta', CreditCard]] as const).map(([m, label, Icon]) => (
            <button key={m} disabled={!canPay} onClick={() => onPay(m)}
              className="flex h-16 flex-col items-center justify-center gap-1 rounded-xl bg-adoquin text-sm font-semibold text-on-adoquin transition hover:bg-adoquin-deep active:scale-[0.98] disabled:opacity-45">
              <Icon className="size-5" />{label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function OpenShiftBanner() {
  const { user, store } = useActive();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [cash, setCash] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  return (
    <div className="mb-4">
      <Banner tone="warn" icon={<Wallet className="size-5 shrink-0" />} action={<Button size="sm" onClick={() => setOpen(true)}>Abrir turno</Button>}>
        Abre tu turno con el fondo de caja para poder cobrar.
      </Banner>
      <Sheet open={open} onClose={() => setOpen(false)} title="Abrir turno"
        footer={<Button className="w-full" size="lg" busy={busy} disabled={cash == null} onClick={async () => {
          setBusy(true);
          try { await openShift(user, store, cash!); setOpen(false); toast('Turno abierto'); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
        }}>Abrir turno</Button>}>
        <Field label="Fondo de caja inicial" htmlFor="fondo" hint="El efectivo con el que empiezas en la caja. Se usa para el cuadre al cerrar.">
          <MoneyInput id="fondo" value={cash} onChange={setCash} autoFocus className="h-14 text-2xl font-bold" />
        </Field>
      </Sheet>
    </div>
  );
}
