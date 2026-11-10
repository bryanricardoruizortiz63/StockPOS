import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { verifyDocument, type VerifyResult } from '../lib/docs';
import { fmtDateTime } from '../lib/util';
import { Button, Input, PageHeader, Panel } from '../components/ui';

const KIND: Record<string, string> = {
  'shift-report': 'Reporte de cierre de turno', 'pay-stub': 'Talonario de pago', certification: 'Certificación de empleo',
  'punch-archive': 'Archivo anual de ponches', 'punch-export': 'Reporte de ponches', 'sales-report': 'Reporte de ventas',
};

export function VerifyPage({ standalone }: { standalone?: boolean }) {
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('c') ?? '');
  const [res, setRes] = useState<VerifyResult | null>(null);
  const check = async (c = code) => { if (c.trim()) setRes(await verifyDocument(c)); };
  useEffect(() => { if (params.get('c')) void check(params.get('c')!); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const body = (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Verificar documento" description="Escribe el código impreso al pie del PDF (o escanea su QR) para comprobar que es auténtico y no fue alterado." />
      <Panel className="p-5">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void check(); }}>
          <label htmlFor="vc" className="sr-only">Código de verificación</label>
          <Input id="vc" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD1234-EF567890" className="num uppercase" />
          <Button type="submit">Verificar</Button>
        </form>
        {res && (res.status === 'valid' ? (
          <div className="mt-5 rounded-xl bg-good-wash p-4 text-good">
            <p className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="size-6" />Auténtico</p>
            <p className="mt-1 text-ink">{KIND[res.doc.kind]} · {res.doc.title}</p>
            <p className="text-sm text-ink-2">Emitido {fmtDateTime(res.doc.createdAt)}. La firma y el contenido coinciden.</p>
          </div>
        ) : res.status === 'tampered' ? (
          <div className="mt-5 rounded-xl bg-bad-wash p-4 text-bad">
            <p className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="size-6" />Alterado</p>
            <p className="mt-1">El documento existe pero su contenido no coincide con la firma.</p>
          </div>
        ) : (
          <div className="mt-5 rounded-xl bg-cal-2 p-4 text-ink-2">
            <p className="flex items-center gap-2 text-lg font-bold"><ShieldQuestion className="size-6" />No encontrado</p>
            <p className="mt-1">Revisa el código. Si el documento es de otro dispositivo, verifícalo donde se emitió (o con el servidor cuando esté conectado).</p>
          </div>
        ))}
      </Panel>
    </div>
  );
  return standalone ? <div className="min-h-dvh px-4 pt-10"><div className="facade-band fixed inset-x-0 top-0 h-2" />{body}</div> : body;
}
