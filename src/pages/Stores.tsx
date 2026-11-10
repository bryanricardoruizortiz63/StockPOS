import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { MapPin, MonitorSmartphone, Nfc, Plus, Printer, RefreshCw } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { createStore } from '../lib/setup';
import { stickerPayload } from '../lib/timeclock';
import { nfcSupported, writeTag } from '../lib/nfc';
import { newTotpSecret } from '../lib/totp';
import { pct } from '../lib/money';
import type { FacadeColor, Store } from '../lib/types';
import { Banner, Button, Field, Input, PageHeader, Panel, Sheet } from '../components/ui';
import { FacadePicker, FACADES } from '../components/FacadePicker';
import { errMsg, useToast } from '../components/toast';

export default function StoresPage() {
  const stores = useLiveQuery(() => db.stores.orderBy('name').toArray(), []) ?? [];
  const [edit, setEdit] = useState<Store | 'new' | null>(null);
  const [punch, setPunch] = useState<Store | null>(null);
  return (
    <>
      <PageHeader title="Tiendas" description="Cada tienda tiene sus empleados, productos, IVU y color." actions={<Button onClick={() => setEdit('new')} icon={<Plus className="size-4" />}>Nueva tienda</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {stores.map((s) => (
          <Panel key={s.id} className="overflow-hidden">
            <div className="h-3" style={{ background: FACADES.find((f) => f.id === s.color)?.hex }} />
            <div className="p-5">
              <p className="text-lg font-bold">{s.name}</p>
              <p className="text-sm text-ink-2">{s.address || 'Sin dirección'}</p>
              <dl className="num mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-ink-2">IVU</dt><dd className="text-lg font-bold">{pct(s.ivuRate)}</dd></div>
                <div><dt className="text-ink-2">Alerta general</dt><dd className="text-lg font-bold">≤ {s.defaultAlertThreshold}</dd></div>
                <div><dt className="text-ink-2">Geocerca</dt><dd className="text-lg font-bold">{s.geofence ? `${s.geofence.radiusM} m` : 'No'}</dd></div>
              </dl>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEdit(s)}>Editar</Button>
                <Button size="sm" variant="secondary" onClick={() => setPunch(s)} icon={<Nfc className="size-4" />}>Ponches: NFC y QR</Button>
              </div>
            </div>
          </Panel>
        ))}
      </div>
      {edit && <StoreSheet store={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {punch && <PunchSetup store={punch} onClose={() => setPunch(null)} />}
    </>
  );
}

function StoreSheet({ store, onClose }: { store: Store | null; onClose: () => void }) {
  const { user } = useActive();
  const toast = useToast();
  const [name, setName] = useState(store?.name ?? '');
  const [address, setAddress] = useState(store?.address ?? '');
  const [ivu, setIvu] = useState(store ? String(+(store.ivuRate * 100).toFixed(3)) : '11.5');
  const [alert, setAlert] = useState(String(store?.defaultAlertThreshold ?? 5));
  const [color, setColor] = useState<FacadeColor>(store?.color ?? 'turquesa');
  const [geo, setGeo] = useState(store?.geofence);
  const [radius, setRadius] = useState(String(store?.geofence?.radiusM ?? 75));
  const [locating, setLocating] = useState(false);

  async function locate() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setGeo({ lat: p.coords.latitude, lng: p.coords.longitude, radiusM: Number(radius) || 75 }); setLocating(false); toast(`Ubicación fijada (precisión ${Math.round(p.coords.accuracy)} m)`); },
      () => { setLocating(false); toast('No se pudo obtener la ubicación.', 'bad'); }, { enableHighAccuracy: true, timeout: 15000 });
  }

  async function save() {
    const r = Number(ivu);
    if (!name.trim()) return toast('Escribe el nombre.', 'bad');
    if (!Number.isFinite(r) || r < 0 || r > 30) return toast('IVU inválido.', 'bad');
    const a = Number(alert);
    const geofence = geo ? { ...geo, radiusM: Math.max(20, Number(radius) || 75) } : undefined;
    if (store) {
      await db.stores.update(store.id, { name: name.trim(), address: address.trim() || undefined, ivuRate: r / 100, defaultAlertThreshold: Number.isInteger(a) && a >= 0 ? a : 5, color, geofence });
      toast(store.ivuRate !== r / 100 ? `IVU actualizado a ${r}% — aplica desde la próxima venta` : 'Tienda guardada');
    } else {
      const s = await createStore({ name, color, ivuRate: r / 100, address, defaultAlertThreshold: a });
      if (geofence) await db.stores.update(s.id, { geofence });
      await db.users.update(user.id, { storeIds: [...new Set([...user.storeIds, s.id])] });
      toast('Tienda creada');
    }
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={store ? store.name : 'Nueva tienda'} footer={<Button size="lg" className="w-full" onClick={save}>Guardar</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="sn"><Input id="sn" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Dirección" htmlFor="sa" optional><Input id="sa" value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="IVU (%)" htmlFor="si" hint="Puedes cambiarlo cuando quieras."><Input id="si" inputMode="decimal" className="num" value={ivu} onChange={(e) => setIvu(e.target.value)} /></Field>
          <Field label="Alerta general" htmlFor="sl" hint="Unidades."><Input id="sl" inputMode="numeric" className="num" value={alert} onChange={(e) => setAlert(e.target.value)} /></Field>
        </div>
        <Field label="Color"><FacadePicker value={color} onChange={setColor} /></Field>
        <Field label="Geocerca para ponchar" optional hint="Párate dentro de la tienda y fija la ubicación. Los ponches fuera del radio se rechazan.">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" busy={locating} onClick={locate} icon={<MapPin className="size-4" />}>{geo ? 'Volver a fijar aquí' : 'Fijar ubicación actual'}</Button>
            <label className="flex items-center gap-2 text-sm">Radio <Input aria-label="Radio en metros" inputMode="numeric" className="num w-20" value={radius} onChange={(e) => setRadius(e.target.value)} /> m</label>
            {geo && <Button type="button" variant="ghost" size="sm" onClick={() => setGeo(undefined)}>Quitar</Button>}
          </div>
          {geo && <p className="num mt-1 text-sm text-ink-2">{geo.lat.toFixed(5)}, {geo.lng.toFixed(5)}</p>}
        </Field>
      </div>
    </Sheet>
  );
}

function PunchSetup({ store, onClose }: { store: Store; onClose: () => void }) {
  const toast = useToast();
  const [qr, setQr] = useState('');
  const [writing, setWriting] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const live = useLiveQuery(() => db.stores.get(store.id), [store.id]) ?? store;
  useEffect(() => { stickerPayload(live).then((p) => QRCode.toDataURL(p, { width: 480, margin: 1 })).then(setQr); }, [live]);
  useEffect(() => () => abort.current?.abort(), []);

  async function program() {
    setWriting(true);
    abort.current = new AbortController();
    try { await writeTag(await stickerPayload(live), abort.current.signal); toast('Sticker programado'); }
    catch (e) { toast(errMsg(e), 'bad'); } finally { setWriting(false); }
  }
  async function rotate() {
    if (!confirm('Esto invalida TODOS los stickers y QR impresos de esta tienda. Tendrás que programarlos de nuevo. ¿Seguir?')) return;
    await db.stores.update(store.id, { punchSecret: newTotpSecret() });
    toast('Código renovado');
  }
  function print() {
    const w = window.open('', '_blank', 'width=600,height=700');
    if (!w) return;
    w.document.write(`<html><head><title>QR ponches ${live.name}</title></head><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>Ponchar en ${live.name}</h1><img src="${qr}" style="width:320px"/><p>StockPOS › Ponchar › Escanear QR</p></body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  return (
    <Sheet open onClose={onClose} title={`Ponches en ${store.name}`} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
          <p className="flex items-center gap-2 font-bold"><Nfc className="size-5 text-facade-deep" />Sticker NFC</p>
          <p className="mt-1 text-sm text-ink-2">Pega un sticker NFC (NTAG213 o similar) en la tienda. Desde un Android con Chrome, toca el botón y acerca el sticker para programarlo.</p>
          {nfcSupported() ? <Button className="mt-4" busy={writing} onClick={program}>{writing ? 'Acerca el sticker…' : 'Programar sticker'}</Button>
            : <Banner tone="facade">Abre esta pantalla en Chrome de un Android con NFC para programar stickers.</Banner>}
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-line">
          <p className="flex items-center gap-2 font-bold"><MonitorSmartphone className="size-5 text-facade-deep" />QR dinámico (recomendado para iPhone)</p>
          <p className="mt-1 text-sm text-ink-2">Pon una tablet en la entrada con el QR que cambia cada 30 segundos. Una foto del código no sirve para ponchar desde la casa.</p>
          <Link to="/kiosko"><Button className="mt-4" variant="secondary">Abrir pantalla de QR</Button></Link>
        </div>
        <div className="rounded-2xl bg-white p-5 ring-1 ring-line md:col-span-2">
          <div className="flex flex-col gap-4 sm:flex-row">
            {qr && <img src={qr} alt="QR fijo para ponchar" className="size-36 rounded-xl ring-1 ring-line" />}
            <div>
              <p className="font-bold">QR fijo impreso</p>
              <p className="mt-1 text-sm text-ink-2">Mismo código del sticker, para teléfonos sin NFC. Es más fácil de copiar: úsalo junto con la geocerca.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={print} icon={<Printer className="size-4" />}>Imprimir</Button>
                <Button size="sm" variant="ghost" onClick={rotate} icon={<RefreshCw className="size-4" />}>Renovar código</Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!live.geofence && <div className="mt-5"><Banner tone="warn">Esta tienda no tiene geocerca. Fíjala en Editar para exigir que el teléfono esté en el local.</Banner></div>}
    </Sheet>
  );
}
