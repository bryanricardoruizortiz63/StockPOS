import { keyFingerprint } from './crypto';
import { verificationCode, verificationUrl } from './docs';
import { fmtDateTime } from './util';
import type { SignedDoc } from './types';

export type Block =
  | { type: 'kv'; heading?: string; rows: [string, string][] }
  | { type: 'table'; heading?: string; head: string[]; body: (string | number)[][]; foot?: (string | number)[] }
  | { type: 'text'; heading?: string; text: string };

export interface PdfSpec {
  title: string;
  subtitle?: string;
  storeName?: string;
  blocks: Block[];
  doc?: SignedDoc;
  signatureLines?: string[];
}

const INK: [number, number, number] = [29, 36, 51];
const SLATE: [number, number, number] = [43, 58, 82];

export async function buildPdf(spec: PdfSpec): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }, QR] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('qrcode'),
  ]);
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const W = pdf.internal.pageSize.getWidth();
  const M = 48;

  pdf.setFillColor(...SLATE);
  pdf.rect(0, 0, W, 64, 'F');
  pdf.setTextColor(246, 244, 239);
  pdf.setFont('helvetica', 'bold').setFontSize(16).text('StockPOS', M, 40);
  if (spec.storeName) pdf.setFont('helvetica', 'normal').setFontSize(11).text(spec.storeName, W - M, 40, { align: 'right' });

  pdf.setTextColor(...INK);
  pdf.setFont('helvetica', 'bold').setFontSize(18).text(spec.title, M, 104);
  let y = 104;
  if (spec.subtitle) { y += 20; pdf.setFont('helvetica', 'normal').setFontSize(11).text(spec.subtitle, M, y); }
  y += 24;

  for (const b of spec.blocks) {
    if (b.heading) {
      if (y > 700) { pdf.addPage(); y = M; }
      pdf.setFont('helvetica', 'bold').setFontSize(12).setTextColor(...SLATE).text(b.heading, M, y);
      pdf.setTextColor(...INK);
      y += 8;
    }
    if (b.type === 'text') {
      pdf.setFont('helvetica', 'normal').setFontSize(11);
      const lines = pdf.splitTextToSize(b.text, W - 2 * M);
      for (const line of lines) {
        if (y > 720) { pdf.addPage(); y = M; }
        y += 16;
        pdf.text(line, M, y);
      }
      y += 18;
      continue;
    }
    const isKv = b.type === 'kv';
    autoTable(pdf, {
      startY: y + 4,
      margin: { left: M, right: M },
      head: isKv ? undefined : [b.head],
      body: isKv ? b.rows : b.body.map((r) => r.map(String)),
      foot: !isKv && b.foot ? [b.foot.map(String)] : undefined,
      theme: isKv ? 'plain' : 'striped',
      styles: { fontSize: 10, cellPadding: 5, textColor: INK },
      headStyles: { fillColor: SLATE, textColor: [246, 244, 239] },
      footStyles: { fillColor: [232, 229, 221], textColor: INK, fontStyle: 'bold' },
      columnStyles: isKv ? { 0: { fontStyle: 'bold', cellWidth: 190 } } : undefined,
    });
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  if (spec.signatureLines?.length) {
    if (y > 640) { pdf.addPage(); y = M; }
    y += 40;
    for (const s of spec.signatureLines) {
      pdf.setDrawColor(...INK).line(M, y, M + 220, y);
      pdf.setFont('helvetica', 'normal').setFontSize(10).text(s, M, y + 14);
      y += 56;
    }
  }

  if (spec.doc) {
    const code = verificationCode(spec.doc);
    const qr = await QR.toDataURL(verificationUrl(spec.doc), { margin: 0, width: 160 });
    const fp = await keyFingerprint();
    const pages = pdf.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      pdf.setPage(i);
      const H = pdf.internal.pageSize.getHeight();
      pdf.setDrawColor(200, 196, 186).line(M, H - 78, W - M, H - 78);
      pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(90, 98, 112);
      pdf.text(`Documento firmado digitalmente por StockPOS · ${fmtDateTime(spec.doc.createdAt)}`, M, H - 62);
      pdf.text(`Código de verificación: ${code}   ·   Llave: ${fp}`, M, H - 50);
      pdf.text(`SHA-256: ${spec.doc.hash}`, M, H - 38);
      pdf.text(`Verifica en ${location.origin}/verificar  ·  Página ${i} de ${pages}`, M, H - 26);
      pdf.addImage(qr, 'PNG', W - M - 52, H - 72, 52, 52);
    }
  }
  return pdf.output('blob');
}

export interface Sheet { name: string; head: string[]; rows: (string | number | null)[][] }

export async function buildXlsx(sheets: Sheet[], doc?: SignedDoc): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'StockPOS';
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31));
    ws.addRow(s.head).font = { bold: true, color: { argb: 'FFF6F4EF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B3A52' } };
    for (const r of s.rows) ws.addRow(r);
    ws.columns.forEach((c) => { c.width = Math.min(40, Math.max(12, (c.header?.toString().length ?? 10) + 4)); });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  if (doc) {
    const ws = wb.addWorksheet('Verificación');
    ws.addRows([
      ['Documento', doc.title],
      ['Código de verificación', verificationCode(doc)],
      ['Verificar en', verificationUrl(doc)],
      ['SHA-256', doc.hash],
      ['Firma (ECDSA P-256)', doc.signature],
      ['Llave', await keyFingerprint()],
      ['Emitido', fmtDateTime(doc.createdAt)],
    ]);
    ws.getColumn(1).font = { bold: true };
    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 90;
  }
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
