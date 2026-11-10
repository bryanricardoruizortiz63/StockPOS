import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRightLeft, Search } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { transferProducts, type TransferMode } from '../lib/inventory';
import { money } from '../lib/money';
import { Banner, Button, Checkbox, Field, Input, PageHeader, Panel, Select } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

const MODES: { id: TransferMode; title: string; body: string }[] = [
  { id: 'catalog', title: 'Producto completo', body: 'Código, descripción, precios, foto, categoría y alerta. Llega con cantidad 0.' },
  { id: 'description', title: 'Solo la descripción', body: 'Código y descripción. El precio y la cantidad se completan en la otra tienda.' },
  { id: 'stock', title: 'Transferir existencias', body: 'Mueve unidades: se restan aquí y se suman allá.' },
];

export default function TransferPage() {
  const { store, stores } = useActive();
  const toast = useToast();
  const others = stores.filter((s) => s.id !== store.id);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [mode, setMode] = useState<TransferMode>('catalog');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const products = useLiveQuery(() => db.products.where('storeId').equals(store.id).sortBy('description'), [store.id]) ?? [];
  const shown = useMemo(() => products.filter((p) => !q || p.description.toLowerCase().includes(q.toLowerCase()) || p.barcode.includes(q)), [products, q]);
  const toggle = (id: string, v: boolean) => setSel((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });

  if (!others.length) return (<><PageHeader title="Exportar a otra tienda" /><Banner tone="facade">Crea otra tienda en Tiendas para poder exportar productos.</Banner></>);

  async function go() {
    setBusy(true);
    try {
      const amounts = Object.fromEntries(Object.entries(qty).map(([k, v]) => [k, Number(v)]));
      const r = await transferProducts([...sel], to, mode, amounts);
      toast(`${r.created} nuevos, ${r.updated} actualizados en ${others.find((s) => s.id === to)?.name}`);
      setSel(new Set()); setQty({});
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Exportar a otra tienda" description={`Desde ${store.name}. Si el código ya existe en la tienda destino, se actualiza en vez de duplicarse.`} />
      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <Panel>
          <div className="flex flex-wrap items-center gap-3 border-b border-line/70 p-4">
            <div className="relative min-w-48 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input aria-label="Buscar" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-11" />
            </div>
            <Checkbox label="Todos" checked={shown.length > 0 && shown.every((p) => sel.has(p.id))} onChange={(v) => setSel(v ? new Set(shown.map((p) => p.id)) : new Set())} />
          </div>
          <ul className="max-h-[60dvh] overflow-y-auto">
            {shown.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0">
                <Checkbox className="min-w-0 flex-1" checked={sel.has(p.id)} onChange={(v) => toggle(p.id, v)} label={<span className="block min-w-0"><span className="block truncate font-semibold">{p.description}</span><span className="num text-sm text-ink-2">{p.barcode} · {money(p.salePrice)} · {p.quantity} en existencia</span></span>} />
                {mode === 'stock' && sel.has(p.id) && (
                  <Input aria-label={`Unidades de ${p.description}`} inputMode="numeric" value={qty[p.id] ?? String(p.quantity)} onChange={(e) => setQty({ ...qty, [p.id]: e.target.value })} className="num w-20" />
                )}
              </li>
            ))}
          </ul>
        </Panel>
        <div className="flex flex-col gap-4">
          <Field label="Tienda destino" htmlFor="to"><Select id="to" value={to} onChange={(e) => setTo(e.target.value)}>{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold">Qué exportar</legend>
            {MODES.map((m) => (
              <label key={m.id} className={`cursor-pointer rounded-xl p-3.5 ring-1 ${mode === m.id ? 'bg-facade-wash ring-2 ring-facade-deep' : 'bg-white ring-line'}`}>
                <span className="flex items-center gap-2 font-semibold"><input type="radio" name="mode" checked={mode === m.id} onChange={() => setMode(m.id)} className="accent-[var(--facade-deep)]" />{m.title}</span>
                <span className="mt-1 block text-sm text-ink-2">{m.body}</span>
              </label>
            ))}
          </fieldset>
          <Button size="lg" disabled={!sel.size} busy={busy} onClick={go} icon={<ArrowRightLeft className="size-4" />}>Exportar {sel.size || ''} {sel.size === 1 ? 'producto' : 'productos'}</Button>
        </div>
      </div>
    </>
  );
}
