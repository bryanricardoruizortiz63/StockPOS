import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, TrendingUp } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { periodRange, recommendations, salesBetween, shiftPeriod, summarize, type PeriodKind, type SalesSummary } from '../lib/reports';
import { buildPdf, buildXlsx } from '../lib/exporters';
import { createSignedDoc } from '../lib/docs';
import { methodLabel } from '../lib/flows';
import { money } from '../lib/money';
import { clsx, dayKey, downloadBlob, fmtDate, fmtDateTime, parseDay } from '../lib/util';
import { Badge, Button, PageHeader, Panel, Segmented, Stat } from '../components/ui';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function label(kind: PeriodKind, from: string, to: string) {
  const f = parseDay(from);
  if (kind === 'day') return fmtDate(from, { dateStyle: 'full' });
  if (kind === 'month') return `${MONTHS[f.getUTCMonth()]} ${f.getUTCFullYear()}`.replace(/^./, (c) => c.toUpperCase());
  if (kind === 'year') return String(f.getUTCFullYear());
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

export default function ReportsPage() {
  const { store } = useActive();
  const [kind, setKind] = useState<PeriodKind>('day');
  const [anchor, setAnchor] = useState(dayKey());
  const [from, to] = periodRange(kind, anchor);
  const data = useLiveQuery(async () => {
    const sales = await salesBetween(store.id, from, to);
    const names = new Map((await db.users.toArray()).map((u) => [u.id, u.name]));
    return { s: summarize(sales, from, to), names };
  }, [store.id, from, to]);
  const recs = useLiveQuery(() => recommendations(store.id), [store.id]) ?? [];
  const title = label(kind, from, to);
  const future = to >= dayKey() && from <= dayKey();

  return (
    <>
      <PageHeader title="Reportes de ventas" description={store.name}
        actions={data && <ExportButtons s={data.s} names={data.names} title={title} />} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Segmented label="Periodo" value={kind} onChange={setKind} options={[{ value: 'day', label: 'Día' }, { value: 'week', label: 'Semana' }, { value: 'month', label: 'Mes' }, { value: 'year', label: 'Año' }]} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" aria-label="Anterior" onClick={() => setAnchor(shiftPeriod(kind, anchor, -1))}><ChevronLeft className="size-5" /></Button>
          <p className="min-w-44 text-center font-semibold">{title}</p>
          <Button variant="ghost" size="sm" aria-label="Siguiente" disabled={future} onClick={() => setAnchor(shiftPeriod(kind, anchor, 1))}><ChevronRight className="size-5" /></Button>
        </div>
        {!future && <Button variant="ghost" size="sm" onClick={() => setAnchor(dayKey())}>Hoy</Button>}
      </div>

      {data && (
        <>
          <Panel className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
            <Stat label="Ventas totales" value={money(data.s.total)} sub={`${data.s.count} transacciones`} />
            <Stat label="Ticket promedio" value={money(data.s.average)} />
            <Stat label="IVU cobrado" value={money(data.s.ivu)} />
            <Stat label="Sin IVU" value={money(data.s.subtotal)} />
          </Panel>

          {kind !== 'day' && <Panel className="mt-5 p-5"><Bars s={data.s} kind={kind} /></Panel>}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <Panel title="Por método de pago">
              <ul className="p-5">{(['cash', 'athmovil', 'card'] as const).map((m) => {
                const v = data.s.byMethod[m];
                const p = data.s.total ? v / data.s.total : 0;
                return (
                  <li key={m} className="mb-3 last:mb-0">
                    <div className="num flex justify-between text-[15px]"><span className="font-semibold">{methodLabel(m)}</span><span>{money(v)} <span className="text-ink-3">· {Math.round(p * 100)}%</span></span></div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-cal-2"><div className="h-full rounded-full bg-facade-deep" style={{ width: `${p * 100}%` }} /></div>
                  </li>
                );
              })}</ul>
            </Panel>
            <Panel title="Por empleado">
              {data.s.byEmployee.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">Sin ventas.</p> : (
                <ul>{data.s.byEmployee.map((e) => (
                  <li key={e.employeeId} className="num flex justify-between border-b border-line/60 px-5 py-2.5 last:border-0"><span className="font-semibold">{data.names.get(e.employeeId) ?? '—'}</span><span>{money(e.total)} <span className="text-ink-3">· {e.count}</span></span></li>
                ))}</ul>
              )}
            </Panel>
          </div>

          <Panel className="mt-5" title="Lo más vendido">
            {data.s.top.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">Sin ventas en este periodo.</p> : (
              <ol>{data.s.top.slice(0, 10).map((p, i) => (
                <li key={p.productId} className="num flex items-center gap-4 border-b border-line/60 px-5 py-2.5 last:border-0">
                  <span className={clsx('grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold', i < 3 ? 'bg-facade text-ink' : 'bg-cal-2 text-ink-2')}>{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.description}</span>
                  <span>{p.qty} u.</span><span className="w-24 text-right">{money(p.revenue)}</span>
                </li>
              ))}</ol>
            )}
          </Panel>
        </>
      )}

      <Panel className="mt-5" title={<span className="flex items-center gap-2"><TrendingUp className="size-5 text-facade-deep" />Qué comprar más</span>}>
        <p className="px-5 pt-4 text-sm text-ink-2">Según las ventas de los últimos 30 días frente a los 30 anteriores. La sugerencia cubre 3 semanas de venta.</p>
        {recs.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">Aún no hay ventas suficientes para recomendar.</p> : (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[640px] text-left">
              <thead className="text-sm text-ink-2"><tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Producto</th><th className="px-3 py-3 text-right font-semibold">Vendidos (30 d)</th>
                <th className="px-3 py-3 text-right font-semibold">Quedan</th><th className="px-3 py-3 text-right font-semibold">Comprar</th><th className="px-5 py-3 font-semibold">Por qué</th></tr></thead>
              <tbody>{recs.slice(0, 15).map((r) => (
                <tr key={r.product.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-3 font-semibold">{r.product.description}</td>
                  <td className="num px-3 py-3 text-right">{r.soldThisPeriod}{r.growth != null && r.growth > 0.15 && <Badge tone="good">+{Math.round(r.growth * 100)}%</Badge>}</td>
                  <td className={clsx('num px-3 py-3 text-right', r.daysOfCover != null && r.daysOfCover < 7 && 'font-bold text-bad')}>{r.product.quantity}</td>
                  <td className="num px-3 py-3 text-right text-lg font-bold">{r.suggestedOrder || '—'}</td>
                  <td className="px-5 py-3 text-sm text-ink-2">{r.reason}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function Bars({ s, kind }: { s: SalesSummary; kind: PeriodKind }) {
  const points = useMemo(() => {
    if (kind !== 'year') return s.byDay.map((d) => ({ key: d.day, label: String(parseDay(d.day).getUTCDate()), total: d.total }));
    const m = Array.from({ length: 12 }, (_, i) => ({ key: String(i), label: MONTHS[i], total: 0 }));
    for (const d of s.byDay) m[parseDay(d.day).getUTCMonth()].total += d.total;
    return m;
  }, [s, kind]);
  const max = Math.max(1, ...points.map((p) => p.total));
  const best = points.reduce((a, b) => (b.total > a.total ? b : a), points[0]);
  return (
    <figure>
      <figcaption className="mb-3 flex justify-between text-sm text-ink-2"><span>Ventas por {kind === 'year' ? 'mes' : 'día'}</span>{best?.total > 0 && <span className="num">Mejor: {best.label} · {money(best.total)}</span>}</figcaption>
      <div className="flex h-44 items-end gap-[3px]" role="img" aria-label={`Gráfica de ventas por ${kind === 'year' ? 'mes' : 'día'}`}>
        {points.map((p) => (
          <div key={p.key} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className={clsx('rounded-t-md transition-colors', p.total ? 'bg-facade group-hover:bg-facade-deep' : 'bg-cal-2')} style={{ height: `${Math.max(2, (p.total / max) * 100)}%` }} />
            <span className="num pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-cal group-hover:block">{money(p.total)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px]">{points.map((p, i) => <span key={p.key} className="num min-w-0 flex-1 text-center text-[11px] text-ink-3">{points.length > 16 && i % 3 ? '' : p.label}</span>)}</div>
    </figure>
  );
}

function ExportButtons({ s, names, title }: { s: SalesSummary; names: Map<string, string>; title: string }) {
  const { store } = useActive();
  const [busy, setBusy] = useState<string | null>(null);
  async function go(kind: 'pdf' | 'xlsx') {
    setBusy(kind);
    try {
      const doc = await createSignedDoc('sales-report', `Ventas · ${store.name} · ${title}`, { from: s.from, to: s.to, total: s.total, count: s.count, ivu: s.ivu, ids: s.sales.map((x) => x.id) }, { storeId: store.id });
      const salesRows = s.sales.map((x) => [fmtDateTime(x.createdAt), names.get(x.employeeId) ?? '', methodLabel(x.method), x.paymentRef ?? '', x.subtotal / 100, x.ivu / 100, x.total / 100]);
      if (kind === 'xlsx') {
        downloadBlob(await buildXlsx([
          { name: 'Ventas', head: ['Fecha', 'Empleado', 'Método', 'Confirmación', 'Subtotal', 'IVU', 'Total'], rows: salesRows },
          { name: 'Productos', head: ['Producto', 'Código', 'Unidades', 'Ingreso'], rows: s.top.map((p) => [p.description, p.barcode, p.qty, p.revenue / 100]) },
        ], doc), `ventas-${s.from}-a-${s.to}.xlsx`);
      } else {
        downloadBlob(await buildPdf({ title: 'Reporte de ventas', subtitle: title, storeName: store.name, doc, blocks: [
          { type: 'kv', heading: 'Resumen', rows: [['Ventas', money(s.total)], ['Transacciones', String(s.count)], ['Ticket promedio', money(s.average)], ['IVU cobrado', money(s.ivu)],
            ['Efectivo', money(s.byMethod.cash)], ['ATH Móvil', money(s.byMethod.athmovil)], ['Tarjeta', money(s.byMethod.card)]] },
          { type: 'table', heading: 'Por empleado', head: ['Empleado', 'Ventas', 'Total'], body: s.byEmployee.map((e) => [names.get(e.employeeId) ?? '', e.count, money(e.total)]) },
          { type: 'table', heading: 'Más vendidos', head: ['Producto', 'Unidades', 'Ingreso'], body: s.top.slice(0, 25).map((p) => [p.description, p.qty, money(p.revenue)]) },
        ] }), `ventas-${s.from}-a-${s.to}.pdf`);
      }
    } finally { setBusy(null); }
  }
  return <>
    <Button variant="secondary" busy={busy === 'pdf'} onClick={() => go('pdf')} icon={<Download className="size-4" />}>PDF</Button>
    <Button variant="secondary" busy={busy === 'xlsx'} onClick={() => go('xlsx')} icon={<FileSpreadsheet className="size-4" />}>Excel</Button>
  </>;
}
