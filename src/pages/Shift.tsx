import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Calculator, Download, LockKeyhole, Wallet } from 'lucide-react';
import { useActive } from '../lib/session';
import { closeShift, currentShift, openShift, shiftTotals } from '../lib/flows';
import { money } from '../lib/money';
import { clsx, downloadBlob, fmtDateTime, fmtTime } from '../lib/util';
import type { Shift } from '../lib/types';
import { Banner, Button, Field, MoneyInput, PageHeader, Panel, Stat, Textarea } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

const DENOMS = [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1];
const denomLabel = (c: number) => (c >= 100 ? `$${c / 100}` : `${c}¢`);

export default function ShiftPage() {
  const { user, store } = useActive();
  const toast = useToast();
  const shift = useLiveQuery(async () => (await currentShift(user.id, store.id)) ?? null, [user.id, store.id]);
  const [opening, setOpening] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<{ shift: Shift; pdf: Blob } | null>(null);

  if (closed) {
    const d = closed.shift.difference ?? 0;
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Turno cerrado" description="El reporte firmado se envió al administrador." />
        <Panel className="p-6">
          <div className="grid grid-cols-2 gap-6">
            <Stat label="Efectivo esperado" value={money(closed.shift.expectedCash ?? 0)} />
            <Stat label="Efectivo contado" value={money(closed.shift.countedCash ?? 0)} />
            <Stat label="Diferencia" value={d === 0 ? 'Cuadra' : `${d > 0 ? '+' : '−'}${money(Math.abs(d))}`} tone={d === 0 ? 'good' : 'bad'} sub={d === 0 ? undefined : d > 0 ? 'Sobrante' : 'Faltante'} />
            <Stat label="Ventas" value={closed.shift.salesCount ?? 0} />
          </div>
          <Button className="mt-6" variant="secondary" icon={<Download className="size-4" />} onClick={() => downloadBlob(closed.pdf, `cierre-${closed.shift.id.slice(0, 8)}.pdf`)}>Descargar reporte</Button>
        </Panel>
        <Button className="mt-4" variant="ghost" onClick={() => setClosed(null)}>Listo</Button>
      </div>
    );
  }

  if (shift === undefined) return null;
  if (!shift) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Mi turno" description={`No tienes un turno abierto en ${store.name}.`} />
        <Panel className="p-6">
          <Field label="Fondo de caja inicial" htmlFor="op" hint="El efectivo con el que empiezas. Eres responsable de las ventas de tu turno y del cuadre al cerrar.">
            <MoneyInput id="op" value={opening} onChange={setOpening} className="h-14 text-2xl font-bold" autoFocus />
          </Field>
          <Button className="mt-5 w-full" size="lg" disabled={opening == null} busy={busy} icon={<Wallet className="size-5" />}
            onClick={async () => { setBusy(true); try { await openShift(user, store, opening!); toast('Turno abierto'); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); } }}>
            Abrir turno
          </Button>
        </Panel>
      </div>
    );
  }
  return <CloseShift shift={shift} onClosed={setClosed} />;
}

function CloseShift({ shift, onClosed }: { shift: Shift; onClosed: (v: { shift: Shift; pdf: Blob }) => void }) {
  const { store } = useActive();
  const toast = useToast();
  const totals = useLiveQuery(() => shiftTotals(shift), [shift.id]);
  const [counted, setCounted] = useState<number | undefined>();
  const [counter, setCounter] = useState(false);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const fromCounter = useMemo(() => DENOMS.reduce((s, d) => s + d * (Number(counts[d]) || 0), 0), [counts]);
  useEffect(() => { if (counter) setCounted(fromCounter); }, [counter, fromCounter]);
  if (!totals) return null;
  const diff = counted != null ? counted - totals.expectedCash : null;

  async function close() {
    if (counted == null) return;
    if (diff !== 0 && !notes.trim() && !confirm(`El efectivo no cuadra (${diff! > 0 ? 'sobran' : 'faltan'} ${money(Math.abs(diff!))}). ¿Cerrar sin explicar?`)) return;
    setBusy(true);
    try { const r = await closeShift(shift, store, counted, notes); onClosed({ shift: r.shift, pdf: r.pdf }); }
    catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Cerrar turno y cuadrar caja" description={`Abierto desde ${fmtDateTime(shift.openedAt)}.`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
        <div className="flex flex-col gap-5">
          <Panel className="grid grid-cols-2 gap-6 p-5 sm:grid-cols-4">
            <Stat label="Ventas" value={totals.sales.length} />
            <Stat label="Efectivo" value={money(totals.cashSales)} />
            <Stat label="Tarjetas" value={money(totals.cardSales)} sub="Automático" />
            <Stat label="ATH Móvil" value={money(totals.athSales)} sub="Automático" />
          </Panel>
          <Panel title="Transacciones del turno">
            {totals.sales.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">Aún no hay ventas en este turno.</p> : (
              <ul className="max-h-96 overflow-y-auto">
                {[...totals.sales].reverse().map((s) => (
                  <li key={s.id} className="num flex items-center gap-3 border-b border-line/60 px-5 py-2.5 text-[15px] last:border-0">
                    <span className="w-20 shrink-0 whitespace-nowrap text-ink-2">{fmtTime(s.createdAt)}</span>
                    <span className="flex-1 truncate">{s.items.map((i) => `${i.qty}× ${i.description}`).join(', ')}</span>
                    <span className="text-sm text-ink-2">{s.method === 'cash' ? 'Efectivo' : s.method === 'card' ? 'Tarjeta' : 'ATH'}</span>
                    <span className="w-20 text-right font-semibold">{money(s.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel className="h-fit p-5 lg:sticky lg:top-20">
          <dl className="num space-y-1.5 text-[15px]">
            <div className="flex justify-between"><dt className="text-ink-2">Fondo inicial</dt><dd>{money(shift.openingCash)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-2">+ Ventas en efectivo</dt><dd>{money(totals.cashSales)}</dd></div>
            <div className="flex justify-between border-t border-line pt-2 font-bold"><dt>Efectivo esperado</dt><dd>{money(totals.expectedCash)}</dd></div>
          </dl>
          <div className="mt-5">
            <Field label="Efectivo contado en caja" htmlFor="cnt">
              <MoneyInput id="cnt" value={counted} onChange={(v) => { setCounter(false); setCounted(v); }} className="h-14 text-2xl font-bold" />
            </Field>
            <button onClick={() => setCounter(!counter)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-facade-deep"><Calculator className="size-4" />{counter ? 'Ocultar contador' : 'Contar por billetes y monedas'}</button>
            {counter && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {DENOMS.map((d) => (
                  <label key={d} className="flex items-center gap-2 rounded-lg bg-cal px-2 py-1.5">
                    <span className="num w-12 text-sm font-semibold">{denomLabel(d)}</span>
                    <span className="text-ink-3">×</span>
                    <input inputMode="numeric" value={counts[d] ?? ''} onChange={(e) => setCounts({ ...counts, [d]: e.target.value.replace(/\D/g, '') })} className="num h-9 w-full min-w-0 rounded-md bg-white px-2 ring-1 ring-line focus:ring-2 focus:ring-facade-deep focus:outline-none" aria-label={`Cantidad de ${denomLabel(d)}`} />
                  </label>
                ))}
              </div>
            )}
          </div>
          {diff != null && (
            <div className={clsx('mt-4 flex items-baseline justify-between rounded-xl px-4 py-3', diff === 0 ? 'bg-good-wash text-good' : 'bg-bad-wash text-bad')}>
              <span className="font-semibold">{diff === 0 ? 'Cuadra exacto' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
              <span className="num text-2xl font-bold">{money(Math.abs(diff))}</span>
            </div>
          )}
          <div className="mt-4"><Field label="Notas" htmlFor="nt" optional><Textarea id="nt" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Explica cualquier diferencia" /></Field></div>
          <Button className="mt-5 w-full" size="lg" disabled={counted == null} busy={busy} onClick={close} icon={<LockKeyhole className="size-5" />}>Confirmar cuadre y cerrar</Button>
          <p className="mt-3 text-sm text-ink-2">Al cerrar se envía al administrador un reporte firmado con todas tus transacciones y el inventario bajo.</p>
        </Panel>
      </div>
      {totals.sales.length > 0 && diff == null && <div className="mt-4"><Banner tone="facade">Cuenta el efectivo de la caja y escríbelo arriba.</Banner></div>}
    </>
  );
}
