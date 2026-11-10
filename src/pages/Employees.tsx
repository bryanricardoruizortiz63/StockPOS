import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, UserPlus, Users } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { createUser, setPassword, setPin, validatePassword } from '../lib/auth';
import { money } from '../lib/money';
import type { Role, User } from '../lib/types';
import { Badge, Button, Checkbox, Empty, Field, Input, MoneyInput, PageHeader, Panel, Select, Sheet } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

export default function EmployeesPage() {
  const { stores } = useActive();
  const users = useLiveQuery(() => db.users.orderBy('email').toArray(), []) ?? [];
  const deductions = useLiveQuery(() => db.deductions.toArray(), []) ?? [];
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [bulk, setBulk] = useState(false);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const list = [...users].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  const toggle = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  return (
    <>
      <PageHeader title="Empleados" description="Selecciona uno, varios o todos para cambiar la paga, horas o deducciones de una vez."
        actions={<>
          <Button variant="secondary" disabled={!sel.size} onClick={() => setBulk(true)} icon={<Pencil className="size-4" />}>Editar {sel.size || ''} seleccionados</Button>
          <Button onClick={() => setAdding(true)} icon={<UserPlus className="size-4" />}>Añadir empleado</Button>
        </>} />
      <Panel>
        {list.length <= 1 ? <Empty icon={<Users className="size-7" />} title="Solo estás tú" action={<Button onClick={() => setAdding(true)} icon={<UserPlus className="size-4" />}>Añadir empleado</Button>}>Añade a tus empleados para que puedan vender, ponchar y recibir su nómina.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="text-sm text-ink-2"><tr className="border-b border-line">
                <th className="w-12 px-5 py-3"><Checkbox label={<span className="sr-only">Todos</span>} checked={sel.size > 0 && sel.size === list.filter((u) => u.role === 'employee').length} onChange={(v) => setSel(v ? new Set(list.filter((u) => u.role === 'employee').map((u) => u.id)) : new Set())} /></th>
                <th className="px-3 py-3 font-semibold">Nombre</th><th className="px-3 py-3 font-semibold">Tiendas</th>
                <th className="px-3 py-3 text-right font-semibold">Paga/hora</th><th className="px-3 py-3 text-right font-semibold">Horas/sem.</th>
                <th className="px-3 py-3 text-right font-semibold">Extra/hora</th><th className="px-5 py-3" /></tr></thead>
              <tbody>{list.map((u) => (
                <tr key={u.id} className={`border-b border-line/60 last:border-0 ${u.active ? '' : 'opacity-55'}`}>
                  <td className="px-5 py-3">{u.role === 'employee' && <Checkbox label={<span className="sr-only">Seleccionar {u.name}</span>} checked={sel.has(u.id)} onChange={(v) => toggle(u.id, v)} />}</td>
                  <td className="px-3 py-3"><p className="font-semibold">{u.name} {u.role === 'admin' && <Badge tone="facade">Admin</Badge>} {!u.active && <Badge>Inactivo</Badge>}</p><p className="text-sm text-ink-2">{u.email}{u.position ? ` · ${u.position}` : ''}</p></td>
                  <td className="px-3 py-3 text-sm text-ink-2">{u.storeIds.map((s) => storeName.get(s)).filter(Boolean).join(', ') || '—'}</td>
                  <td className="num px-3 py-3 text-right">{u.role === 'employee' ? money(u.hourlyRate) : '—'}</td>
                  <td className="num px-3 py-3 text-right">{u.role === 'employee' ? u.weeklyHours : '—'}</td>
                  <td className="num px-3 py-3 text-right text-ink-2">{u.role === 'employee' ? (u.overtimeRate != null ? money(u.overtimeRate) : '1.5×') : '—'}</td>
                  <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Editar</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Panel>
      <AddEmployee open={adding} onClose={() => setAdding(false)} />
      {editing && <EditEmployee user={editing} onClose={() => setEditing(null)} />}
      {bulk && <BulkEdit ids={[...sel]} deductions={deductions} onClose={() => { setBulk(false); setSel(new Set()); }} />}
    </>
  );
}

function StorePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { stores } = useActive();
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {stores.map((s) => <Checkbox key={s.id} label={s.name} checked={value.includes(s.id)} onChange={(v) => onChange(v ? [...value, s.id] : value.filter((x) => x !== s.id))} />)}
    </div>
  );
}

function AddEmployee({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store } = useActive();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', position: '', hireDate: '', pin: '', password: '', weeklyHours: '40' });
  const [role, setRole] = useState<Role>('employee');
  const [rate, setRate] = useState<number | undefined>();
  const [storeIds, setStoreIds] = useState([store.id]);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function save() {
    setErr(null);
    try {
      if (!f.name.trim() || !f.email.trim()) throw new Error('Nombre y correo son obligatorios.');
      if (!storeIds.length) throw new Error('Asigna al menos una tienda.');
      if (role === 'admin' || f.password) { const e = validatePassword(f.password); if (e) throw new Error(e); }
      if (role === 'employee' && !f.pin && !f.password) throw new Error('Dale un PIN o una contraseña para entrar.');
      if (f.pin && !/^\d{4,8}$/.test(f.pin)) throw new Error('El PIN debe tener de 4 a 8 dígitos.');
      await createUser({ name: f.name, email: f.email, role, storeIds, position: f.position || undefined, hireDate: f.hireDate || undefined, pin: f.pin || undefined, password: f.password || undefined, hourlyRate: rate ?? 0, weeklyHours: Number(f.weeklyHours) || 40 });
      toast(`${f.name} añadido`);
      setF({ name: '', email: '', position: '', hireDate: '', pin: '', password: '', weeklyHours: '40' }); setRate(undefined);
      onClose();
    } catch (e) { setErr(errMsg(e)); }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Añadir empleado" wide footer={<Button size="lg" className="w-full" onClick={save}>Añadir</Button>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre completo" htmlFor="an"><Input id="an" value={f.name} onChange={set('name')} /></Field>
        <Field label="Correo" htmlFor="ae" hint="Aquí recibe talonarios y cartas."><Input id="ae" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Puesto" htmlFor="ap" optional><Input id="ap" value={f.position} onChange={set('position')} placeholder="Cajero" /></Field>
        <Field label="Fecha de empleo" htmlFor="ah" optional><Input id="ah" type="date" value={f.hireDate} onChange={set('hireDate')} /></Field>
        <Field label="Rol" htmlFor="ar"><Select id="ar" value={role} onChange={(e) => setRole(e.target.value as Role)}><option value="employee">Empleado</option><option value="admin">Administrador</option></Select></Field>
        {role === 'employee' && <Field label="PIN para entrar" htmlFor="api" hint="4 a 8 dígitos."><Input id="api" inputMode="numeric" value={f.pin} onChange={set('pin')} className="num" /></Field>}
        <Field label="Contraseña" htmlFor="apw" optional={role === 'employee'} hint="Mínimo 10 caracteres con letras y números."><Input id="apw" type="password" autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        {role === 'employee' && <>
          <Field label="Paga por hora" htmlFor="ara"><MoneyInput id="ara" value={rate} onChange={setRate} /></Field>
          <Field label="Horas por semana" htmlFor="awh"><Input id="awh" inputMode="numeric" value={f.weeklyHours} onChange={set('weeklyHours')} className="num" /></Field>
        </>}
      </div>
      <div className="mt-5"><Field label="Tiendas"><StorePicker value={storeIds} onChange={setStoreIds} /></Field></div>
      {err && <p className="mt-4 text-sm font-medium text-bad" role="alert">{err}</p>}
    </Sheet>
  );
}

function EditEmployee({ user, onClose }: { user: User; onClose: () => void }) {
  const { user: me } = useActive();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [position, setPosition] = useState(user.position ?? '');
  const [hireDate, setHireDate] = useState(user.hireDate ?? '');
  const [storeIds, setStoreIds] = useState(user.storeIds);
  const [pin, setPinV] = useState('');
  const [pw, setPw] = useState('');
  async function save() {
    try {
      if (pin && !/^\d{4,8}$/.test(pin)) throw new Error('El PIN debe tener de 4 a 8 dígitos.');
      if (pw) { const e = validatePassword(pw); if (e) throw new Error(e); await setPassword(user.id, pw); }
      if (pin) await setPin(user.id, pin);
      await db.users.update(user.id, { name: name.trim(), position: position || undefined, hireDate: hireDate || undefined, storeIds });
      toast('Cambios guardados'); onClose();
    } catch (e) { toast(errMsg(e), 'bad'); }
  }
  async function toggleActive() {
    if (user.id === me.id) return toast('No puedes desactivar tu propia cuenta.', 'bad');
    await db.users.update(user.id, { active: !user.active });
    toast(user.active ? `${user.name} ya no puede entrar` : `${user.name} reactivado`); onClose();
  }
  return (
    <Sheet open onClose={onClose} title={user.name} wide footer={<div className="flex gap-3"><Button size="lg" className="flex-1" onClick={save}>Guardar</Button><Button size="lg" variant={user.active ? 'danger' : 'secondary'} onClick={toggleActive}>{user.active ? 'Desactivar' : 'Reactivar'}</Button></div>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="en"><Input id="en" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Correo" htmlFor="ee" hint="El correo es el usuario y no se cambia."><Input id="ee" value={user.email} disabled /></Field>
        <Field label="Puesto" htmlFor="ep" optional><Input id="ep" value={position} onChange={(e) => setPosition(e.target.value)} /></Field>
        <Field label="Fecha de empleo" htmlFor="eh" optional><Input id="eh" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></Field>
        {user.role === 'employee' && <Field label="Nuevo PIN" htmlFor="epi" optional><Input id="epi" inputMode="numeric" value={pin} onChange={(e) => setPinV(e.target.value)} className="num" /></Field>}
        <Field label="Nueva contraseña" htmlFor="epw" optional><Input id="epw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
      </div>
      <div className="mt-5"><Field label="Tiendas"><StorePicker value={storeIds} onChange={setStoreIds} /></Field></div>
      <p className="mt-5 text-sm text-ink-2">La paga, horas y deducciones se cambian seleccionando al empleado en la lista y tocando “Editar seleccionados”.</p>
    </Sheet>
  );
}

function BulkEdit({ ids, deductions, onClose }: { ids: string[]; deductions: { id: string; name: string; active: boolean }[]; onClose: () => void }) {
  const toast = useToast();
  const [apply, setApply] = useState({ rate: false, hours: false, ot: false, plan: false, ded: false });
  const [rate, setRate] = useState<number | undefined>();
  const [hours, setHours] = useState('40');
  const [ot, setOt] = useState<number | undefined>();
  const [plan, setPlan] = useState<number | undefined>();
  const [ded, setDed] = useState<string[]>(deductions.filter((d) => d.active).map((d) => d.id));
  const A = (k: keyof typeof apply, label: string) => <Checkbox label={<b>{label}</b>} checked={apply[k]} onChange={(v) => setApply({ ...apply, [k]: v })} />;

  async function save() {
    const patch: Partial<User> = {};
    if (apply.rate) { if (rate == null) return toast('Escribe la paga por hora.', 'bad'); patch.hourlyRate = rate; }
    if (apply.hours) { const h = Number(hours); if (!(h > 0 && h <= 80)) return toast('Horas por semana inválidas.', 'bad'); patch.weeklyHours = h; }
    if (apply.ot) patch.overtimeRate = ot;
    if (apply.plan) patch.healthPlan = plan;
    if (apply.ded) patch.deductionIds = ded;
    if (!Object.keys(patch).length && !apply.ot && !apply.plan) return toast('Marca qué quieres cambiar.', 'bad');
    await db.transaction('rw', db.users, async () => { for (const id of ids) await db.users.update(id, patch); });
    toast(`Actualizados ${ids.length} empleados`); onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`Editar ${ids.length} ${ids.length === 1 ? 'empleado' : 'empleados'}`} footer={<Button size="lg" className="w-full" onClick={save}>Aplicar a {ids.length}</Button>}>
      <p className="mb-5 text-ink-2">Marca solo lo que quieres cambiar. Lo demás se queda como está en cada empleado.</p>
      <div className="flex flex-col gap-5">
        <div>{A('rate', 'Paga por hora')}{apply.rate && <div className="mt-2"><MoneyInput value={rate} onChange={setRate} /></div>}</div>
        <div>{A('hours', 'Horas por semana')}{apply.hours && <Input className="num mt-2 w-32" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Horas por semana" />}</div>
        <div>{A('ot', 'Paga por hora extra')}{apply.ot && <div className="mt-2"><MoneyInput value={ot} onChange={setOt} placeholder="Vacío = 1.5× la paga" /></div>}</div>
        <div>{A('plan', 'Plan médico por periodo')}{apply.plan && <div className="mt-2"><MoneyInput value={plan} onChange={setPlan} placeholder="Vacío = no incluye" /></div>}</div>
        <div>{A('ded', 'Deducciones que aplican')}{apply.ded && (
          <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-line">
            {deductions.map((d) => <Checkbox key={d.id} label={`${d.name}${d.active ? '' : ' (inactiva)'}`} checked={ded.includes(d.id)} onChange={(v) => setDed(v ? [...ded, d.id] : ded.filter((x) => x !== d.id))} />)}
          </div>
        )}</div>
      </div>
    </Sheet>
  );
}
