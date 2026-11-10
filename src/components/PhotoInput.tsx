import { useRef } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import { Button } from './ui';

/** Reduce la foto a 900 px y JPEG para que quepa en el dispositivo. */
async function compress(file: File, max = 900): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

export function PhotoInput({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-4">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-cal-2 ring-1 ring-line">
        {value ? <img src={value} alt="Foto del producto" className="size-full object-cover" /> : <Camera className="size-7 text-ink-3" aria-hidden />}
      </div>
      <div className="flex flex-wrap gap-2">
        <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await compress(f)); e.target.value = ''; }} />
        <Button type="button" variant="secondary" icon={<Camera className="size-4" />} onClick={() => ref.current?.click()}>{value ? 'Cambiar foto' : 'Sacar foto'}</Button>
        {value && <Button type="button" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => onChange(undefined)}>Quitar</Button>}
      </div>
    </div>
  );
}
