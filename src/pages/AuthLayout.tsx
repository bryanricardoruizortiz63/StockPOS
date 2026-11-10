import type { ReactNode } from 'react';

/** Pantallas de acceso: columna de adoquín con la franja de fachada. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-adoquin p-10 text-on-adoquin lg:flex">
        <div className="flex items-center gap-3">
          <img src="/icon.svg" alt="" className="size-9 rounded-lg" />
          <span className="text-xl font-bold">StockPOS</span>
        </div>
        <div>
          <p className="max-w-[18ch] text-4xl leading-tight font-bold tracking-[-0.02em] text-balance">Inventario, caja, ponches y nómina de tu tienda.</p>
          <p className="mt-4 max-w-[42ch] text-on-adoquin-2">Cada venta descuenta inventario, cada turno cuadra y cada ponche y talonario se puede verificar.</p>
        </div>
        <div className="flex h-3 gap-1.5" aria-hidden>
          {['#e58a70', '#f1b84a', '#57bdb6', '#74bb8e', '#b19bd8', '#ec9db0'].map((c) => <span key={c} className="flex-1 rounded-full" style={{ background: c }} />)}
        </div>
      </div>
      <div className="flex flex-col">
        <div className="facade-band h-2 lg:hidden" />
        <div className="flex flex-1 items-center justify-center px-5 py-10">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src="/icon.svg" alt="" className="size-9 rounded-lg" />
              <span className="text-xl font-bold">StockPOS</span>
            </div>
            <h1 className="text-[28px] font-bold tracking-[-0.01em]">{title}</h1>
            {intro && <p className="mt-2 text-ink-2">{intro}</p>}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
