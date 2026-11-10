import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { blockHours, occurrences, WEEKDAYS } from '../lib/schedules';
import { addDays, clsx, dayKey, parseDay } from '../lib/util';
import { Empty, PageHeader, Panel } from '../components/ui';

export default function MySchedulePage() {
  const { user, stores } = useActive();
  const today = dayKey();
  const end = addDays(today, 20);
  const data = useLiveQuery(async () => {
    const scheds = await db.schedules.where('employeeId').equals(user.id).toArray();
    return scheds.flatMap((s) => occurrences(s, today, end));
  }, [user.id, today]);
  if (!data) return null;
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i));
  const weekHours = data.filter((o) => o.day <= addDays(today, 6)).reduce((h, o) => h + blockHours(o.start, o.end), 0);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mi horario" description={data.length ? `${weekHours.toFixed(1)} horas en los próximos 7 días.` : undefined} />
      {data.length === 0 ? <Panel><Empty icon={<CalendarDays className="size-7" />} title="Sin horario asignado">Tu administrador todavía no te ha asignado un horario.</Empty></Panel> : (
        <Panel>
          <ul>
            {days.map((d) => {
              const occ = data.filter((o) => o.day === d);
              const date = parseDay(d);
              return (
                <li key={d} className={clsx('flex items-center gap-4 border-b border-line/60 px-5 py-3 last:border-0', d === today && 'bg-facade-wash')}>
                  <div className="w-14 text-center">
                    <p className="text-xs font-semibold text-ink-2">{WEEKDAYS[date.getUTCDay()].slice(0, 3)}</p>
                    <p className="num text-2xl font-bold">{date.getUTCDate()}</p>
                  </div>
                  <div className="flex-1">
                    {occ.length === 0 ? <p className="text-ink-3">Libre</p> : occ.map((o, i) => (
                      <p key={i} className="num font-semibold">{o.start} – {o.end} <span className="font-normal text-ink-2">· {names.get(o.storeId) ?? ''} · {blockHours(o.start, o.end).toFixed(1)} h</span></p>
                    ))}
                  </div>
                  {d === today && <span className="text-sm font-bold text-facade-deep">Hoy</span>}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}
    </div>
  );
}
