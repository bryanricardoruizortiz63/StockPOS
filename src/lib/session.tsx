import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { needsDailyMfa } from './auth';
import type { Store, User } from './types';

interface SessionValue {
  ready: boolean;
  user?: User;
  store?: Store;
  stores: Store[];
  mfaPending: boolean;
  isAdmin: boolean;
  signIn: (u: User) => void;
  signOut: () => void;
  switchStore: (id: string) => void;
}

const Ctx = createContext<SessionValue | null>(null);
const KEY = 'stockpos.session';

function readSession(): { userId?: string; storeId?: string } {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function writeSession(v: { userId?: string; storeId?: string }) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* modo privado */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sess, setSess] = useState(readSession);
  const user = useLiveQuery(() => (sess.userId ? db.users.get(sess.userId) : undefined), [sess.userId]);
  const allStores = useLiveQuery(() => db.stores.orderBy('name').toArray(), [], undefined);
  const ready = allStores !== undefined && (!sess.userId || user !== undefined);

  const stores = useMemo(() => {
    if (!user || !allStores) return [];
    return user.role === 'admin' ? allStores : allStores.filter((s) => user.storeIds.includes(s.id));
  }, [user, allStores]);

  const store = stores.find((s) => s.id === sess.storeId) ?? stores[0];

  useEffect(() => {
    if (store) document.documentElement.dataset.facade = store.color;
  }, [store]);

  useEffect(() => {
    if (user && !user.active) { setSess({}); writeSession({}); }
  }, [user]);

  const signIn = useCallback((u: User) => {
    const v = { userId: u.id, storeId: u.storeIds[0] };
    setSess(v);
    writeSession(v);
  }, []);
  const signOut = useCallback(() => { setSess({}); writeSession({}); }, []);
  const switchStore = useCallback((id: string) => {
    setSess((s) => { const v = { ...s, storeId: id }; writeSession(v); return v; });
  }, []);

  const value: SessionValue = {
    ready,
    user: user ?? undefined,
    store,
    stores,
    mfaPending: !!user && needsDailyMfa(user),
    isAdmin: user?.role === 'admin',
    signIn,
    signOut,
    switchStore,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider faltante');
  return v;
}

/** Igual que useSession pero garantiza usuario y tienda (dentro del shell). */
export function useActive() {
  const s = useSession();
  if (!s.user || !s.store) throw new Error('Sin sesión activa');
  return { ...s, user: s.user, store: s.store };
}
