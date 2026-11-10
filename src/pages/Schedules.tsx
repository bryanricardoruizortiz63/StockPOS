import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, Copy } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { blockHours, occurrences, WEEKDAYS, WEEKDAYS_SHORT, weeklyScheduledHours } from '../lib/schedules';
import { addDays, clsx, dayKey, parseDay, startOfWeek, uid } from '../lib/util';
import type { Schedule, ScheduleBlock } from '../lib/types';
import { Button, Checkbox, Field, Input, PageHeader, Panel, Segmented, Select, Sheet } from '../components/ui';
import { useToast } from '../components/toast';

export default function SchedulesPage() {
  const { store } = useActive();
  const [week, setWeek] = useState(startOfWeek(dayKey()));
  const [edit, setEdit] = useState<string[] | null>(null);
  const data = useLiveQuery(async () => {
    const emps = (await db.users.filter((u) => u.role === 'employee' && u.active && u.storeIds.includes(store.id)).toArray()).sort((a, b) => a.name.localeCompare(b.name));
    const scheds = await db.schedules.where('storeId').equals(store.id).toArray();
    return { emps, scheds };
  }, [store.id]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  if (!data) return null;

  return (
    <>
      <PageHeader title="Horarios" description="Fijos o rotativos cada cierta cantidad de semanas. Cada empleado ve el suyo en Mi horario."
        actions={<Button onClick={() => setEdit(data.emps.map((e) => e.id).slice(0, 1))} icon={<CalendarPlus className="size-4" />} disabled={!data.emps.length}>Asignar horario</Button>} />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => setWeek(addDays(week, -7))} aria-label="Semana anterior">‹</Button>
        <p className="num min-w-56 text-center font-semibold">Semana del {parseDay(week).getUTCDate()}/{parseDay(week).getUTCMonth() + 1}</p>
        <Button variant="secondary" size="sm" onClick={() => setWeek(addDays(week, 7))} aria-label="Semana siguiente">›</Button>
        <Button variant="ghost" size="sm" onClick={() => setWeek(startOfWeek(dayKey()))}>Hoy</Button>
      </div>
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed text-left">
            <thead><tr className="border-b border-line text-sm text-ink-2">
              <th className="w-48 px-5 py-3 font-semibold">Empleado</th>
              {days.map((d) => <th key={d} className={clsx('px-2 py-3 text-center font-semibold', d === dayKey() && 'text-facade-deep')}>{WEEKDAYS_SHORT[parseDay(d).getUTCDay()]} <span className="num">{parseDay(d).getUTCDate()}</span></th>)}
              <th className="w-20 px-3 py-3 text-right font-semibold">Horas</th>
            </tr></thead>
            <tbody>
              {data.emps.map((e) => {
                const s = data.scheds.find((x) => x.employeeId === e.id);
                const occ = s ? occurrences(s, days[0], days[6]) : [];
                const h = occ.reduce((a, o) => a + blockHours(o.start, o.end), 0);
                return (
                  <tr key={e.id} className="border-b border-line/60 last:border-0">
                    <td className="px-5 py-2"><button className="text-left font-semibold hover:underline" onClick={() => setEdit([e.id])}>{e.name}</button>
                      <p className="text-xs text-ink-2">{s ? (s.kind === 'fixed' ? 'Fijo' : `Rota cada ${s.cycleWeeks} sem.`) : 'Sin horario'}</p></td>
                    {days.map((d) => {
                      const o = occ.filter((x) => x.day === d);
                      return <td key={d} className="px-1.5 py-2 text-center">{o.length ? o.map((x, i) => <span key={i} className="num block rounded-lg bg-facade-wash px-1 py-1 text-xs font-semibold text-facade-deep">{x.start}–{x.end}</span>) : <span className="text-xs text-ink-3">—</span>}</td>;
                    })}
                    <td className={clsx('num px-3 py-2 text-right font-semibold', h > e.weeklyHours && 'text-warn')}>{h.toFixed(1)}<span className="block text-xs font-normal text-ink-3">de {e.weeklyHours}</span></td>
                  </tr>
                );
              })}
              {!data.emps.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-ink-2">Añade empleados a esta tienda para asignar horarios.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
      {edit && <ScheduleEditor initial={edit} emps={data.emps} scheds={data.scheds} onClose={() => setEdit(null)} />}
    </>
  );
}

type Grid = Record<string, { start: string; end: string }>; // `${week}-${weekday}`

function ScheduleEditor({ initial, emps, scheds, onClose }: { initial: string[]; emps: { id: string; name: string }[]; scheds: Schedule[]; onClose: () => void }) {
  const { store } = useActive();
  const toast = useToast();
  const base = scheds.find((s) => s.employeeId === initial[0]);
  const [sel, setSel] = useState<Set<string>>(new Set(initial));
  const [kind, setKind] = useState<Schedule['kind']>(base?.kind ?? 'fixed');
  const [cycle, setCycle] = useState(base?.cycleWeeks ?? 2);
  const [startDate, setStartDate] = useState(base?.startDate ?? startOfWeek(dayKey()));
  const [grid, setGrid] = useState<Grid>(() => Object.fromEntries((base?.blocks ?? []).map((b) => [`${b.week}-${b.weekday}`, { start: b.start, end: b.end }])));
  const weeks = kind === 'fixed' ? 1 : cycle;
  const [tab, setTab] = useState(0);

  const set = (w: number, d: number, k: 'start' | 'end', v: string) => setGrid((g) => ({ ...g, [`${w}-${d}`]: { start: g[`${w}-${d}`]?.start ?? '', end: g[`${w}-${d}`]?.end ?? '', [k]: v } }));
  const blocks = useMemo<ScheduleBlock[]>(() => Object.entries(grid).flatMap(([k, v]) => {
    const [w, d] = k.split('-').map(Number);
    return w < weeks && v.start && v.end ? [{ week: kind === 'fixed' ? 0 : w, weekday: d, start: v.start, end: v.end }] : [];
  }), [grid, weeks, kind]);

  function copyMonToFri(w: number) {
    const src = grid[`${w}-1`];
    if (!src?.start) return toast('Primero llena el lunes.', 'bad');
    setGrid((g) => ({ ...g, ...Object.fromEntries([2, 3, 4, 5].map((d) => [`${w}-${d}`, { ...src }])) }));
  }

  async function save() {
    if (!sel.size) return toast('Elige al menos un empleado.', 'bad');
    await db.transaction('rw', db.schedules, async () => {
      for (const id of sel) {
        const existing = scheds.find((s) => s.employeeId === id);
        await db.schedules.put({ id: existing?.id ?? uid(), employeeId: id, storeId: store.id, kind, cycleWeeks: weeks, startDate, blocks, updatedAt: Date.now() });
      }
    });
    toast(`Horario guardado para ${sel.size} ${sel.size === 1 ? 'empleado' : 'empleados'}`);
    onClose();
  }

  const preview: Schedule = { id: 'p', employeeId: '', storeId: '', kind, cycleWeeks: weeks, startDate, blocks, updatedAt: 0 };
  return (
    <Sheet open onClose={onClose} title="Asignar horario" wide footer={<Button size="lg" className="w-full" onClick={save}>Guardar para {sel.size} {sel.size === 1 ? 'empleado' : 'empleados'}</Button>}>
      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-semibold">Empleados (uno, varios o todos)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Checkbox label={<b>Todos</b>} checked={sel.size === emps.length} onChange={(v) => setSel(v ? new Set(emps.map((e) => e.id)) : new Set())} />
          {emps.map((e) => <Checkbox key={e.id} label={e.name} checked={sel.has(e.id)} onChange={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(e.id); else n.delete(e.id); return n; })} />)}
        </div>
      </fieldset>
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <Segmented label="Tipo" value={kind} onChange={(v) => { setKind(v); setTab(0); }} options={[{ value: 'fixed', label: 'Fijo' }, { value: 'rotation', label: 'Rotativo' }]} />
        {kind === 'rotation' && <Field label="Se repite cada" htmlFor="cy"><Select id="cy" value={cycle} onChange={(e) => { setCycle(Number(e.target.value)); setTab(0); }} className="w-40">{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} semanas</option>)}</Select></Field>}
        <Field label={kind === 'fixed' ? 'Desde' : 'La semana 1 empieza'} htmlFor="sd"><Input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></Field>
      </div>
      {kind === 'rotation' && (
        <div className="mb-3 flex gap-1.5">{Array.from({ length: weeks }, (_, w) => (
          <button key={w} onClick={() => setTab(w)} className={clsx('h-9 rounded-lg px-3 text-sm font-semibold', tab === w ? 'bg-adoquin text-on-adoquin' : 'bg-cal-2 text-ink-2')}>Semana {w + 1}</button>
        ))}</div>
      )}
      <div className="rounded-2xl bg-white ring-1 ring-line">
        {WEEKDAYS.map((name, d) => {
          const v = grid[`${tab}-${d}`];
          return (
            <div key={d} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0">
              <span className="w-24 font-semibold">{name}</span>
              <Input aria-label={`${name} entrada`} type="time" value={v?.start ?? ''} onChange={(e) => set(tab, d, 'start', e.target.value)} className="num w-32" />
              <span className="text-ink-3">a</span>
              <Input aria-label={`${name} salida`} type="time" value={v?.end ?? ''} onChange={(e) => set(tab, d, 'end', e.target.value)} className="num w-32" />
              {v?.start && v?.end ? <span className="num text-sm text-ink-2">{blockHours(v.start, v.end).toFixed(1)} h</span> : <span className="text-sm text-ink-3">Libre</span>}
              {v?.start && <button className="ml-auto text-sm font-semibold text-ink-2 hover:text-ink" onClick={() => setGrid((g) => { const n = { ...g }; delete n[`${tab}-${d}`]; return n; })}>Quitar</button>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => copyMonToFri(tab)} icon={<Copy className="size-4" />}>Copiar lunes a martes–viernes</Button>
        <p className="num text-sm font-semibold">{weeklyScheduledHours(preview, tab).toFixed(1)} h {kind === 'rotation' ? `en la semana ${tab + 1}` : 'por semana'}</p>
      </div>
    </Sheet>
  );
}
