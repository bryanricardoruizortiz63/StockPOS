import { useState } from 'react';
import { Button, Field, Input } from '../components/ui';
import { FacadePicker } from '../components/FacadePicker';
import { errMsg } from '../components/toast';
import { initialSetup } from '../lib/setup';
import { validatePassword } from '../lib/auth';
import { useSession } from '../lib/session';
import type { FacadeColor } from '../lib/types';
import { AuthLayout } from './AuthLayout';

export function SetupPage({ onDone }: { onDone: () => void }) {
  const { signIn } = useSession();
  const [f, setF] = useState({ adminName: '', email: '', password: '', storeName: '', ivu: '11.5' });
  const [color, setColor] = useState<FacadeColor>('coral');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pwErr = validatePassword(f.password);
    if (pwErr) return setError(pwErr);
    const ivu = Number(f.ivu);
    if (!Number.isFinite(ivu) || ivu < 0 || ivu > 30) return setError('El IVU debe ser un porcentaje entre 0 y 30.');
    setBusy(true);
    try {
      const { admin } = await initialSetup({ adminName: f.adminName, email: f.email, password: f.password, storeName: f.storeName, ivuRate: ivu / 100, color });
      signIn(admin);
      onDone();
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Configura tu tienda" intro="Crea la cuenta del administrador y tu primera tienda. Luego podrás añadir más tiendas y empleados.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Tu nombre" htmlFor="n"><Input id="n" required value={f.adminName} onChange={set('adminName')} autoComplete="name" /></Field>
        <Field label="Correo electrónico" htmlFor="e"><Input id="e" type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Contraseña" htmlFor="p" hint="Mínimo 10 caracteres, con letras y números."><Input id="p" type="password" required value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
        <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
          <Field label="Nombre de la tienda" htmlFor="s"><Input id="s" required value={f.storeName} onChange={set('storeName')} /></Field>
          <Field label="IVU (%)" htmlFor="i"><Input id="i" inputMode="decimal" required value={f.ivu} onChange={set('ivu')} className="num" /></Field>
        </div>
        <Field label="Color de la tienda" hint="Pinta la franja superior para saber en qué tienda estás."><FacadePicker value={color} onChange={setColor} /></Field>
        {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
        <Button type="submit" size="lg" busy={busy}>Crear y entrar</Button>
      </form>
    </AuthLayout>
  );
}
