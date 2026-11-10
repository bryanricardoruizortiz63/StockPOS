import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, PackagePlus, ScanBarcode, Trash2 } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { adjustStock, effectiveThreshold, findByBarcode, saveProduct } from '../lib/inventory';
import type { Product } from '../lib/types';
import { Button, Field, Input, MoneyInput, PageHeader, Panel } from '../components/ui';
import { PhotoInput } from '../components/PhotoInput';
import { Scanner } from '../components/Scanner';
import { errMsg, useToast } from '../components/toast';

export default function ProductPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { store, isAdmin } = useActive();
  const nav = useNavigate();
  const toast = useToast();
  const [loaded, setLoaded] = useState<Product | null | undefined>(id ? undefined : null);
  const [barcode, setBarcode] = useState(params.get('codigo') ?? '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [marketPrice, setMarketPrice] = useState<number | undefined>();
  const [salePrice, setSalePrice] = useState<number | undefined>();
  const [quantity, setQuantity] = useState('');
  const [alert, setAlert] = useState('');
  const [photo, setPhoto] = useState<string | undefined>();
  const [restock, setRestock] = useState('');
  const [scan, setScan] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    db.products.get(id).then((p) => {
      setLoaded(p ?? null);
      if (!p) return;
      setBarcode(p.barcode); setDescription(p.description); setCategory(p.category ?? '');
      setMarketPrice(p.marketPrice); setSalePrice(p.salePrice || undefined); setQuantity(String(p.quantity));
      setAlert(p.alertThreshold != null ? String(p.alertThreshold) : ''); setPhoto(p.photo);
    });
  }, [id]);

  const cats = useLiveQuery(async () => [...new Set((await db.products.where('storeId').equals(store.id).toArray()).map((p) => p.category).filter(Boolean) as string[])].sort(), [store.id]) ?? [];

  async function onScan(code: string) {
    setScan(false);
    const existing = await findByBarcode(store.id, code);
    if (existing && existing.id !== id) { toast(`Ese código ya es "${existing.description}". Abriendo para reponer.`); nav(`/inventario/${existing.id}?reponer=1`); return; }
    setBarcode(code);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErrors(null); setBusy(true);
    try {
      const q = quantity.trim() === '' ? NaN : Number(quantity);
      const a = alert.trim() === '' ? undefined : Number(alert);
      if (a != null && (!Number.isInteger(a) || a < 0)) throw new Error('La alerta debe ser un número entero.');
      await saveProduct({
        storeId: store.id, barcode, description, category: category.trim() || undefined,
        marketPrice, salePrice: salePrice ?? NaN, quantity: q, alertThreshold: a, photo,
      }, loaded?.id);
      toast(loaded ? 'Producto actualizado' : 'Producto añadido al inventario');
      nav('/inventario');
    } catch (err) { setErrors(errMsg(err)); } finally { setBusy(false); }
  }

  async function doRestock() {
    const n = Number(restock);
    if (!Number.isInteger(n) || n === 0) return toast('Escribe cuántas unidades entran (o negativo para sacar).', 'bad');
    try {
      await adjustStock(loaded!.id, n);
      setQuantity(String(Number(quantity) + n)); setRestock('');
      toast(n > 0 ? `+${n} unidades` : `${n} unidades`);
    } catch (e) { toast(errMsg(e), 'bad'); }
  }

  async function remove() {
    if (!loaded || !confirm(`¿Eliminar "${loaded.description}" del inventario? Las ventas pasadas se conservan.`)) return;
    await db.products.delete(loaded.id);
    toast('Producto eliminado');
    nav('/inventario');
  }

  if (loaded === undefined) return null;
  if (id && loaded === null) return <p className="text-ink-2">Este producto no existe.</p>;
  const editing = !!loaded;
  const canEditCore = !editing || isAdmin;

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl">
      <button type="button" onClick={() => nav(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Inventario</button>
      <PageHeader title={editing ? loaded!.description : 'Nuevo producto'} description={editing ? undefined : 'Los campos sin “(opcional)” son obligatorios.'} />

      {editing && (
        <Panel className="mb-5 p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="mr-auto">
              <p className="text-sm text-ink-2">En existencia</p>
              <p className="num text-4xl font-bold tracking-[-0.02em]">{quantity}</p>
              <p className="text-sm text-ink-3">Alerta en ≤ {effectiveThreshold({ ...loaded!, alertThreshold: alert === '' ? undefined : Number(alert) }, store)}</p>
            </div>
            <Field label="Entrada de mercancía" htmlFor="rs">
              <Input id="rs" inputMode="numeric" value={restock} onChange={(e) => setRestock(e.target.value)} placeholder="+12" className="num w-28" autoFocus={params.get('reponer') === '1'} />
            </Field>
            <Button type="button" onClick={doRestock} icon={<PackagePlus className="size-4" />}>Añadir</Button>
          </div>
        </Panel>
      )}

      <Panel className="p-5">
        <div className="flex flex-col gap-5">
          <Field label="Código de barras" htmlFor="bc" hint="Escanéalo con la cámara o escríbelo si no se puede leer.">
            <div className="flex gap-2">
              <Input id="bc" value={barcode} onChange={(e) => setBarcode(e.target.value)} inputMode="numeric" className="num" disabled={!canEditCore} required />
              {canEditCore && <Button type="button" variant="secondary" onClick={() => setScan(true)} icon={<ScanBarcode className="size-4" />}>Escanear</Button>}
            </div>
          </Field>
          <Field label="Descripción del producto" htmlFor="desc">
            <Input id="desc" value={description} onChange={(e) => setDescription(e.target.value)} required disabled={!canEditCore} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Precio de venta" htmlFor="sp"><MoneyInput id="sp" value={salePrice} onChange={setSalePrice} /></Field>
            <Field label="Precio en el mercado" htmlFor="mp" optional hint="Referencia de lo que cuesta en otros sitios."><MoneyInput id="mp" value={marketPrice} onChange={setMarketPrice} /></Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Cantidad" htmlFor="qty"><Input id="qty" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="num" required disabled={editing && !isAdmin} /></Field>
            <Field label="Categoría" htmlFor="cat" optional>
              <Input id="cat" list="cat-list" value={category} onChange={(e) => setCategory(e.target.value)} />
              <datalist id="cat-list">{cats.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            {isAdmin && <Field label="Alerta propia" htmlFor="al" optional hint="Avisar al llegar a esta cantidad."><Input id="al" inputMode="numeric" value={alert} onChange={(e) => setAlert(e.target.value)} className="num" placeholder={String(store.defaultAlertThreshold)} /></Field>}
          </div>
          <Field label="Foto" optional><PhotoInput value={photo} onChange={setPhoto} /></Field>
          {errors && <p className="text-sm font-medium text-bad" role="alert">{errors}</p>}
        </div>
      </Panel>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="submit" size="lg" busy={busy}>{editing ? 'Guardar cambios' : 'Añadir al inventario'}</Button>
        {editing && isAdmin && <Button type="button" variant="ghost" size="lg" onClick={remove} icon={<Trash2 className="size-4" />}>Eliminar</Button>}
      </div>
      <Scanner open={scan} onClose={() => setScan(false)} onResult={onScan} />
    </form>
  );
}
