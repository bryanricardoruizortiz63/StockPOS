import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, FileText, X } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { approveCertification, denyCertification } from '../lib/flows';
import { fmtDate } from '../lib/util';
import type { CertRequest } from '../lib/types';
import { Badge, Button, Empty, PageHeader, Panel } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

export default function CertificationsPage() {
  const { user } = useActive();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const data = useLiveQuery(async () => ({
    reqs: (await db.certRequests.toArray()).sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending') || b.requestedAt - a.requestedAt),
    names: new Map((await db.users.toArray()).map((u) => [u.id, u.name])),
  }), []);
  if (!data) return null;
  async function approve(r: CertRequest) {
    setBusy(r.id);
    try { await approveCertification(r, user); toast('Aprobada y enviada por email'); } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(null); }
  }
  async function deny(r: CertRequest) {
    const note = prompt('Razón (la verá el empleado):') ?? '';
    await denyCertification(r, note);
  }
  return (
    <>
      <PageHeader title="Certificaciones de empleo" description="Al aprobar, la carta se firma y se envía por email al empleado automáticamente." />
      <Panel>
        {data.reqs.length === 0 ? <Empty icon={<FileText className="size-7" />} title="Sin solicitudes">Los empleados las piden desde Mis documentos.</Empty> : (
          <ul>{data.reqs.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-3.5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{data.names.get(r.employeeId) ?? '—'}</p>
                <p className="text-sm text-ink-2">{fmtDate(r.requestedAt)} · {r.addressee || 'A quien pueda interesar'}{r.purpose ? ` · ${r.purpose}` : ''}{r.includeSalary ? ' · con salario' : ''}</p>
              </div>
              {r.status === 'pending' ? (
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => deny(r)} icon={<X className="size-4" />}>Rechazar</Button>
                  <Button size="sm" busy={busy === r.id} onClick={() => approve(r)} icon={<Check className="size-4" />}>Aprobar y enviar</Button>
                </div>
              ) : <Badge tone={r.status === 'approved' ? 'good' : 'bad'}>{r.status === 'approved' ? 'Aprobada' : 'Rechazada'}</Badge>}
            </li>
          ))}</ul>
        )}
      </Panel>
    </>
  );
}
