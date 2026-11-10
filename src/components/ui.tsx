import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X } from 'lucide-react';
import { clsx } from '../lib/util';
import { money, toCents } from '../lib/money';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'facade';
const variants: Record<Variant, string> = {
  primary: 'bg-adoquin text-on-adoquin hover:bg-adoquin-deep active:bg-adoquin-deep',
  secondary: 'bg-white text-ink ring-1 ring-line hover:bg-cal-2',
  ghost: 'text-ink-2 hover:bg-cal-2 hover:text-ink',
  danger: 'bg-bad text-white hover:bg-[#912018]',
  facade: 'bg-facade-deep text-white hover:brightness-110',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; busy?: boolean; icon?: ReactNode }>(
  function Button({ variant = 'primary', size = 'md', busy, icon, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || busy}
        className={clsx(
          'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,transform,filter] duration-150 select-none',
          'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
          size === 'sm' && 'h-9 px-3 text-sm',
          size === 'md' && 'h-11 px-4 text-[15px]',
          size === 'lg' && 'h-14 px-6 text-lg',
          variants[variant], className,
        )}
        {...rest}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
        {children}
      </button>
    );
  });

export function Field({ label, hint, error, optional, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; optional?: boolean; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold text-ink">
        {label} {optional && <span className="font-normal text-ink-3">(opcional)</span>}
      </label>
      {children}
      {error ? <p className="text-sm text-bad" role="alert">{error}</p> : hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
    </div>
  );
}

/** Ancho completo salvo que el llamador pida otro (w-32, min-w-…). */
const widthOf = (c?: string) => (c && /(^|\s)w-/.test(c) ? '' : 'w-full');
const inputCls = 'h-11 rounded-xl bg-white px-3.5 text-[15px] text-ink ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-facade-deep disabled:bg-cal-2';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(inputCls, widthOf(className), className)} {...rest} />;
});
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(inputCls, widthOf(className), 'appearance-none bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%234a5468%27 stroke-width=%272%27%3E%3Cpath d=%27m4 6 4 4 4-4%27/%3E%3C/svg%3E")] bg-[right_12px_center] bg-no-repeat pr-9', className)} {...rest}>{children}</select>;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(inputCls, 'w-full h-auto min-h-24 py-2.5', className)} {...rest} />;
}

/** Entrada de dinero: el usuario escribe dólares; el valor es en centavos. */
export function MoneyInput({ value, onChange, id, placeholder = '0.00', autoFocus, className }: { value: number | undefined; onChange: (c: number | undefined) => void; id?: string; placeholder?: string; autoFocus?: boolean; className?: string }) {
  const [text, setText] = useState(value != null ? (value / 100).toFixed(2) : '');
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) { setText(value != null ? (value / 100).toFixed(2) : ''); last.current = value; }
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3">$</span>
      <Input
        id={id} inputMode="decimal" autoComplete="off" autoFocus={autoFocus} placeholder={placeholder}
        className={clsx('num pl-7', className)} value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^0-9.]/g, '');
          setText(t);
          const c = t === '' ? undefined : toCents(t);
          last.current = c;
          onChange(Number.isFinite(c) ? c : undefined);
        }}
      />
    </div>
  );
}

export function Sheet({ open, onClose, title, children, wide, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref} aria-labelledby={titleId} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={clsx(
        'm-0 mt-auto w-full max-w-none rounded-t-3xl bg-cal p-0 text-ink shadow-[var(--shadow-sheet)] sm:m-auto sm:rounded-3xl',
        wide ? 'sm:max-w-3xl' : 'sm:max-w-lg', 'max-h-[92dvh]',
      )}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <h2 id={titleId} className="text-lg font-bold">{title}</h2>
            <button onClick={onClose} className="grid size-10 place-items-center rounded-full text-ink-2 hover:bg-cal-2" aria-label="Cerrar"><X className="size-5" /></button>
          </header>
          <div className="overflow-y-auto px-5 py-5">{children}</div>
          {footer && <footer className="pb-safe border-t border-line bg-white/60 px-5 py-4">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-[-0.01em] text-balance sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-[65ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'bad' | 'warn' | 'good' | 'facade'; children: ReactNode }) {
  const t = {
    neutral: 'bg-cal-2 text-ink-2', bad: 'bg-bad-wash text-bad', warn: 'bg-warn-wash text-warn',
    good: 'bg-good-wash text-good', facade: 'bg-facade-wash text-facade-deep',
  }[tone];
  return <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap', t)}>{children}</span>;
}

export function Panel({ className, children, title, actions }: { className?: string; children: ReactNode; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={clsx('rounded-2xl bg-white ring-1 ring-line/70', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-3.5">
          <h2 className="font-bold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-facade-wash text-facade-deep">{icon}</div>
      <p className="text-lg font-bold">{title}</p>
      {children && <p className="mt-1 max-w-[46ch] text-ink-2">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl bg-cal-2 p-1">
      {options.map((o) => (
        <button
          key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={clsx('h-9 rounded-lg px-3.5 text-sm font-semibold transition-colors', value === o.value ? 'bg-white text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}
        >{o.label}</button>
      ))}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'bad' | 'good' | 'warn' }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-ink-2">{label}</p>
      <p className={clsx('num mt-0.5 truncate text-2xl font-bold tracking-[-0.01em]', tone === 'bad' && 'text-bad', tone === 'good' && 'text-good', tone === 'warn' && 'text-warn')}>{value}</p>
      {sub && <p className="text-sm text-ink-3">{sub}</p>}
    </div>
  );
}

export const Money = ({ c, className }: { c: number; className?: string }) => <span className={clsx('num', className)}>{money(c)}</span>;

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; className?: string }) {
  return (
    <label className={clsx('flex cursor-pointer items-center gap-3 select-none', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 shrink-0 accent-[var(--facade-deep)]" />
      <span>{label}</span>
    </label>
  );
}

export function Banner({ tone, icon, children, action }: { tone: 'bad' | 'warn' | 'good' | 'facade'; icon?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const t = { bad: 'bg-bad-wash text-bad', warn: 'bg-warn-wash text-warn', good: 'bg-good-wash text-good', facade: 'bg-facade-wash text-facade-deep' }[tone];
  return (
    <div className={clsx('flex flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium', t)} role="status">
      {icon}
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}
