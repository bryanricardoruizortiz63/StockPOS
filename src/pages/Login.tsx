import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { errMsg } from '../components/toast';
import { loginWithPasskey, loginWithSecret } from '../lib/auth';
import { biometricsAvailable } from '../lib/webauthn';
import { useSession } from '../lib/session';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { signIn } = useSession();
  const [email, setEmail] = useState(() => { try { return localStorage.getItem('stockpos.lastEmail') ?? ''; } catch { return ''; } });
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'pw' | 'bio' | null>(null);
  const [bio, setBio] = useState(false);
  useEffect(() => { biometricsAvailable().then(setBio); }, []);

  const remember = () => { try { localStorage.setItem('stockpos.lastEmail', email.trim()); } catch { /* */ } };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy('pw');
    try { const u = await loginWithSecret(email, secret); remember(); signIn(u); }
    catch (err) { setError(errMsg(err)); setSecret(''); }
    finally { setBusy(null); }
  }
  async function withBio() {
    if (!email.trim()) return setError('Escribe tu correo primero.');
    setError(null); setBusy('bio');
    try { const u = await loginWithPasskey(email); remember(); signIn(u); }
    catch (err) { setError(errMsg(err)); }
    finally { setBusy(null); }
  }

  return (
    <AuthLayout title="Entrar" intro="Empleados: correo y PIN o contraseña. Administradores: contraseña o Face ID / huella, y verificación una vez al día.">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <Field label="Correo electrónico" htmlFor="email"><Input id="email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Contraseña o PIN" htmlFor="pw"><Input id="pw" type="password" required autoComplete="current-password" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
        {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
        <Button type="submit" size="lg" busy={busy === 'pw'}>Entrar</Button>
        {bio && (
          <Button type="button" size="lg" variant="secondary" busy={busy === 'bio'} onClick={withBio} icon={<Fingerprint className="size-5" />}>
            Entrar con Face ID o huella
          </Button>
        )}
        <p className="text-sm text-ink-2">¿Olvidaste tu contraseña? Pide al administrador que la cambie desde Empleados.</p>
      </form>
    </AuthLayout>
  );
}
