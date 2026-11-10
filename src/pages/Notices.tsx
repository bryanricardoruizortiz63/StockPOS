import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { clsx, fmtDateTime } from '../lib/util';
import { Empty, PageHeader, Panel } from '../components/ui';

export default function NoticesPage() {
  const { user, isAdmin } = useActive();
  const list = useLiveQuery(() => db.notices.orderBy('createdAt').reverse().filter((n) => (isAdmin ? n.forRole === 'admin' : n.userId === user.id)).limit(100).toArray(), [user.id, isAdmin]) ?? [];
  useEffect(() => {
    const t = setTimeout(() => { void db.notices.bulkUpdate(list.filter((n) => !n.read).map((n) => ({ key: n.id, changes: { read: true } }))); }, 1500);
    return () => clearTimeout(t);
  }, [list]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Avisos" />
      <Panel>
        {list.length === 0 ? <Empty icon={<Bell className="size-7" />} title="Sin avisos">Aquí verás cierres de turno, inventario bajo y solicitudes.</Empty> : (
          <ul>{list.map((n) => {
            const body = (<><p className="font-semibold">{n.title}</p><p className="text-ink-2">{n.body}</p><p className="mt-0.5 text-sm text-ink-3">{fmtDateTime(n.createdAt)}</p></>);
            return (
              <li key={n.id} className={clsx('border-b border-line/60 last:border-0', !n.read && 'bg-facade-wash/60')}>
                {n.link ? <Link to={n.link} className="block px-5 py-3.5 hover:bg-cal">{body}</Link> : <div className="px-5 py-3.5">{body}</div>}
              </li>
            );
          })}</ul>
        )}
      </Panel>
    </div>
  );
}
