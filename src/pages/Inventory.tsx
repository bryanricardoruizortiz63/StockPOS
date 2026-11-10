import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRightLeft, BellRing, Boxes, Plus, ScanBarcode, Search, TriangleAlert } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { effectiveThreshold, findByBarcode, isLow } from '../lib/inventory';
import { money } from '../lib/money';
import { clsx } from '../lib/util';
import { Badge, Button, Empty, Input, PageHeader, Panel, Segmented } from '../components/ui';
import { Scanner } from '../components/Scanner';
import { AlertRules } from './AlertRules';

export default function InventoryPage() {
  const { store, isAdmin } = useActive();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('filtro') as 'todo' | 'bajo') || 'todo';
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [rules, setRules] = useState(false);
  const products = useLiveQuery(() => db.products.where('storeId').equals(store.id).toArray(), [store.id]);

  const lowCount = products?.filter((p) => isLow(p, store)).length ?? 0;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (products ?? [])
      .filter((p) => (filter === 'todo' || isLow(p, store)) && (!t || p.description.toLowerCase().includes(t) || p.barcode.includes(t) || p.category?.toLowerCase().includes(t)))
      .sort((a, b) => (filter === 'bajo' ? a.quantity - b.quantity : a.description.localeCompare(b.description, 'es')));
  }, [products, q, filter, store]);

  async function onScan(code: string) {
    setScan(false);
    const p = await findByBarcode(store.id, code);
    nav(p ? `/inventario/${p.id}?reponer=1` : `/inventario/nuevo?codigo=${encodeURIComponent(code)}`);
  }

  return (
    <>
      <PageHeader
        title="Inventario"
        description={products ? `${products.length} productos en ${store.name}.` : undefined}
        actions={<>
          {isAdmin && <Button variant="secondary" onClick={() => setRules(true)} icon={<BellRing className="size-4" />}>Alertas</Button>}
          {isAdmin && <Link to="/inventario/exportar"><Button variant="secondary" icon={<ArrowRightLeft className="size-4" />}>Exportar a otra tienda</Button></Link>}
          <Button onClick={() => setScan(true)} icon={<ScanBarcode className="size-4" />}>Escanear producto</Button>
        </>}
      />

      {lowCount > 0 && filter === 'todo' && (
        <button onClick={() => setParams({ filtro: 'bajo' })} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-warn-wash px-4 py-3 text-left text-sm font-semibold text-warn">
          <TriangleAlert className="size-5 shrink-0" />
          <span className="flex-1">{lowCount} {lowCount === 1 ? 'producto está' : 'productos están'} en o bajo su alerta.</span>
          <span className="underline underline-offset-4">Ver</span>
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-3" aria-hidden />
          <label htmlFor="inv-q" className="sr-only">Buscar</label>
          <Input id="inv-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por descripción, código o categoría" className="pl-11" />
        </div>
        <Segmented label="Filtro" value={filter} onChange={(v) => setParams(v === 'todo' ? {} : { filtro: v })} options={[{ value: 'todo', label: 'Todo' }, { value: 'bajo', label: `Bajos (${lowCount})` }]} />
      </div>

      <Panel>
        {products && products.length === 0 ? (
          <Empty icon={<Boxes className="size-7" />} title="Inventario vacío" action={<Button onClick={() => setScan(true)} icon={<ScanBarcode className="size-4" />}>Escanear el primero</Button>}>
            Escanea el código de barras de un producto (o escríbelo) para añadirlo.
          </Empty>
        ) : shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-ink-2">{filter === 'bajo' ? 'Ningún producto bajo su alerta.' : 'Nada coincide con la búsqueda.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="text-sm text-ink-2">
                <tr className="border-b border-line">
                  <th className="px-5 py-3 font-semibold">Producto</th>
                  <th className="px-3 py-3 font-semibold">Código</th>
                  <th className="px-3 py-3 text-right font-semibold">Mercado</th>
                  <th className="px-3 py-3 text-right font-semibold">Venta</th>
                  <th className="px-3 py-3 text-right font-semibold">Cantidad</th>
                  <th className="px-5 py-3 text-right font-semibold">Alerta</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const th = effectiveThreshold(p, store);
                  const low = p.quantity <= th;
                  return (
                    <tr key={p.id} onClick={() => nav(`/inventario/${p.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-cal">
                      <td className="px-5 py-3">
                        <Link to={`/inventario/${p.id}`} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                          {p.photo
                            ? <img src={p.photo} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                            : <span className="h-9 w-1.5 shrink-0 rounded-full bg-facade" aria-hidden />}
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.description}</span>
                            {p.category && <span className="text-sm text-ink-2">{p.category}</span>}
                          </span>
                        </Link>
                      </td>
                      <td className="num px-3 py-3 text-sm text-ink-2">{p.barcode}</td>
                      <td className="num px-3 py-3 text-right text-ink-2">{p.marketPrice != null ? money(p.marketPrice) : '—'}</td>
                      <td className="num px-3 py-3 text-right font-semibold">{p.salePrice > 0 ? money(p.salePrice) : <Badge tone="warn">Falta</Badge>}</td>
                      <td className={clsx('num px-3 py-3 text-right text-lg font-bold', p.quantity <= 0 ? 'text-bad' : low && 'text-warn')}>{p.quantity}</td>
                      <td className="px-5 py-3 text-right">{low ? <Badge tone={p.quantity <= 0 ? 'bad' : 'warn'}>≤ {th}</Badge> : <span className="num text-sm text-ink-3">≤ {th}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Link to="/inventario/nuevo" className="mt-4 inline-block"><Button variant="ghost" icon={<Plus className="size-4" />}>Añadir sin escanear</Button></Link>

      <Scanner open={scan} onClose={() => setScan(false)} onResult={onScan} title="Escanear producto" />
      {isAdmin && <AlertRules open={rules} onClose={() => setRules(false)} />}
    </>
  );
}
