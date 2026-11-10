import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FilePlus2, FileText } from 'lucide-react';
import { db } from '../lib/db';
import { useActive } from '../lib/session';
import { certificationPdf, exportPunches, payStubPdf } from '../lib/flows';
import { verificationCode } from '../lib/docs';
import { money } from '../lib/money';
import { addDays, dayKey, downloadBlob, fmtDate, uid } from '../lib/util';
import { Badge, Button, Checkbox, Empty, Field, Input, PageHeader, Panel, Sheet } from '../components/ui';
import { errMsg, useToast } from '../components/toast';

export default function DocumentsPage() {
  const { user, store } = useActive();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const stubs = useLiveQuery(() => db.payStubs.where('employeeId').equals(user.id).reverse().sortBy('periodEnd'), [user.id]) ?? [];
  const certs = useLiveQuery(() => db.certRequests.where('employeeId').equals(user.id).reverse().sortBy('requestedAt'), [user.id]) ?? [];
  const docs = useLiveQuery(async () => new Map((await db.docs.where('employeeId').equals(user.id).toArray()).map((d) => [d.id, d])), [user.id]);

  async function myPunches() {
    try {
      const to = dayKey(), from = addDays(to, -89);
      const r = await exportPunches(new Date(`${from}T00:00:00-04:00`).getTime(), new Date(`${to}T23:59:59-04:00`).getTime(), `Mis ponches · ${user.name}`, user.id);
      downloadBlob(r.pdf, `mis-ponches-${to}.pdf`);
    } catch (e) { toast(errMsg(e), 'bad'); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Mis documentos" description="Talonarios, certificaciones y ponches. Todos llevan un código para verificar que son auténticos."
        actions={<><Button variant="secondary" onClick={myPunches} icon={<Download className="size-4" />}>Mis ponches (90 días)</Button><Button onClick={() => setAsk(true)} icon={<FilePlus2 className="size-4" />}>Pedir certificación</Button></>} />

      <Panel title="Talonarios de pago">
        {stubs.length === 0 ? <Empty icon={<FileText className="size-7" />} title="Sin talonarios todavía">Cuando el administrador emita la nómina, tu talonario aparece aquí y te llega por email.</Empty> : (
          <ul>{stubs.map((s) => {
            const d = docs?.get(s.docId);
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{fmtDate(s.periodStart)} – {fmtDate(s.periodEnd)}</p>
                  <p className="num text-sm text-ink-2">{(s.regularHours + s.overtimeHours).toFixed(2)} h · Bruto {money(s.gross)}{d ? ` · ${verificationCode(d)}` : ''}</p>
                </div>
                <span className="num text-lg font-bold">{money(s.net)}</span>
                <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await payStubPdf(s), `talonario-${s.periodEnd}.pdf`)}>PDF</Button>
              </li>
            );
          })}</ul>
        )}
      </Panel>

      <Panel className="mt-5" title="Certificaciones de empleo">
        {certs.length === 0 ? <p className="px-5 py-8 text-center text-ink-2">No has pedido certificaciones.</p> : (
          <ul>{certs.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 border-b border-line/60 px-5 py-3 last:border-0">
              <div className="min-w-0 flex-1"><p className="font-semibold">{c.addressee || 'A quien pueda interesar'}</p><p className="text-sm text-ink-2">{fmtDate(c.requestedAt)}{c.purpose ? ` · ${c.purpose}` : ''}{c.decisionNote ? ` · ${c.decisionNote}` : ''}</p></div>
              {c.status === 'pending' && <Badge tone="warn">Pendiente</Badge>}
              {c.status === 'denied' && <Badge tone="bad">No aprobada</Badge>}
              {c.status === 'approved' && c.docId && docs?.get(c.docId) && (
                <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={async () => downloadBlob(await certificationPdf(docs.get(c.docId!)!), 'certificacion.pdf')}>PDF</Button>
              )}
            </li>
          ))}</ul>
        )}
      </Panel>
      <RequestCert open={ask} onClose={() => setAsk(false)} storeId={store.id} />
    </div>
  );
}

function RequestCert({ open, onClose, storeId }: { open: boolean; onClose: () => void; storeId: string }) {
  const { user } = useActive();
  const toast = useToast();
  const [addressee, setAddressee] = useState('');
  const [purpose, setPurpose] = useState('');
  const [salary, setSalary] = useState(true);
  async function send() {
    await db.certRequests.add({ id: uid(), employeeId: user.id, storeId, addressee: addressee.trim(), purpose: purpose.trim(), includeSalary: salary, status: 'pending', requestedAt: Date.now() });
    await db.notices.add({ id: uid(), forRole: 'admin', storeId, title: 'Solicitud de certificación', body: `${user.name} pidió una certificación de empleo.`, link: '/certificaciones', read: false, createdAt: Date.now() });
    toast('Solicitud enviada al administrador'); setAddressee(''); setPurpose(''); onClose();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Pedir certificación de empleo" footer={<Button size="lg" className="w-full" onClick={send}>Enviar solicitud</Button>}>
      <p className="mb-5 text-ink-2">Cuando el administrador la apruebe, te llega por email firmada y queda aquí para descargar.</p>
      <div className="flex flex-col gap-4">
        <Field label="Dirigida a" htmlFor="ca" optional><Input id="ca" value={addressee} onChange={(e) => setAddressee(e.target.value)} placeholder="A quien pueda interesar" /></Field>
        <Field label="Para qué es" htmlFor="cp" optional><Input id="cp" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Solicitud de préstamo, alquiler…" /></Field>
        <Checkbox label="Incluir mi salario" checked={salary} onChange={setSalary} />
      </div>
    </Sheet>
  );
}
