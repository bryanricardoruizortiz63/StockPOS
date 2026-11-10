import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { CircleCheck, CircleDashed, Fingerprint, KeyRound, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { keyFingerprint } from '../lib/crypto';
import { newTotpSecret, totpUri, verifyTotp } from '../lib/totp';
import { biometricsAvailable, registerPasskey } from '../lib/webauthn';
import { athConfigured } from '../lib/payments/athmovil';
import { tapToPayAvailable } from '../lib/payments/stripeTerminal';
import { emailBackendConfigured } from '../lib/notify';
import { loadDemoData } from '../lib/setup';
import { setPassword, validatePassword } from '../lib/auth';
import { fmtDate } from '../lib/util';
import { Button, Field, Input, PageHeader, Panel, Sheet } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

function Status({ ok, label, hint }: { ok: boolean; label: string; hint: string }) {
  return (
    <li className="flex gap-3 border-b border-line/60 px-5 py-3 last:border-0">
      {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-good" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-3" />}
      <div><p className="font-semibold">{label}</p><p className="text-sm text-ink-2">{hint}</p></div>
    </li>
  );
}

export default function SettingsPage() {
  const { user, store } = useActive();
  const toast = useToast();
  const [fp, setFp] = useState('');
  const [bio, setBio] = useState(false);
  const [totp, setTotp] = useState(false);
  const [pw, setPw] = useState('');
  useEffect(() => { keyFingerprint().then(setFp); biometricsAvailable().then(setBio); }, []);

  async function addPasskey() {
    try {
      const pk = await registerPasskey(user, `Dispositivo ${user.passkeys.length + 1}`);
      await db.users.update(user.id, { passkeys: [...user.passkeys, pk] });
      toast('Biometría registrada');
    } catch (e) { toast(errMsg(e), 'bad'); }
  }
  async function removePasskey(id: string) {
    if (user.passkeys.length === 1 && !user.totpSecret) return toast('Necesitas al menos un método de verificación.', 'bad');
    await db.users.update(user.id, { passkeys: user.passkeys.filter((p) => p.id !== id) });
  }
  async function changePw() {
    const e = validatePassword(pw);
    if (e) return toast(e, 'bad');
    await setPassword(user.id, pw); setPw(''); toast('Contraseña cambiada');
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Configuración" />
      <Panel title="Seguridad de tu cuenta">
        <ul>
          <li className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-4">
            <KeyRound className="size-5 text-facade-deep" />
            <div className="min-w-0 flex-1"><p className="font-semibold">Microsoft Authenticator</p><p className="text-sm text-ink-2">{user.totpSecret ? 'Activo. Se pide una vez al día.' : 'No configurado.'}</p></div>
            <Button size="sm" variant="secondary" onClick={() => setTotp(true)}>{user.totpSecret ? 'Cambiar' : 'Configurar'}</Button>
          </li>
          {user.passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-line/60 px-5 py-4">
              <Fingerprint className="size-5 text-facade-deep" />
              <div className="min-w-0 flex-1"><p className="font-semibold">{p.label}</p><p className="text-sm text-ink-2">Face ID / huella · desde {fmtDate(p.createdAt)}</p></div>
              <Button size="sm" variant="ghost" aria-label="Quitar" onClick={() => removePasskey(p.id)}><Trash2 className="size-4" /></Button>
            </li>
          ))}
          {bio && <li className="px-5 py-4"><Button size="sm" variant="secondary" onClick={addPasskey} icon={<Fingerprint className="size-4" />}>Añadir Face ID / huella de este dispositivo</Button></li>}
          <li className="flex flex-wrap items-end gap-3 border-t border-line/60 px-5 py-4">
            <Field label="Nueva contraseña" htmlFor="npw"><Input id="npw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-64" /></Field>
            <Button variant="secondary" disabled={!pw} onClick={changePw}>Cambiar</Button>
          </li>
        </ul>
      </Panel>

      <Panel className="mt-5" title="Conexiones">
        <ul>
          <Status ok={athConfigured()} label="ATH Móvil Business" hint={athConfigured() ? 'Cobro directo al teléfono del cliente; la confirmación se adjunta sola.' : 'Modo manual: el cajero escribe la referencia. Pon VITE_ATHM_PUBLIC_TOKEN para cobrar directo.'} />
          <Status ok={tapToPayAvailable()} label="Tarjetas contactless (Stripe Terminal)" hint={tapToPayAvailable() ? 'Tap to Pay activo en este dispositivo.' : 'Se registra la autorización de una terminal externa. Tap to Pay funciona en la app instalada con el backend de Stripe.'} />
          <Status ok={emailBackendConfigured()} label="Envío de correos" hint={emailBackendConfigured() ? 'Talonarios, cartas y reportes salen por email.' : 'Los correos quedan en “Correos enviados” hasta conectar Supabase.'} />
        </ul>
      </Panel>

      <Panel className="mt-5" title="Firma de documentos">
        <p className="px-5 py-4 text-ink-2">Talonarios, cartas, reportes y ponches se firman con la llave <b className="num text-ink">{fp}</b>. Cualquiera puede comprobarlos en Verificar documento con el código impreso.</p>
      </Panel>

      <Panel className="mt-5" title="Datos de ejemplo">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <p className="min-w-0 flex-1 text-ink-2">Añade 10 productos de ejemplo a {store.name} para probar la caja.</p>
          <Button variant="secondary" onClick={async () => { await loadDemoData(store.id); toast('Productos de ejemplo añadidos'); }}>Cargar ejemplo</Button>
        </div>
      </Panel>
      {totp && <TotpSheet onClose={() => setTotp(false)} />}
    </div>
  );
}

function TotpSheet({ onClose }: { onClose: () => void }) {
  const { user } = useActive();
  const toast = useToast();
  const secret = useMemo(newTotpSecret, []);
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => { QRCode.toDataURL(totpUri(secret, user.email), { width: 220, margin: 1 }).then(setQr); }, [secret, user.email]);
  async function save() {
    if (!verifyTotp(secret, code)) return toast('El código no coincide.', 'bad');
    await db.users.update(user.id, { totpSecret: secret });
    toast('Microsoft Authenticator configurado'); onClose();
  }
  return (
    <Sheet open onClose={onClose} title="Microsoft Authenticator" footer={<Button size="lg" className="w-full" onClick={save}>Confirmar</Button>}>
      <p className="text-ink-2">En la app toca <b>+</b> › Otra cuenta › escanea el código. Luego escribe los 6 dígitos.</p>
      {qr && <img src={qr} alt="Código QR" className="mx-auto my-5 size-48 rounded-xl ring-1 ring-line" />}
      <p className="num mb-4 rounded-lg bg-cal-2 px-3 py-2 text-center text-sm font-semibold break-all">{secret.match(/.{1,4}/g)?.join(' ')}</p>
      <Field label="Código" htmlFor="tc"><Input id="tc" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className="num text-center text-xl tracking-[0.3em]" /></Field>
    </Sheet>
  );
}
