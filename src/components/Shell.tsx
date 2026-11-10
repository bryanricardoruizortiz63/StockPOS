import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bell, Boxes, CalendarDays, ChartColumnBig, ClipboardCheck, Clock, FileText, LogOut, Mail, Menu, Settings,
  ShieldCheck, ShoppingCart, Store as StoreIcon, Users, Wallet, Fingerprint,
} from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { clsx } from '../lib/util';
import { Sheet } from './ui';
import { ArchivePrompt } from './ArchivePrompt';

interface NavItem { to: string; label: string; icon: ReactNode; admin?: boolean; employee?: boolean; mobile?: boolean }

const I = (C: typeof Bell) => <C className="size-5" aria-hidden />;
const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Tienda', items: [
    { to: '/', label: 'Vender', icon: I(ShoppingCart), mobile: true },
    { to: '/inventario', label: 'Inventario', icon: I(Boxes), mobile: true },
    { to: '/turno', label: 'Mi turno y cuadre', icon: I(Wallet) },
    { to: '/reportes', label: 'Reportes', icon: I(ChartColumnBig), admin: true, mobile: true },
    { to: '/turnos', label: 'Cierres de turno', icon: I(ClipboardCheck), admin: true },
  ] },
  { group: 'Personal', items: [
    { to: '/ponchar', label: 'Ponchar', icon: I(Fingerprint), employee: true, mobile: true },
    { to: '/horario', label: 'Mi horario', icon: I(CalendarDays), employee: true },
    { to: '/documentos', label: 'Mis documentos', icon: I(FileText), employee: true },
    { to: '/ponches', label: 'Ponches', icon: I(Clock), admin: true },
    { to: '/horarios', label: 'Horarios', icon: I(CalendarDays), admin: true },
    { to: '/nomina', label: 'Nómina', icon: I(Wallet), admin: true },
    { to: '/empleados', label: 'Empleados', icon: I(Users), admin: true },
    { to: '/certificaciones', label: 'Certificaciones', icon: I(FileText), admin: true },
  ] },
  { group: 'Sistema', items: [
    { to: '/tiendas', label: 'Tiendas', icon: I(StoreIcon), admin: true },
    { to: '/configuracion', label: 'Configuración', icon: I(Settings), admin: true },
    { to: '/salida', label: 'Correos enviados', icon: I(Mail), admin: true },
    { to: '/verificar', label: 'Verificar documento', icon: I(ShieldCheck) },
  ] },
];

function useNav(isAdmin: boolean) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => (isAdmin ? !i.employee : !i.admin)) })).filter((g) => g.items.length);
}

function StoreSwitcher() {
  const { store, stores, switchStore } = useActive();
  if (stores.length < 2) return <span className="truncate font-bold">{store.name}</span>;
  return (
    <label className="relative flex min-w-0 items-center">
      <span className="sr-only">Tienda</span>
      <select
        value={store.id} onChange={(e) => switchStore(e.target.value)}
        className="min-w-0 cursor-pointer appearance-none truncate rounded-lg bg-transparent py-1 pr-6 pl-0 font-bold text-ink focus:outline-none"
      >
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <svg className="pointer-events-none absolute right-0 size-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2"><path d="m4 6 4 4 4-4" /></svg>
    </label>
  );
}

function FacadeBand() {
  const { user, store, isAdmin } = useActive();
  const nav = useNavigate();
  const shift = useLiveQuery(() => db.shifts.where('employeeId').equals(user.id).filter((s) => !s.closedAt && s.storeId === store.id).first(), [user.id, store.id]);
  const unread = useLiveQuery(() => db.notices.filter((n) => !n.read && (isAdmin ? n.forRole === 'admin' : n.userId === user.id)).count(), [user.id, isAdmin]) ?? 0;
  return (
    <header className="facade-band pt-safe sticky top-0 z-30 text-ink">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <StoreIcon className="size-5 shrink-0" aria-hidden />
          <StoreSwitcher />
          <span className="hidden text-sm font-medium text-ink/75 sm:inline">· IVU {+(store.ivuRate * 100).toFixed(3)}%</span>
        </div>
        <button onClick={() => nav('/turno')} className={clsx('hidden h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold sm:flex', shift ? 'bg-white/55' : 'bg-ink text-cal')}>
          <span className={clsx('size-2 rounded-full', shift ? 'bg-good' : 'bg-facade')} />
          {shift ? 'Turno abierto' : 'Sin turno'}
        </button>
        <button onClick={() => nav('/avisos')} className="relative grid size-10 place-items-center rounded-full hover:bg-white/40" aria-label={`Avisos${unread ? `, ${unread} sin leer` : ''}`}>
          <Bell className="size-5" />
          {unread > 0 && <span className="num absolute top-1 right-1 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[11px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </div>
    </header>
  );
}

function RailLink({ item, onClick, compact }: { item: NavItem; onClick?: () => void; compact?: boolean }) {
  return (
    <NavLink
      to={item.to} end={item.to === '/'} onClick={onClick}
      title={item.label}
      className={({ isActive }) => clsx(
        'flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors',
        compact && 'max-xl:justify-center max-xl:px-0',
        isActive ? 'bg-cal text-ink' : 'text-on-adoquin-2 hover:bg-adoquin-soft hover:text-on-adoquin',
      )}
    >
      {({ isActive }) => (<>
        <span className={isActive ? 'text-facade-deep' : ''}>{item.icon}</span>
        <span className={compact ? 'max-xl:sr-only' : ''}>{item.label}</span>
      </>)}
    </NavLink>
  );
}

function Rail() {
  const { user, isAdmin, signOut } = useActive();
  const groups = useNav(isAdmin);
  return (
    <aside className="rail sticky top-0 hidden h-dvh w-[76px] shrink-0 xl:w-60 flex-col bg-adoquin text-on-adoquin lg:flex">
      <div className="flex h-14 items-center gap-2.5 px-5 max-xl:justify-center max-xl:px-0">
        <img src="/icon.svg" alt="" className="size-7 rounded-md" />
        <span className="text-lg font-bold tracking-[-0.01em] max-xl:sr-only">StockPOS</span>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Principal">
        {groups.map((g) => (
          <div key={g.group} className="mt-4">
            <p className="px-3 pb-1.5 text-xs font-semibold text-on-adoquin-2/80 max-xl:sr-only">{g.group}</p>
            <div className="flex flex-col gap-0.5">{g.items.map((i) => <RailLink key={i.to} item={i} compact />)}</div>
          </div>
        ))}
      </nav>
      <div className="border-t border-adoquin-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2 max-xl:flex-col max-xl:px-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-facade font-bold text-ink">{user.name.slice(0, 1).toUpperCase()}</div>
          <div className="min-w-0 flex-1 max-xl:sr-only">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="text-xs text-on-adoquin-2">{isAdmin ? 'Administrador' : 'Empleado'}</p>
          </div>
          <button onClick={signOut} className="grid size-9 place-items-center rounded-lg text-on-adoquin-2 hover:bg-adoquin-soft hover:text-on-adoquin" aria-label="Cerrar sesión"><LogOut className="size-4.5" /></button>
        </div>
      </div>
    </aside>
  );
}

function BottomBar() {
  const { isAdmin, user, signOut } = useActive();
  const [more, setMore] = useState(false);
  const groups = useNav(isAdmin);
  const primary = groups.flatMap((g) => g.items).filter((i) => i.mobile).slice(0, 4);
  return (
    <>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 bg-adoquin text-on-adoquin lg:hidden" aria-label="Principal">
        <div className="grid h-16 grid-cols-5">
          {primary.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.to === '/'} className={({ isActive }) => clsx('flex flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-facade' : 'text-on-adoquin-2')}>
              {i.icon}{i.label}
            </NavLink>
          ))}
          <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-on-adoquin-2"><Menu className="size-5" />Más</button>
        </div>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title={user.name}>
        <div className="rail -mx-2 rounded-2xl bg-adoquin p-2">
          {groups.map((g) => (
            <div key={g.group} className="mb-2">
              <p className="px-3 pt-2 pb-1 text-xs font-semibold text-on-adoquin-2/80">{g.group}</p>
              {g.items.map((i) => <RailLink key={i.to} item={i} onClick={() => setMore(false)} />)}
            </div>
          ))}
          <button onClick={signOut} className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-[15px] font-medium text-on-adoquin-2 hover:bg-adoquin-soft"><LogOut className="size-5" />Cerrar sesión</button>
        </div>
      </Sheet>
    </>
  );
}

export function Shell() {
  const loc = useLocation();
  const { isAdmin } = useActive();
  const fullBleed = loc.pathname === '/';
  return (
    <div className="flex min-h-dvh">
      <Rail />
      <div className="flex min-w-0 flex-1 flex-col">
        <FacadeBand />
        {isAdmin && <ArchivePrompt />}
        <main className={clsx('flex-1 pb-24 lg:pb-8', fullBleed ? '' : 'mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:pt-8')}>
          <Outlet />
        </main>
      </div>
      <BottomBar />
    </div>
  );
}
