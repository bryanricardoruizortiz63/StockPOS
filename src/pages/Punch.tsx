import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { CheckCircle2, MapPin, Nfc, QrCode, ShieldCheck } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { checkGeofence, getLocation, lastPunch, recordPunch, validatePresence } from '../lib/timeclock';
import { nfcSupported, readTag } from '../lib/nfc';
import { punchMethodLabel } from '../lib/flows';
import { clsx, fmtDate, fmtDateTime, fmtTime } from '../lib/util';
import type { Punch } from '../lib/types';
import { Badge, Button, PageHeader, Panel } from '../components/ui';
import { Scanner } from '../components/Scanner';
import { errMsg } from '../components/toast';

type Step = 'idle' | 'nfc' | 'locating' | 'saving';

export default function PunchPage() {
  const { user, store } = useActive();
  const last = useLiveQuery(async () => (await lastPunch(user.id)) ?? null, [user.id]);
  const recent = useLiveQuery(() => db.punches.where('[employeeId+at]').between([user.id, Date.now() - 14 * 864e5], [user.id, Infinity]).reverse().toArray(), [user.id]) ?? [];
  const [step, setStep] = useState<Step>('idle');
  const [qr, setQr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<Punch | null>(null);
  const abort = useRef<AbortController | null>(null);
  const inside = last?.type === 'in';
  useEffect(() => () => abort.current?.abort(), []);

  async function complete(payload: string, method: 'nfc' | 'qr' | 'kiosk') {
    setError(null);
    try {
      const kind = await validatePresence(payload, store);
      let location, dist;
      if (store.geofence) {
        setStep('locating');
        location = await getLocation();
        dist = checkGeofence(store, location);
      }
      setStep('saving');
      const p = await recordPunch({ storeId: store.id, employeeId: user.id, method: kind === 'kiosk' ? 'kiosk' : method, location, distanceM: dist });
      navigator.vibrate?.([30, 40, 30]);
      setOk(p);
    } catch (e) { setError(errMsg(e)); } finally { setStep('idle'); }
  }

  async function startNfc() {
    setError(null); setStep('nfc');
    abort.current = new AbortController();
    try { await complete(await readTag(abort.current.signal), 'nfc'); }
    catch (e) { setError(errMsg(e)); setStep('idle'); }
  }

  if (ok) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center pt-8 text-center">
        <CheckCircle2 className="pop size-20 text-good" />
        <h1 className="mt-4 text-3xl font-bold">{ok.type === 'in' ? 'Entrada registrada' : 'Salida registrada'}</h1>
        <p className="num mt-2 text-4xl font-bold tracking-[-0.02em]">{fmtTime(ok.at)}</p>
        <p className="mt-1 text-ink-2">{fmtDate(ok.at, { dateStyle: 'full' })} · {store.name}</p>
        <p className="num mt-6 flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm text-ink-2 ring-1 ring-line"><ShieldCheck className="size-4 text-good" />Firmado · {ok.hash.slice(0, 16)}</p>
        <Button className="mt-8" variant="secondary" onClick={() => setOk(null)}>Listo</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Ponchar" description={`Debes estar en ${store.name}. Acerca el teléfono al sticker NFC o escanea el código QR del local.`} />
      <Panel className="overflow-hidden">
        <div className={clsx('flex items-center gap-4 px-5 py-4', inside ? 'bg-good-wash text-good' : 'bg-cal-2 text-ink-2')}>
          <span className={clsx('size-3 rounded-full', inside ? 'bg-good' : 'bg-ink-3')} />
          <p className="font-semibold">{last === undefined ? 'Cargando…' : inside ? `Dentro desde ${fmtTime(last!.at)}` : last ? `Fuera desde ${fmtDateTime(last.at)}` : 'Sin ponches todavía'}</p>
        </div>
        <div className={clsx('grid gap-3 p-5', nfcSupported() && 'sm:grid-cols-2')}>
          {nfcSupported() && (
            <button onClick={startNfc} disabled={step !== 'idle'}
              className="flex flex-col items-center gap-2 rounded-2xl bg-adoquin px-4 py-8 text-on-adoquin transition active:scale-[0.98] disabled:opacity-45">
              <Nfc className={clsx('size-10', step === 'nfc' && 'animate-pulse text-facade')} />
              <span className="text-lg font-bold">{step === 'nfc' ? 'Acerca el teléfono al sticker' : `Ponchar ${inside ? 'salida' : 'entrada'} con NFC`}</span>
            </button>
          )}
          <button onClick={() => { setError(null); setQr(true); }} disabled={step !== 'idle'}
            className={clsx('flex flex-col items-center gap-2 rounded-2xl px-4 py-8 transition active:scale-[0.98] disabled:opacity-45',
              nfcSupported() ? 'bg-white text-ink ring-1 ring-line' : 'bg-adoquin text-on-adoquin')}>
            <QrCode className="size-10" />
            <span className="text-lg font-bold">{nfcSupported() ? 'Escanear QR del local' : `Ponchar ${inside ? 'salida' : 'entrada'} con el QR del local`}</span>
          </button>
          {!nfcSupported() && <p className="text-sm text-ink-2">Este teléfono no lee stickers NFC desde el navegador; usa el QR de la tienda.</p>}
        </div>
        {step === 'locating' && <p className="flex items-center gap-2 px-5 pb-5 text-ink-2"><MapPin className="size-4 animate-pulse" />Confirmando que estás en la tienda…</p>}
        {error && <p className="px-5 pb-5 font-medium text-bad" role="alert">{error}</p>}
      </Panel>

      <Panel className="mt-5" title="Mis ponches (14 días)">
        {recent.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">Sin ponches recientes.</p> : (
          <ul>{recent.map((p) => (
            <li key={p.id} className="num flex items-center gap-3 border-b border-line/60 px-5 py-2.5 last:border-0">
              <Badge tone={p.type === 'in' ? 'good' : 'neutral'}>{p.type === 'in' ? 'Entrada' : 'Salida'}</Badge>
              <span className="flex-1">{fmtDateTime(p.at)}</span>
              <span className="text-sm text-ink-2">{punchMethodLabel(p.method)}</span>
            </li>
          ))}</ul>
        )}
      </Panel>
      <Scanner open={qr} qr onClose={() => setQr(false)} title="Escanear QR del local" manualLabel="Código del QR" onResult={(code) => { setQr(false); void complete(code, 'qr'); }} />
    </div>
  );
}
