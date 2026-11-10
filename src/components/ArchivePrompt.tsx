import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive } from 'lucide-react';
import { exportPunches } from '../lib/flows';
import { markArchived, yearsPendingArchive } from '../lib/timeclock';
import { downloadBlob } from '../lib/util';
import { Banner, Button } from './ui';
import { errMsg, useToast } from './toast';

/** Cada año, pide al administrador guardar los ponches del año anterior (PDF + Excel firmados). */
export function ArchivePrompt() {
  const years = useLiveQuery(yearsPendingArchive, []) ?? [];
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!years.length) return null;
  const y = years[0];
  async function archive() {
    setBusy(true);
    try {
      const from = new Date(`${y}-01-01T00:00:00-04:00`).getTime();
      const to = new Date(`${y}-12-31T23:59:59.999-04:00`).getTime();
      const r = await exportPunches(from, to, `Archivo anual de ponches ${y}`, undefined, 'punch-archive');
      downloadBlob(r.pdf, `ponches-${y}.pdf`);
      downloadBlob(r.xlsx, `ponches-${y}.xlsx`);
      await markArchived(y);
      toast(`Ponches de ${y} guardados (${r.count})`);
    } catch (e) { toast(errMsg(e), 'bad'); } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
      <Banner tone="warn" icon={<Archive className="size-5 shrink-0" />} action={<Button size="sm" busy={busy} onClick={archive}>Descargar y guardar</Button>}>
        Guarda los ponches de {y} como respaldo. Se descargan en PDF y Excel, firmados y verificables.
      </Banner>
    </div>
  );
}
