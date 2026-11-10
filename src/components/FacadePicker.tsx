import { Check } from 'lucide-react';
import type { FacadeColor } from '../lib/types';
import { clsx } from '../lib/util';

export const FACADES: { id: FacadeColor; label: string; hex: string }[] = [
  { id: 'coral', label: 'Coral', hex: '#e58a70' },
  { id: 'mango', label: 'Mango', hex: '#f1b84a' },
  { id: 'turquesa', label: 'Turquesa', hex: '#57bdb6' },
  { id: 'verdemar', label: 'Verde mar', hex: '#74bb8e' },
  { id: 'lila', label: 'Lila', hex: '#b19bd8' },
  { id: 'rosa', label: 'Rosa', hex: '#ec9db0' },
];

export function FacadePicker({ value, onChange }: { value: FacadeColor; onChange: (c: FacadeColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Color de la tienda" className="flex flex-wrap gap-2">
      {FACADES.map((f) => (
        <button key={f.id} type="button" role="radio" aria-checked={value === f.id} onClick={() => onChange(f.id)}
          className={clsx('flex h-11 items-center gap-2 rounded-xl pr-3.5 pl-2 text-sm font-semibold ring-1 transition', value === f.id ? 'bg-white ring-2 ring-ink' : 'bg-white/60 ring-line hover:bg-white')}>
          <span className="grid size-7 place-items-center rounded-lg" style={{ background: f.hex }}>{value === f.id && <Check className="size-4" />}</span>
          {f.label}
        </button>
      ))}
    </div>
  );
}
