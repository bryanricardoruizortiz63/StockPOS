import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Mail, Send } from 'lucide-react';
import { db } from '../lib/db';
import { emailBackendConfigured, trySend } from '../lib/notify';
import { downloadBlob, fmtDateTime } from '../lib/util';
import { Badge, Banner, Button, Empty, PageHeader, Panel } from '../components/ui';

export default function OutboxPage() {
  const mails = useLiveQuery(() => db.outbox.orderBy('createdAt').reverse().limit(200).toArray(), []) ?? [];
  const on = emailBackendConfigured();
  return (
    <>
      <PageHeader title="Correos enviados" description="Talonarios, certificaciones y reportes de turno que el sistema envía automáticamente." />
      {!on && <div className="mb-5"><Banner tone="warn" icon={<Mail className="size-5 shrink-0" />}>El envío por email se activa al conectar Supabase (ver README). Mientras tanto quedan aquí: descarga el adjunto o ábrelo en tu correo.</Banner></div>}
      <Panel>
        {mails.length === 0 ? <Empty icon={<Mail className="size-7" />} title="Nada por aquí">Cuando cierres un turno o emitas nómina, los correos aparecerán aquí.</Empty> : (
          <ul>{mails.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.subject}</p>
                <p className="truncate text-sm text-ink-2">Para {m.to} · {fmtDateTime(m.createdAt)}</p>
              </div>
              <Badge tone={m.status === 'sent' ? 'good' : m.status === 'failed' ? 'bad' : 'warn'}>{m.status === 'sent' ? 'Enviado' : m.status === 'failed' ? 'Falló' : 'En cola'}</Badge>
              {m.attachment && <Button size="sm" variant="ghost" onClick={() => downloadBlob(m.attachment!, m.attachmentName ?? 'adjunto.pdf')} icon={<Download className="size-4" />}>Adjunto</Button>}
              {m.status !== 'sent' && (on
                ? <Button size="sm" variant="secondary" onClick={() => trySend(m)} icon={<Send className="size-4" />}>Reintentar</Button>
                : <a href={`mailto:${m.to}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`}><Button size="sm" variant="secondary" icon={<Send className="size-4" />}>Abrir en correo</Button></a>)}
            </li>
          ))}</ul>
        )}
      </Panel>
    </>
  );
}
