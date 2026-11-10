import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { Button, Field, Input, Sheet } from '../components/ui';
import { useToast } from '../components/toast';

/** Reglas de alerta flexibles: tienda → categoría → producto (en la ficha del producto). */
export function AlertRules({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { store } = useActive();
  const toast = useToast();
  const [def, setDef] = useState(String(store.defaultAlertThreshold));
  const [rows, setRows] = useState<[string, string][]>([]);
  const cats = useLiveQuery(async () => [...new Set((await db.products.where('storeId').equals(store.id).toArray()).map((p) => p.category).filter(Boolean) as string[])].sort(), [store.id]) ?? [];

  useEffect(() => {
    if (open) { setDef(String(store.defaultAlertThreshold)); setRows(Object.entries(store.categoryThresholds).map(([k, v]) => [k, String(v)])); }
  }, [open, store]);

  async function save() {
    const d = Number(def);
    if (!Number.isInteger(d) || d < 0) return toast('El umbral general debe ser un número entero.', 'bad');
    const map: Record<string, number> = {};
    for (const [c, v] of rows) {
      if (!c.trim()) continue;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return toast(`Umbral inválido para ${c}.`, 'bad');
      map[c.trim()] = n;
    }
    await db.stores.update(store.id, { defaultAlertThreshold: d, categoryThresholds: map });
    toast('Alertas guardadas');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Alertas de inventario" footer={<Button className="w-full" size="lg" onClick={save}>Guardar alertas</Button>}>
      <p className="mb-5 text-ink-2">Un producto se marca bajo cuando su cantidad llega a su umbral. Se usa el del producto si lo tiene, si no el de su categoría, y si no el general.</p>
      <Field label="Umbral general" htmlFor="def" hint="Aplica a todo lo que no tenga regla propia.">
        <Input id="def" inputMode="numeric" value={def} onChange={(e) => setDef(e.target.value)} className="num w-32" />
      </Field>
      <p className="mt-6 mb-2 text-sm font-semibold">Por categoría</p>
      <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex flex-col gap-2">
        {rows.map(([c, v], i) => (
          <div key={i} className="flex gap-2">
            <Input aria-label="Categoría" list="cats" value={c} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder="Categoría" />
            <Input aria-label="Umbral" inputMode="numeric" value={v} onChange={(e) => setRows(rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} className="num w-24" />
            <Button variant="ghost" aria-label="Quitar regla" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </div>
      <Button className="mt-3" variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, ['', String(store.defaultAlertThreshold)]])}>Añadir categoría</Button>
    </Sheet>
  );
}
