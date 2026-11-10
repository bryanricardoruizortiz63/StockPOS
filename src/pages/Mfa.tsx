import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Fingerprint, KeyRound, LogOut } from 'lucide-react';
import { Button, Field, Input } from '../components/ui';
import { errMsg } from '../components/toast';
import { completeMfaPasskey, completeMfaTotp } from '../lib/auth';
import { db } from '../lib/db';
import { useSession } from '../lib/session';
import { newTotpSecret, totpUri, verifyTotp } from '../lib/totp';
import { biometricsAvailable, registerPasskey } from '../lib/webauthn';
import { dayKey } from '../lib/util';
import { AuthLayout } from './AuthLayout';

/** Verificación diaria del administrador (Microsoft Authenticator o Face ID / huella). */
export function MfaPage() {
  const { user, signOut } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState(false);
  useEffect(() => { biometricsAvailable().then(setBio); }, []);
  if (!user) return null;
  const enrolled = !!user.totpSecret || user.passkeys.length > 0;
  if (!enrolled) return <Enroll bio={bio} />;

  async function totp(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    try { await completeMfaTotp(user!, code); } catch (err) { setError(errMsg(err)); setCode(''); } finally { setBusy(false); }
  }
  async function passkey() {
    setError(null); setBusy(true);
    try { await completeMfaPasskey(user!); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Verificación del día" intro={`Hola ${user.name.split(' ')[0]}. Como administrador, confirma tu identidad una vez al día.`}>
      <div className="flex flex-col gap-5">
        {user.passkeys.length > 0 && bio && (
          <Button size="lg" onClick={passkey} busy={busy} icon={<Fingerprint className="size-5" />}>Usar Face ID o huella</Button>
        )}
        {user.totpSecret && (
          <form onSubmit={totp} className="flex flex-col gap-4">
            <Field label="Código de Microsoft Authenticator" htmlFor="otp" hint="Abre la app y escribe los 6 dígitos de StockPOS.">
              <Input id="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="num text-center text-2xl tracking-[0.3em]" autoFocus />
            </Field>
            <Button type="submit" size="lg" variant={user.passkeys.length && bio ? 'secondary' : 'primary'} busy={busy} icon={<KeyRound className="size-5" />}>Verificar código</Button>
          </form>
        )}
        {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
        <Button variant="ghost" onClick={signOut} icon={<LogOut className="size-4" />}>Salir</Button>
      </div>
    </AuthLayout>
  );
}

function Enroll({ bio }: { bio: boolean }) {
  const { user, signOut } = useSession();
  const secret = useMemo(newTotpSecret, []);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uri = user ? totpUri(secret, user.email) : '';
  useEffect(() => { if (uri) QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: '#1d2433', light: '#ffffff' } }).then(setQr); }, [uri]);
  if (!user) return null;

  async function confirmTotp(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    if (!verifyTotp(secret, code)) { setError('Ese código no coincide. Revisa la hora del teléfono e intenta de nuevo.'); return; }
    await db.users.update(user!.id, { totpSecret: secret, mfaVerifiedOn: dayKey() });
  }
  async function addBio() {
    setError(null); setBusy(true);
    try {
      const pk = await registerPasskey(user!, navigator.userAgent.includes('iPhone') ? 'iPhone' : 'Este dispositivo');
      await db.users.update(user!.id, { passkeys: [...user!.passkeys, pk], mfaVerifiedOn: dayKey() });
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <AuthLayout title="Protege tu cuenta" intro="Elige cómo verificarás tu identidad cada día. Puedes añadir el otro método luego en Configuración.">
      <div className="flex flex-col gap-6">
        <form onSubmit={confirmTotp} className="rounded-2xl bg-white p-5 ring-1 ring-line">
          <p className="font-bold">Microsoft Authenticator</p>
          <p className="mt-1 text-sm text-ink-2">En la app toca <b>+</b> › Otra cuenta › escanea este código.</p>
          <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qr ? <img src={qr} alt="Código QR para Microsoft Authenticator" className="size-44 rounded-xl ring-1 ring-line" /> : <div className="size-44 rounded-xl bg-cal-2" />}
            <div className="w-full min-w-0 text-sm">
              <p className="text-ink-2">¿No puedes escanear? Escribe esta clave:</p>
              <p className="num mt-1 rounded-lg bg-cal-2 px-2 py-1.5 font-semibold break-all select-all">{secret.match(/.{1,4}/g)?.join(' ')}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <label htmlFor="c" className="sr-only">Código de 6 dígitos</label>
            <Input id="c" inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 dígitos" value={code} onChange={(e) => setCode(e.target.value)} className="num" />
            <Button type="submit">Confirmar</Button>
          </div>
        </form>
        {bio && (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
            <p className="font-bold">Face ID o huella</p>
            <p className="mt-1 text-sm text-ink-2">Usa la biometría de este teléfono, tablet o computadora.</p>
            <Button className="mt-4" variant="secondary" busy={busy} onClick={addBio} icon={<Fingerprint className="size-5" />}>Registrar biometría</Button>
          </div>
        )}
        {error && <p className="text-sm font-medium text-bad" role="alert">{error}</p>}
        <Button variant="ghost" onClick={signOut} icon={<LogOut className="size-4" />}>Salir</Button>
      </div>
    </AuthLayout>
  );
}
