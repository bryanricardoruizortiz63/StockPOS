import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowLeft } from 'lucide-react';
import { useActive } from '../lib/session';
import { KIOSK_PERIOD, kioskPayload } from '../lib/timeclock';
import { fmtDate, fmtTime } from '../lib/util';

/** Pantalla para la tablet de la tienda: QR que cambia cada 30 s. Una foto del QR no sirve después. */
export default function KioskPage() {
  const { store } = useActive();
  const [img, setImg] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const slot = Math.floor(now / 1000 / KIOSK_PERIOD);
  const left = KIOSK_PERIOD - (Math.floor(now / 1000) % KIOSK_PERIOD);
  useEffect(() => { QRCode.toDataURL(kioskPayload(store), { width: 640, margin: 1, color: { dark: '#1d2433', light: '#ffffff' } }).then(setImg); }, [slot, store]);
  useEffect(() => {
    const el = document.documentElement;
    el.requestFullscreen?.().catch(() => {});
    let lock: { release(): Promise<void> } | undefined;
    (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); if (document.fullscreenElement) void document.exitFullscreen(); };
  }, []);
  return (
    <div className="flex min-h-dvh flex-col bg-adoquin text-on-adoquin">
      <div className="facade-band h-3" />
      <div className="flex items-center justify-between px-6 py-4">
        <Link to="/ponches" className="inline-flex items-center gap-2 text-on-adoquin-2 hover:text-on-adoquin"><ArrowLeft className="size-4" />Salir</Link>
        <p className="num text-on-adoquin-2">{fmtDate(now, { dateStyle: 'full' })}</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 pb-10 text-center">
        <h1 className="text-3xl font-bold sm:text-4xl">Ponchar en {store.name}</h1>
        <p className="num text-6xl font-bold tracking-[-0.03em] sm:text-7xl">{fmtTime(now)}</p>
        <div className="rounded-3xl bg-white p-5 shadow-[var(--shadow-lift)]">
          {img ? <img src={img} alt="Código QR para ponchar" className="size-[min(70vw,380px)]" /> : <div className="size-[min(70vw,380px)]" />}
        </div>
        <div className="w-[min(70vw,380px)]">
          <div className="h-2 overflow-hidden rounded-full bg-adoquin-soft"><div className="h-full bg-facade transition-[width] duration-1000 ease-linear" style={{ width: `${(left / KIOSK_PERIOD) * 100}%` }} /></div>
          <p className="mt-2 text-sm text-on-adoquin-2">Abre StockPOS › Ponchar › Escanear QR. El código cambia en {left} s.</p>
        </div>
      </div>
    </div>
  );
}
