import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardCheck, Download } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { shiftReportBlocks, shiftTotals } from '../lib/flows';
import { buildPdf } from '../lib/exporters';
import { lowStock } from '../lib/inventory';
import { money } from '../lib/money';
import { downloadBlob, fmtDate, fmtDateTime, fmtTime } from '../lib/util';
import { Badge, Button, Empty, PageHeader, Panel, Stat } from '../components/ui';

export default function ShiftsPage() {
  const { id } = useParams();
  return id ? <ShiftDetail id={id} /> : <ShiftList />;
}

function ShiftList() {
  const { store } = useActive();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const shifts = (await db.shifts.where('storeId').equals(store.id).toArray()).sort((a, b) => b.openedAt - a.openedAt).slice(0, 200);
    const users = new Map((await db.users.toArray()).map((u) => [u.id, u]));
    return { shifts, users };
  }, [store.id]);
  if (!data) return null;
  return (
    <>
      <PageHeader title="Cierres de turno" description="Cada cierre incluye el cuadre de efectivo, las transacciones y el inventario bajo." />
      <Panel>
        {data.shifts.length === 0 ? <Empty icon={<ClipboardCheck className="size-7" />} title="Sin turnos todavía">Los turnos aparecen aquí cuando un empleado abre caja.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-sm text-ink-2"><tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Empleado</th><th className="px-3 py-3 font-semibold">Fecha</th>
                <th className="px-3 py-3 text-right font-semibold">Ventas</th><th className="px-3 py-3 text-right font-semibold">Total</th>
                <th className="px-5 py-3 text-right font-semibold">Cuadre</th></tr></thead>
              <tbody>
                {data.shifts.map((s) => {
                  const total = (s.cashSales ?? 0) + (s.cardSales ?? 0) + (s.athSales ?? 0);
                  return (
                    <tr key={s.id} onClick={() => nav(`/turnos/${s.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-cal">
                      <td className="px-5 py-3 font-semibold"><Link to={`/turnos/${s.id}`} onClick={(e) => e.stopPropagation()}>{data.users.get(s.employeeId)?.name ?? '—'}</Link></td>
                      <td className="num px-3 py-3 text-ink-2">{fmtDate(s.openedAt)} · {fmtTime(s.openedAt)}{s.closedAt ? `–${fmtTime(s.closedAt)}` : ''}</td>
                      <td className="num px-3 py-3 text-right">{s.salesCount ?? '—'}</td>
                      <td className="num px-3 py-3 text-right font-semibold">{s.closedAt ? money(total) : '—'}</td>
                      <td className="px-5 py-3 text-right">{!s.closedAt ? <Badge tone="facade">Abierto</Badge> : s.difference === 0 ? <Badge tone="good">Cuadra</Badge> : <Badge tone="bad">{s.difference! > 0 ? '+' : '−'}{money(Math.abs(s.difference!))}</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

function ShiftDetail({ id }: { id: string }) {
  const { store } = useActive();
  const data = useLiveQuery(async () => {
    const s = await db.shifts.get(id);
    if (!s) return null;
    return { s, emp: await db.users.get(s.employeeId), t: await shiftTotals(s), doc: s.reportDocId ? await db.docs.get(s.reportDocId) : undefined };
  }, [id]);
  if (data === undefined) return null;
  if (data === null) return <p>Turno no encontrado.</p>;
  const { s, emp, t, doc } = data;

  async function download() {
    const low = doc ? (doc.payload as { low: { description: string; quantity: number }[] }).low : (await lowStock(store));
    const pdf = await buildPdf({ title: 'Reporte de cierre de turno', subtitle: `${emp?.name} · ${fmtDate(s.closedAt ?? s.openedAt)}`, storeName: store.name, blocks: shiftReportBlocks(s, emp, t, low), doc });
    downloadBlob(pdf, `cierre-${s.id.slice(0, 8)}.pdf`);
  }

  return (
    <>
      <Link to="/turnos" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Cierres de turno</Link>
      <PageHeader title={`Turno de ${emp?.name ?? '—'}`} description={`${fmtDateTime(s.openedAt)}${s.closedAt ? ` – ${fmtDateTime(s.closedAt)}` : ' · abierto'}`}
        actions={<Button variant="secondary" onClick={download} icon={<Download className="size-4" />}>Descargar PDF</Button>} />
      <Panel className="grid grid-cols-2 gap-6 p-5 md:grid-cols-5">
        <Stat label="Efectivo esperado" value={money(t.expectedCash)} />
        <Stat label="Efectivo contado" value={s.countedCash != null ? money(s.countedCash) : '—'} />
        <Stat label="Diferencia" value={s.difference == null ? '—' : s.difference === 0 ? 'Cuadra' : money(s.difference)} tone={s.difference == null ? undefined : s.difference === 0 ? 'good' : 'bad'} />
        <Stat label="Tarjetas" value={money(t.cardSales)} />
        <Stat label="ATH Móvil" value={money(t.athSales)} />
      </Panel>
      {s.notes && <p className="mt-4 rounded-xl bg-white p-4 ring-1 ring-line"><b>Notas del empleado:</b> {s.notes}</p>}
      <Panel className="mt-5" title={`Transacciones (${t.sales.length})`}>
        <ul>
          {t.sales.map((x) => (
            <li key={x.id} className="num flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-2.5 last:border-0">
              <span className="w-20 shrink-0 whitespace-nowrap text-ink-2">{fmtTime(x.createdAt)}</span>
              <span className="min-w-40 flex-1 truncate">{x.items.map((i) => `${i.qty}× ${i.description}`).join(', ')}</span>
              <span className="text-sm text-ink-2">{x.method === 'cash' ? 'Efectivo' : x.method === 'card' ? 'Tarjeta' : 'ATH Móvil'}{x.paymentRef ? ` · ${x.paymentRef}` : ''}</span>
              <span className="w-20 text-right font-semibold">{money(x.total)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
