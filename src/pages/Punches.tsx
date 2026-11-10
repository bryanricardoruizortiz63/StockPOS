import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, MonitorSmartphone, Plus, ShieldAlert, ShieldCheck } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { exportPunches, punchMethodLabel } from '../lib/flows';
import { recordPunch, verifyChain } from '../lib/timeclock';
import { pairPunches } from '../lib/payroll';
import { addDays, dayKey, downloadBlob, fmtDateTime } from '../lib/util';
import { Badge, Banner, Button, Field, Input, PageHeader, Panel, Select, Sheet } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

const startTs = (d: string) => new Date(`${d}T00:00:00-04:00`).getTime();
const endTs = (d: string) => new Date(`${d}T23:59:59.999-04:00`).getTime();

export default function PunchesPage() {
  const { store } = useActive();
  const toast = useToast();
  const [from, setFrom] = useState(addDays(dayKey(), -13));
  const [to, setTo] = useState(dayKey());
  const [emp, setEmp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const chain = useLiveQuery(verifyChain, []);
  const employees = useLiveQuery(() => db.users.filter((u) => u.storeIds.includes(store.id)).sortBy('name'), [store.id]) ?? [];
  const names = useMemo(() => new Map(employees.map((u) => [u.id, u.name])), [employees]);
  const punches = useLiveQuery(async () => (await db.punches.where('at').between(startTs(from), endTs(to), true, true).toArray())
    .filter((p) => p.storeId === store.id && (!emp || p.employeeId === emp)).sort((a, b) => b.at - a.at), [from, to, emp, store.id]) ?? [];

  const hours = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of new Set(punches.map((p) => p.employeeId))) {
      const { intervals } = pairPunches(punches.filter((p) => p.employeeId === id));
      m.set(id, intervals.reduce((h, iv) => h + (iv.out - iv.in) / 36e5, 0));
    }
    return m;
  }, [punches]);

  async function exp(kind: 'pdf' | 'xlsx') {
    setBusy(kind);
    try {
      const who = emp ? names.get(emp) : 'Todos';
      const r = await exportPunches(startTs(from), endTs(to), `Ponches · ${who} · ${store.name}`, emp || undefined);
      downloadBlob(kind === 'pdf' ? r.pdf : r.xlsx, `ponches-${from}-a-${to}.${kind}`);
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Ponches" description="Cada ponche va firmado y encadenado al anterior. Si alguien lo altera, la verificación lo detecta."
        actions={<>
          <Link to="/kiosko"><Button variant="secondary" icon={<MonitorSmartphone className="size-4" />}>Pantalla de QR</Button></Link>
          <Button variant="secondary" onClick={() => setManual(true)} icon={<Plus className="size-4" />}>Ponche manual</Button>
        </>} />
      {chain && (chain.ok
        ? <Banner tone="good" icon={<ShieldCheck className="size-5 shrink-0" />}>Registro íntegro: {chain.count} ponches verificados.</Banner>
        : <Banner tone="bad" icon={<ShieldAlert className="size-5 shrink-0" />}>La cadena está rota en el ponche #{chain.brokenAt}. Ese registro o uno posterior fue alterado.</Banner>)}

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Field label="Desde" htmlFor="f"><Input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Hasta" htmlFor="t"><Input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Empleado" htmlFor="e"><Select id="e" value={emp} onChange={(e) => setEmp(e.target.value)} className="min-w-48"><option value="">Todos</option>{employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <div className="flex gap-2 sm:ml-auto">
          <Button variant="secondary" busy={busy === 'pdf'} onClick={() => exp('pdf')} icon={<Download className="size-4" />}>PDF</Button>
          <Button variant="secondary" busy={busy === 'xlsx'} onClick={() => exp('xlsx')} icon={<FileSpreadsheet className="size-4" />}>Excel</Button>
        </div>
      </div>

      {hours.size > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {[...hours].map(([id, h]) => <span key={id} className="num rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-line"><b>{names.get(id) ?? '—'}</b> · {h.toFixed(2)} h</span>)}
        </div>
      )}

      <Panel className="mt-4">
        {punches.length === 0 ? <p className="px-5 py-10 text-center text-ink-2">No hay ponches en estas fechas.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-sm text-ink-2"><tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Empleado</th><th className="px-3 py-3 font-semibold">Tipo</th><th className="px-3 py-3 font-semibold">Fecha y hora</th>
                <th className="px-3 py-3 font-semibold">Método</th><th className="px-5 py-3 font-semibold">Hash</th></tr></thead>
              <tbody>{punches.map((p) => (
                <tr key={p.id} className="border-b border-line/60 last:border-0">
                  <td className="px-5 py-2.5 font-semibold">{names.get(p.employeeId) ?? '—'}</td>
                  <td className="px-3 py-2.5"><Badge tone={p.type === 'in' ? 'good' : 'neutral'}>{p.type === 'in' ? 'Entrada' : 'Salida'}</Badge></td>
                  <td className="num px-3 py-2.5">{fmtDateTime(p.at)}</td>
                  <td className="px-3 py-2.5 text-sm text-ink-2">{punchMethodLabel(p.method)}{p.distanceM != null ? ` · ${p.distanceM} m` : ''}{p.note ? ` · ${p.note}` : ''}</td>
                  <td className="num px-5 py-2.5 text-sm text-ink-3">{p.hash.slice(0, 12)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <ManualPunch open={manual} onClose={() => setManual(false)} employees={employees.filter((u) => u.role === 'employee')} />
    </>
  );
}

function ManualPunch({ open, onClose, employees }: { open: boolean; onClose: () => void; employees: { id: string; name: string }[] }) {
  const { store, user } = useActive();
  const toast = useToast();
  const [emp, setEmp] = useState('');
  const [type, setType] = useState<'in' | 'out'>('in');
  const [when, setWhen] = useState(() => new Date(Date.now() - 4 * 36e5).toISOString().slice(0, 16));
  const [note, setNote] = useState('');
  async function save() {
    if (!emp || !note.trim()) return toast('Elige el empleado y explica la corrección.', 'bad');
    try {
      await recordPunch({ storeId: store.id, employeeId: emp, method: 'manual', type, at: new Date(when + ':00-04:00').getTime(), note: `${note.trim()} (por ${user.name})` });
      toast('Ponche manual registrado'); onClose(); setNote('');
    } catch (e) { toast(errMsg(e), 'bad'); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Ponche manual" footer={<Button className="w-full" size="lg" onClick={save}>Registrar</Button>}>
      <p className="mb-4 text-ink-2">Para corregir un ponche olvidado. Queda marcado como manual, con tu nombre y la razón; no reemplaza ni borra ponches existentes.</p>
      <div className="flex flex-col gap-4">
        <Field label="Empleado" htmlFor="me"><Select id="me" value={emp} onChange={(e) => setEmp(e.target.value)}><option value="">Elegir…</option>{employees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo" htmlFor="mt"><Select id="mt" value={type} onChange={(e) => setType(e.target.value as 'in' | 'out')}><option value="in">Entrada</option><option value="out">Salida</option></Select></Field>
          <Field label="Fecha y hora (PR)" htmlFor="mw"><Input id="mw" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        </div>
        <Field label="Razón" htmlFor="mn"><Input id="mn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Olvidó ponchar la salida" /></Field>
      </div>
    </Sheet>
  );
}
