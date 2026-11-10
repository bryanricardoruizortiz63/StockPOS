import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScanLine } from 'lucide-react';
import { Button, Input, Sheet } from './ui';

/**
 * Lector de códigos de barras y QR con la cámara.
 * Usa BarcodeDetector nativo cuando existe (Android/Chrome) y ZXing en los demás (iPhone, PC).
 * Siempre ofrece escribir el código a mano si la cámara falla.
 */
export function Scanner({ open, onClose, onResult, title = 'Escanear código', qr = false, manualLabel = 'Escribir el código' }: {
  open: boolean; onClose: () => void; onResult: (code: string) => void; title?: string; qr?: boolean; manualLabel?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (!open) return;
    done.current = false;
    setError(null);
    setManual('');
    let stop = () => {};
    let cancelled = false;
    const finish = (code: string) => {
      if (done.current) return;
      done.current = true;
      navigator.vibrate?.(40);
      onResult(code.trim());
    };
    (async () => {
      try {
        const v = video.current!;
        const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect(s: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (BD) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          v.srcObject = stream;
          await v.play();
          const det = new BD({ formats: qr ? ['qr_code'] : ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
          let raf = 0;
          const tick = async () => {
            if (cancelled || done.current) return;
            try { const r = await det.detect(v); if (r[0]?.rawValue) return finish(r[0].rawValue); } catch { /* cuadro sin código */ }
            raf = window.setTimeout(tick, 120);
          };
          tick();
          stop = () => { clearTimeout(raf); stream.getTracks().forEach((t) => t.stop()); };
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, v, (res) => { if (res) finish(res.getText()); });
          if (cancelled) controls.stop();
          stop = () => controls.stop();
        }
      } catch {
        setError('No se pudo abrir la cámara. Revisa el permiso o escribe el código.');
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, qr, onResult]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-adoquin-deep">
        <video ref={video} playsInline muted className="size-full object-cover" />
        {!error && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className={qr ? 'size-52 rounded-3xl ring-4 ring-facade' : 'h-28 w-4/5 rounded-2xl ring-4 ring-facade'} />
            <ScanLine className="absolute size-8 text-white/80" />
          </div>
        )}
        {error && <p className="absolute inset-0 grid place-items-center p-6 text-center font-medium text-on-adoquin">{error}</p>}
      </div>
      <form className="mt-5 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onResult(manual.trim()); }}>
        <label className="sr-only" htmlFor="manual-code">{manualLabel}</label>
        <Input id="manual-code" value={manual} onChange={(e) => setManual(e.target.value)} placeholder={manualLabel} inputMode={qr ? 'text' : 'numeric'} autoComplete="off" />
        <Button type="submit" variant="secondary" icon={<Keyboard className="size-4" />} disabled={!manual.trim()}>Usar</Button>
      </form>
    </Sheet>
  );
}
