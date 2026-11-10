import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Gift, Plus, Settings2, Trash2, TriangleAlert } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { draftPayStub, getRules, periodFor, saveRules, type PayrollRules, type PayStubDraft } from '../lib/payroll';
import { issuePayroll, payStubPdf } from '../lib/flows';
import { money } from '../lib/money';
import { addDays, dayKey, downloadBlob, fmtDate, uid } from '../lib/util';
import type { DeductionType } from '../lib/types';
import { Badge, Banner, Button, Checkbox, Field, Input, MoneyInput, PageHeader, Panel, Segmented, Select, Sheet } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

export default function PayrollPage() {
  const [tab, setTab] = useState<'run' | 'bonuses' | 'deductions' | 'history'>('run');
  return (
    <>
      <PageHeader title="Nómina" description="Se calcula con los ponches. Los talonarios salen firmados y se envían por email a cada empleado." />
      <div className="mb-5 overflow-x-auto"><Segmented label="Sección" value={tab} onChange={setTab} options={[
        { value: 'run', label: 'Preparar nómina' }, { value: 'bonuses', label: 'Bonos' }, { value: 'deductions', label: 'Deducciones' }, { value: 'history', label: 'Emitidas' },
      ]} /></div>
      {tab === 'run' && <RunPayroll />}
      {tab === 'bonuses' && <Bonuses />}
      {tab === 'deductions' && <Deductions />}
      {tab === 'history' && <History />}
    </>
  );
}

function RunPayroll() {
  const { store } = useActive();
  const toast = useToast();
  const [rules, setRules] = useState<PayrollRules | null>(null);
  const [period, setPeriod] = useState<[string, string] | null>(null);
  const [drafts, setDrafts] = useState<PayStubDraft[] | null>(null);
  const [skip, setSkip] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [cfg, setCfg] = useState(false);
  const emps = useLiveQuery(() => db.users.filter((u) => u.role === 'employee' && u.active && u.storeIds.includes(store.id)).sortBy('name'), [store.id]) ?? [];

  useEffect(() => { getRules().then((r) => { setRules(r); setPeriod(periodFor(addDays(dayKey(), -1), r.frequency)); }); }, []);
  useEffect(() => { setDrafts(null); }, [period, store.id]);
  if (!rules || !period) return null;

  async function calc() {
    setBusy(true);
    try { setDrafts(await Promise.all(emps.map((e) => draftPayStub(e, store.id, period![0], period![1])))); }
    catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }
  async function issue() {
    const list = drafts!.filter((d) => !skip.has(d.employeeId) && d.gross > 0);
    if (!list.length) return toast('No hay talonarios con pago en este periodo.', 'bad');
    if (!confirm(`Emitir ${list.length} talonarios firmados y enviarlos por email?`)) return;
    setBusy(true);
    try { await issuePayroll(list, store); toast(`${list.length} talonarios emitidos`); setDrafts(null); }
    catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }
  const name = new Map(emps.map((e) => [e.id, e.name]));
  const totals = drafts?.filter((d) => !skip.has(d.employeeId)).reduce((a, d) => ({ gross: a.gross + d.gross, net: a.net + d.net }), { gross: 0, net: 0 });

  return (
    <>
      <Panel className="flex flex-wrap items-end gap-4 p-5">
        <Field label="Desde" htmlFor="p0"><Input id="p0" type="date" value={period[0]} onChange={(e) => setPeriod([e.target.value, period[1]])} /></Field>
        <Field label="Hasta" htmlFor="p1"><Input id="p1" type="date" value={period[1]} onChange={(e) => setPeriod([period[0], e.target.value])} /></Field>
        <Button variant="ghost" onClick={() => setPeriod(periodFor(addDays(period[0], -1), rules.frequency))}>‹ Periodo anterior</Button>
        <Button variant="ghost" onClick={() => setCfg(true)} icon={<Settings2 className="size-4" />}>Reglas</Button>
        <Button className="sm:ml-auto" busy={busy && !drafts} onClick={calc} disabled={!emps.length}>Calcular {emps.length} {emps.length === 1 ? 'empleado' : 'empleados'}</Button>
      </Panel>
      <p className="mt-2 text-sm text-ink-2">Horas extra: más de {rules.dailyOvertimeAfter ?? '—'} h al día o {rules.weeklyOvertimeAfter} h a la semana, a {rules.overtimeMultiplier}× si el empleado no tiene tarifa propia.</p>

      {drafts && (
        <Panel className="mt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead className="text-sm text-ink-2"><tr className="border-b border-line">
                <th className="w-12 px-5 py-3" /><th className="px-3 py-3 font-semibold">Empleado</th>
                <th className="px-3 py-3 text-right font-semibold">Horas</th><th className="px-3 py-3 text-right font-semibold">Extra</th>
                <th className="px-3 py-3 text-right font-semibold">Bonos</th><th className="px-3 py-3 text-right font-semibold">Bruto</th>
                <th className="px-3 py-3 text-right font-semibold">Deducciones</th><th className="px-5 py-3 text-right font-semibold">Neto</th></tr></thead>
              <tbody>{drafts.map((d) => (
                <tr key={d.employeeId} className={`border-b border-line/60 last:border-0 ${skip.has(d.employeeId) ? 'opacity-45' : ''}`}>
                  <td className="px-5 py-3"><Checkbox label={<span className="sr-only">Incluir</span>} checked={!skip.has(d.employeeId)} onChange={(v) => setSkip((s) => { const n = new Set(s); if (v) n.delete(d.employeeId); else n.add(d.employeeId); return n; })} /></td>
                  <td className="px-3 py-3 font-semibold">{name.get(d.employeeId)} {d.openPunches > 0 && <Badge tone="warn"><TriangleAlert className="size-3" />{d.openPunches} sin salida</Badge>}</td>
                  <td className="num px-3 py-3 text-right">{d.regularHours.toFixed(2)}</td>
                  <td className="num px-3 py-3 text-right">{d.overtimeHours.toFixed(2)}</td>
                  <td className="num px-3 py-3 text-right">{money(d.bonuses.reduce((a, b) => a + b.amount, 0))}</td>
                  <td className="num px-3 py-3 text-right">{money(d.gross)}</td>
                  <td className="num px-3 py-3 text-right text-ink-2" title={d.deductions.map((x) => `${x.label}: ${money(x.amount)}`).join('\n')}>−{money(d.deductions.reduce((a, b) => a + b.amount, 0))}</td>
                  <td className="num px-5 py-3 text-right text-lg font-bold">{money(d.net)}</td>
                </tr>
              ))}</tbody>
              {totals && <tfoot><tr className="bg-cal font-bold"><td colSpan={5} className="px-5 py-3">Total</td><td className="num px-3 py-3 text-right">{money(totals.gross)}</td><td /><td className="num px-5 py-3 text-right">{money(totals.net)}</td></tr></tfoot>}
            </table>
          </div>
          {drafts.some((d) => d.openPunches > 0) && <div className="px-5 pt-4"><Banner tone="warn">Hay entradas sin salida; esas horas no se pagan hasta que se corrija el ponche en Ponches.</Banner></div>}
          <div className="flex justify-end p-5"><Button size="lg" busy={busy} onClick={issue}>Emitir y enviar talonarios</Button></div>
        </Panel>
      )}
      {cfg && <RulesSheet rules={rules} onClose={(r) => { if (r) { setRules(r); setPeriod(periodFor(addDays(dayKey(), -1), r.frequency)); } setCfg(false); }} />}
    </>
  );
}

function RulesSheet({ rules, onClose }: { rules: PayrollRules; onClose: (r?: PayrollRules) => void }) {
  const [r, setR] = useState(rules);
  const [daily, setDaily] = useState(rules.dailyOvertimeAfter != null);
  return (
    <Sheet open onClose={() => onClose()} title="Reglas de nómina" footer={<Button size="lg" className="w-full" onClick={async () => { const v = { ...r, dailyOvertimeAfter: daily ? r.dailyOvertimeAfter ?? 8 : null }; await saveRules(v); onClose(v); }}>Guardar</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Frecuencia de pago" htmlFor="fq"><Select id="fq" value={r.frequency} onChange={(e) => setR({ ...r, frequency: e.target.value as PayrollRules['frequency'] })}>
          <option value="weekly">Semanal</option><option value="biweekly">Bisemanal</option><option value="semimonthly">Quincenal (1–15, 16–fin)</option><option value="monthly">Mensual</option></Select></Field>
        <Field label="Extra después de (horas por semana)" htmlFor="wo"><Input id="wo" inputMode="numeric" className="num w-32" value={r.weeklyOvertimeAfter} onChange={(e) => setR({ ...r, weeklyOvertimeAfter: Number(e.target.value) || 40 })} /></Field>
        <Checkbox label="Pagar extra después de cierta cantidad de horas al día" checked={daily} onChange={setDaily} />
        {daily && <Field label="Horas diarias" htmlFor="do"><Input id="do" inputMode="numeric" className="num w-32" value={r.dailyOvertimeAfter ?? 8} onChange={(e) => setR({ ...r, dailyOvertimeAfter: Number(e.target.value) || 8 })} /></Field>}
        <Field label="Multiplicador de horas extra" htmlFor="mu" hint="Se usa cuando el empleado no tiene una paga de extra propia."><Input id="mu" inputMode="decimal" className="num w-32" value={r.overtimeMultiplier} onChange={(e) => setR({ ...r, overtimeMultiplier: Number(e.target.value) || 1.5 })} /></Field>
      </div>
    </Sheet>
  );
}

function Bonuses() {
  const { store } = useActive();
  const toast = useToast();
  const emps = useLiveQuery(() => db.users.filter((u) => u.role === 'employee' && u.active && u.storeIds.includes(store.id)).sortBy('name'), [store.id]) ?? [];
  const bonuses = useLiveQuery(() => db.bonuses.orderBy('date').reverse().limit(100).toArray(), []) ?? [];
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState<number | undefined>();
  const [date, setDate] = useState(dayKey());
  const [desc, setDesc] = useState('');
  const name = new Map(emps.map((e) => [e.id, e.name]));
  async function add() {
    if (!sel.size || !amount) return toast('Elige empleados y el monto del bono.', 'bad');
    await db.bonuses.bulkAdd([...sel].map((employeeId) => ({ id: uid(), employeeId, amount, date, description: desc.trim() || 'Bono' })));
    toast(`Bono añadido a ${sel.size}`); setSel(new Set()); setAmount(undefined); setDesc('');
  }
  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <Panel className="h-fit p-5" title={undefined}>
        <p className="mb-4 flex items-center gap-2 font-bold"><Gift className="size-5 text-facade-deep" />Nuevo bono</p>
        <div className="flex flex-col gap-4">
          <Field label="Descripción" htmlFor="bd"><Input id="bd" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Bono de Navidad" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto" htmlFor="ba"><MoneyInput id="ba" value={amount} onChange={setAmount} /></Field>
            <Field label="Fecha de pago" htmlFor="bf" hint="Entra en la nómina que cubra esta fecha."><Input id="bf" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <fieldset className="flex flex-col gap-2"><legend className="mb-1 text-sm font-semibold">Para</legend>
            <Checkbox label={<b>Todos</b>} checked={sel.size === emps.length && emps.length > 0} onChange={(v) => setSel(v ? new Set(emps.map((e) => e.id)) : new Set())} />
            {emps.map((e) => <Checkbox key={e.id} label={e.name} checked={sel.has(e.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n; })} />)}
          </fieldset>
          <Button onClick={add} icon={<Plus className="size-4" />}>Añadir bono</Button>
        </div>
      </Panel>
      <Panel title="Bonos programados">
        {bonuses.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">No hay bonos.</p> : (
          <ul>{bonuses.map((b) => (
            <li key={b.id} className="flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1"><p className="font-semibold">{b.description} · {name.get(b.employeeId) ?? '—'}</p><p className="text-sm text-ink-2">{fmtDate(b.date)}</p></div>
              <span className="num font-bold">{money(b.amount)}</span>
              {b.payStubId ? <Badge tone="good">Pagado</Badge> : <Button size="sm" variant="ghost" aria-label="Eliminar bono" onClick={() => db.bonuses.delete(b.id)}><Trash2 className="size-4" /></Button>}
            </li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
}

function Deductions() {
  const toast = useToast();
  const list = useLiveQuery(() => db.deductions.toArray(), []) ?? [];
  const [editing, setEditing] = useState<DeductionType | null>(null);
  return (
    <>
      <Panel title="Deducciones" actions={<Button size="sm" onClick={() => setEditing({ id: uid(), name: '', kind: 'percent', value: 0, active: true })} icon={<Plus className="size-4" />}>Añadir</Button>}>
        <ul>{list.map((d) => (
          <li key={d.id} className="flex items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{d.name} {!d.active && <Badge>Inactiva</Badge>}</p>
              <p className="num text-sm text-ink-2">{d.kind === 'percent' ? `${+(d.value * 100).toFixed(3)}% del bruto` : d.kind === 'fixed' ? `${money(d.value)} fijo por periodo` : 'Monto de cada empleado (en Empleados)'}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(d)}>Editar</Button>
          </li>
        ))}</ul>
      </Panel>
      <p className="mt-3 text-sm text-ink-2">Cada empleado tiene sus propias deducciones marcadas. Cámbialas en Empleados › seleccionar › Editar seleccionados.</p>
      {editing && <DeductionSheet d={editing} onClose={() => setEditing(null)} onSaved={() => toast('Deducción guardada')} />}
    </>
  );
}

function DeductionSheet({ d, onClose, onSaved }: { d: DeductionType; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState(d);
  const [pctText, setPctText] = useState(d.kind === 'percent' ? String(+(d.value * 100).toFixed(4)) : '');
  const isNew = !d.name;
  async function save() {
    if (!v.name.trim()) return;
    const value = v.kind === 'percent' ? Number(pctText) / 100 : v.value;
    await db.deductions.put({ ...v, name: v.name.trim(), value });
    if (isNew) {
      const emps = await db.users.where('role').equals('employee').toArray();
      if (emps.length && confirm(`¿Aplicar "${v.name}" a todos los empleados?`)) {
        await db.transaction('rw', db.users, async () => { for (const e of emps) await db.users.update(e.id, { deductionIds: [...new Set([...e.deductionIds, v.id])] }); });
      }
    }
    onSaved(); onClose();
  }
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Nueva deducción' : d.name} footer={<div className="flex gap-3">
      <Button size="lg" className="flex-1" onClick={save}>Guardar</Button>
      {!isNew && !d.builtin && <Button size="lg" variant="danger" onClick={async () => { if (confirm('¿Eliminar esta deducción?')) { await db.deductions.delete(d.id); onClose(); } }}>Eliminar</Button>}
    </div>}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="dn"><Input id="dn" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={d.builtin} placeholder="Préstamo, uniforme, retención…" /></Field>
        {v.kind !== 'healthPlan' && <Field label="Tipo" htmlFor="dk"><Select id="dk" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as DeductionType['kind'] })} disabled={d.builtin}><option value="percent">Porcentaje del bruto</option><option value="fixed">Monto fijo por periodo</option></Select></Field>}
        {v.kind === 'percent' && <Field label="Porcentaje" htmlFor="dp"><Input id="dp" inputMode="decimal" className="num w-32" value={pctText} onChange={(e) => setPctText(e.target.value)} /></Field>}
        {v.kind === 'fixed' && <Field label="Monto" htmlFor="dm"><MoneyInput id="dm" value={v.value} onChange={(c) => setV({ ...v, value: c ?? 0 })} /></Field>}
        {v.kind === 'healthPlan' && <p className="text-ink-2">El monto del plan médico se pone por empleado (puede ser distinto para cada uno).</p>}
        <Checkbox label="Activa" checked={v.active} onChange={(a) => setV({ ...v, active: a })} />
      </div>
    </Sheet>
  );
}

function History() {
  const { store } = useActive();
  const data = useLiveQuery(async () => ({
    stubs: (await db.payStubs.orderBy('periodEnd').reverse().toArray()).filter((s) => s.storeId === store.id).slice(0, 200),
    names: new Map((await db.users.toArray()).map((u) => [u.id, u.name])),
  }), [store.id]);
  if (!data) return null;
  return (
    <Panel>
      {data.stubs.length === 0 ? <p className="px-5 py-10 text-center text-ink-2">Aún no se han emitido talonarios.</p> : (
        <ul>{data.stubs.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
            <div className="min-w-0 flex-1"><p className="font-semibold">{data.names.get(s.employeeId)}</p><p className="num text-sm text-ink-2">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)} · {(s.regularHours + s.overtimeHours).toFixed(2)} h</p></div>
            <span className="num font-bold">{money(s.net)}</span>
            <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await payStubPdf(s), `talonario-${s.periodEnd}.pdf`)}>PDF</Button>
          </li>
        ))}</ul>
      )}
    </Panel>
  );
}
