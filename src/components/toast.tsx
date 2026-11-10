import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { clsx } from '../lib/util';

interface Toast { id: number; tone: 'good' | 'bad'; text: string }
const Ctx = createContext<(text: string, tone?: 'good' | 'bad') => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'good' | 'bad' = 'good') => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, tone, text }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'bad' ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((t) => (
          <div key={t.id} className={clsx('pop pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold shadow-[var(--shadow-lift)]',
            t.tone === 'good' ? 'bg-adoquin text-on-adoquin' : 'bg-bad text-white')}>
            {t.tone === 'good' ? <CircleCheck className="size-5 shrink-0" /> : <CircleAlert className="size-5 shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);

/** Mensaje legible de cualquier error. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
