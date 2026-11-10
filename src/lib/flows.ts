import { db } from './db';
import { createSignedDoc } from './docs';
import { buildPdf, buildXlsx, type Block } from './exporters';
import { lowStock } from './inventory';
import { money } from './money';
import { notify, queueMail } from './notify';
import { draftPayStub, saveIssuedStub, type PayStubDraft } from './payroll';
import { punchesBetween } from './timeclock';
import { fmtDate, fmtDateTime, fmtTime, uid } from './util';
import type { CertRequest, PayStub, Punch, Shift, SignedDoc, Store, User } from './types';

const METHOD: Record<string, string> = { cash: 'Efectivo', athmovil: 'ATH Móvil', card: 'Tarjeta' };
export const methodLabel = (m: string) => METHOD[m] ?? m;
const PUNCH_METHOD: Record<string, string> = { nfc: 'Sticker NFC', qr: 'QR del local', kiosk: 'QR dinámico', manual: 'Manual (admin)' };
export const punchMethodLabel = (m: string) => PUNCH_METHOD[m] ?? m;

async function admins() {
  return (await db.users.where('role').equals('admin').toArray()).filter((u) => u.active);
}
async function userMap() {
  return new Map((await db.users.toArray()).map((u) => [u.id, u]));
}

// ---------------- Turnos ----------------

export async function currentShift(employeeId: string, storeId: string) {
  return db.shifts.where('employeeId').equals(employeeId).filter((s) => !s.closedAt && s.storeId === storeId).first();
}

export async function openShift(user: User, store: Store, openingCash: number): Promise<Shift> {
  if (await currentShift(user.id, store.id)) throw new Error('Ya tienes un turno abierto en esta tienda.');
  if (!Number.isFinite(openingCash) || openingCash < 0) throw new Error('Indica el fondo de caja inicial.');
  const s: Shift = { id: uid(), storeId: store.id, employeeId: user.id, openedAt: Date.now(), openingCash };
  await db.shifts.add(s);
  return s;
}

export async function shiftTotals(shift: Shift) {
  const sales = (await db.sales.where('shiftId').equals(shift.id).toArray()).filter((s) => s.status === 'completed');
  const sum = (m: string) => sales.filter((s) => s.method === m).reduce((a, s) => a + s.total, 0);
  const cashSales = sum('cash');
  return {
    sales, cashSales, cardSales: sum('card'), athSales: sum('athmovil'),
    ivu: sales.reduce((a, s) => a + s.ivu, 0),
    expectedCash: shift.openingCash + cashSales,
  };
}

export function shiftReportBlocks(shift: Shift, emp: User | undefined, t: Awaited<ReturnType<typeof shiftTotals>>, low: { description: string; quantity: number }[]): Block[] {
  return [
    { type: 'kv', heading: 'Turno', rows: [
      ['Empleado', emp?.name ?? '—'],
      ['Abrió', fmtDateTime(shift.openedAt)],
      ['Cerró', shift.closedAt ? fmtDateTime(shift.closedAt) : 'Abierto'],
      ['Ventas', String(t.sales.length)],
    ] },
    { type: 'kv', heading: 'Cuadre de caja', rows: [
      ['Fondo inicial', money(shift.openingCash)],
      ['Ventas en efectivo', money(t.cashSales)],
      ['Efectivo esperado', money(t.expectedCash)],
      ['Efectivo contado', shift.countedCash != null ? money(shift.countedCash) : '—'],
      ['Diferencia', shift.difference != null ? (shift.difference === 0 ? 'Cuadra exacto' : `${shift.difference > 0 ? 'Sobrante' : 'Faltante'} ${money(Math.abs(shift.difference))}`) : '—'],
      ['Tarjetas (automático)', money(t.cardSales)],
      ['ATH Móvil (automático)', money(t.athSales)],
      ['IVU cobrado', money(t.ivu)],
      ...(shift.notes ? [['Notas', shift.notes] as [string, string]] : []),
    ] },
    { type: 'table', heading: 'Transacciones', head: ['Hora', 'Artículos', 'Método', 'Confirmación', 'Total'],
      body: t.sales.map((s) => [fmtTime(s.createdAt), String(s.items.reduce((a, i) => a + i.qty, 0)), methodLabel(s.method), s.paymentRef ?? '—', money(s.total)]),
      foot: ['', '', '', 'Total', money(t.sales.reduce((a, s) => a + s.total, 0))] },
    low.length
      ? { type: 'table', heading: 'Inventario bajo al cerrar', head: ['Producto', 'Quedan'], body: low.map((p) => [p.description, String(p.quantity)]) }
      : { type: 'text', heading: 'Inventario bajo al cerrar', text: 'Ningún producto bajo el umbral.' },
  ];
}

export async function closeShift(shift: Shift, store: Store, countedCash: number, notes?: string) {
  if (shift.closedAt) throw new Error('Este turno ya se cerró.');
  if (!Number.isFinite(countedCash) || countedCash < 0) throw new Error('Escribe cuánto efectivo contaste.');
  const t = await shiftTotals(shift);
  const closed: Shift = {
    ...shift, closedAt: Date.now(), countedCash, expectedCash: t.expectedCash,
    cashSales: t.cashSales, cardSales: t.cardSales, athSales: t.athSales, salesCount: t.sales.length,
    difference: countedCash - t.expectedCash, notes: notes?.trim() || undefined,
  };
  const emp = await db.users.get(shift.employeeId);
  const low = (await lowStock(store)).map((p) => ({ description: p.description, quantity: p.quantity }));
  const doc = await createSignedDoc('shift-report', `Cierre de turno · ${emp?.name ?? ''} · ${fmtDate(closed.closedAt!)}`, {
    shift: closed, sales: t.sales.map((s) => ({ id: s.id, total: s.total, method: s.method, ref: s.paymentRef, at: s.createdAt })), low,
  }, { storeId: store.id, employeeId: shift.employeeId });
  closed.reportDocId = doc.id;
  await db.shifts.put(closed);

  const pdf = await buildPdf({ title: 'Reporte de cierre de turno', subtitle: `${emp?.name} · ${fmtDate(closed.closedAt!)}`, storeName: store.name, blocks: shiftReportBlocks(closed, emp, t, low), doc });
  const diffTxt = closed.difference === 0 ? 'cuadró exacto' : `${closed.difference! > 0 ? 'sobrante' : 'faltante'} de ${money(Math.abs(closed.difference!))}`;
  for (const a of await admins()) {
    await queueMail({
      to: a.email, subject: `Cierre de turno: ${emp?.name} — ${store.name}`,
      body: `${emp?.name} cerró su turno en ${store.name}.\nVentas: ${t.sales.length} · Total ${money(t.cashSales + t.cardSales + t.athSales)}\nEfectivo: ${diffTxt}.\nProductos bajos: ${low.length}.\nEl reporte firmado va adjunto.`,
      attachmentName: `cierre-${closed.id.slice(0, 8)}.pdf`, attachment: pdf, docId: doc.id,
    });
  }
  await notify({ forRole: 'admin', storeId: store.id, title: `Cierre de turno: ${emp?.name}`, body: `Efectivo ${diffTxt}. ${t.sales.length} ventas. ${low.length} productos bajos.`, link: `/turnos/${closed.id}` });
  return { shift: closed, doc, pdf };
}

// ---------------- Nómina ----------------

export function payStubBlocks(stub: Pick<PayStub, 'periodStart' | 'periodEnd' | 'regularHours' | 'overtimeHours' | 'hourlyRate' | 'overtimeRate' | 'regularPay' | 'overtimePay' | 'bonuses' | 'gross' | 'deductions' | 'net'>, emp: User): Block[] {
  return [
    { type: 'kv', heading: 'Empleado', rows: [['Nombre', emp.name], ['Puesto', emp.position ?? '—'], ['Periodo', `${fmtDate(stub.periodStart)} – ${fmtDate(stub.periodEnd)}`]] },
    { type: 'table', heading: 'Ingresos', head: ['Concepto', 'Horas', 'Tarifa', 'Monto'], body: [
      ['Horas regulares', stub.regularHours.toFixed(2), money(stub.hourlyRate), money(stub.regularPay)],
      ['Horas extra', stub.overtimeHours.toFixed(2), money(stub.overtimeRate), money(stub.overtimePay)],
      ...stub.bonuses.map((b) => [b.label, '', '', money(b.amount)]),
    ], foot: ['Bruto', '', '', money(stub.gross)] },
    { type: 'table', heading: 'Deducciones', head: ['Concepto', 'Monto'], body: stub.deductions.length ? stub.deductions.map((d) => [d.label, money(d.amount)]) : [['Sin deducciones', money(0)]],
      foot: ['Total deducciones', money(stub.deductions.reduce((s, d) => s + d.amount, 0))] },
    { type: 'kv', heading: 'Pago neto', rows: [['Neto a pagar', money(stub.net)]] },
  ];
}

export async function issuePayroll(drafts: PayStubDraft[], store: Store) {
  const users = await userMap();
  const issued: PayStub[] = [];
  for (const d of drafts) {
    const emp = users.get(d.employeeId);
    if (!emp) continue;
    const { bonusIds: _b, openPunches: _o, ...payload } = d;
    void _b; void _o;
    const doc = await createSignedDoc('pay-stub', `Talonario · ${emp.name} · ${fmtDate(d.periodStart)} – ${fmtDate(d.periodEnd)}`, payload, { storeId: store.id, employeeId: emp.id });
    const stub = await saveIssuedStub(d, doc.id);
    issued.push(stub);
    const pdf = await buildPdf({ title: 'Talonario de pago', subtitle: `${emp.name} · ${fmtDate(d.periodStart)} – ${fmtDate(d.periodEnd)}`, storeName: store.name, blocks: payStubBlocks(stub, emp), doc });
    await queueMail({
      to: emp.email, subject: `Tu talonario de pago — ${fmtDate(d.periodEnd)}`,
      body: `Hola ${emp.name.split(' ')[0]}:\n\nAdjunto tu talonario del ${fmtDate(d.periodStart)} al ${fmtDate(d.periodEnd)}. Neto: ${money(stub.net)}.\nTambién lo puedes ver y descargar en StockPOS > Mis documentos.\n\n${store.name}`,
      attachmentName: `talonario-${d.periodEnd}.pdf`, attachment: pdf, docId: doc.id,
    });
    await notify({ forRole: 'employee', userId: emp.id, title: 'Nuevo talonario', body: `Periodo ${fmtDate(d.periodStart)} – ${fmtDate(d.periodEnd)} · Neto ${money(stub.net)}`, link: '/documentos' });
  }
  return issued;
}

export async function payStubPdf(stub: PayStub) {
  const [emp, doc, store] = await Promise.all([db.users.get(stub.employeeId), db.docs.get(stub.docId), db.stores.get(stub.storeId)]);
  if (!emp) throw new Error('Empleado no encontrado');
  return buildPdf({ title: 'Talonario de pago', subtitle: `${emp.name} · ${fmtDate(stub.periodStart)} – ${fmtDate(stub.periodEnd)}`, storeName: store?.name, blocks: payStubBlocks(stub, emp), doc });
}

export { draftPayStub };

// ---------------- Certificación de empleo ----------------

function certText(emp: User, store: Store, req: CertRequest, annual?: number) {
  const since = emp.hireDate ? `desde el ${fmtDate(emp.hireDate, { dateStyle: 'long' })}` : '';
  let t = `Por medio de la presente certificamos que ${emp.name} trabaja en ${store.name}${emp.position ? ` como ${emp.position}` : ''} ${since}, y se encuentra activo(a) a la fecha de esta carta.`;
  if (req.includeSalary && emp.hourlyRate) {
    t += ` Devenga un salario de ${money(emp.hourlyRate)} por hora, con un horario regular de ${emp.weeklyHours} horas semanales`;
    t += annual ? ` (aproximadamente ${money(annual)} anuales).` : '.';
  }
  t += `\n\nEsta certificación se expide a solicitud del empleado${req.purpose ? ` para fines de: ${req.purpose}` : ''}.`;
  return t;
}

export async function approveCertification(req: CertRequest, admin: User) {
  const [emp, store] = await Promise.all([db.users.get(req.employeeId), db.stores.get(req.storeId)]);
  if (!emp || !store) throw new Error('Datos incompletos');
  const annual = emp.hourlyRate * emp.weeklyHours * 52;
  const body = certText(emp, store, req, annual);
  const doc = await createSignedDoc('certification', `Certificación de empleo · ${emp.name}`, { requestId: req.id, body, addressee: req.addressee, approvedBy: admin.id }, { storeId: store.id, employeeId: emp.id });
  await db.certRequests.update(req.id, { status: 'approved', decidedAt: Date.now(), docId: doc.id });
  const pdf = await certificationPdf(doc);
  await queueMail({
    to: emp.email, subject: 'Tu certificación de empleo',
    body: `Hola ${emp.name.split(' ')[0]}:\n\nTu solicitud fue aprobada. Adjunto la certificación de empleo firmada.\n\n${store.name}`,
    attachmentName: `certificacion-${emp.name.replace(/\s+/g, '-').toLowerCase()}.pdf`, attachment: pdf, docId: doc.id,
  });
  await notify({ forRole: 'employee', userId: emp.id, title: 'Certificación aprobada', body: 'Te la enviamos por email y está en Mis documentos.', link: '/documentos' });
  return doc;
}

export async function certificationPdf(doc: SignedDoc) {
  const p = doc.payload as { body: string; addressee: string; approvedBy: string };
  const [store, admin] = await Promise.all([doc.storeId ? db.stores.get(doc.storeId) : undefined, db.users.get(p.approvedBy)]);
  return buildPdf({
    title: 'Certificación de empleo', subtitle: fmtDate(doc.createdAt, { dateStyle: 'long' }), storeName: store?.name,
    blocks: [{ type: 'text', text: `${p.addressee || 'A quien pueda interesar'}:` }, { type: 'text', text: p.body }],
    signatureLines: [`${admin?.name ?? 'Administrador'} · ${store?.name ?? ''}`], doc,
  });
}

export async function denyCertification(req: CertRequest, note: string) {
  await db.certRequests.update(req.id, { status: 'denied', decidedAt: Date.now(), decisionNote: note });
  await notify({ forRole: 'employee', userId: req.employeeId, title: 'Certificación no aprobada', body: note || 'Habla con tu administrador.', link: '/documentos' });
}

// ---------------- Ponches: exportes y archivo ----------------

export function punchRows(punches: Punch[], users: Map<string, User>, stores: Map<string, Store>) {
  return punches.map((p) => [
    p.seq, users.get(p.employeeId)?.name ?? p.employeeId, stores.get(p.storeId)?.name ?? '', p.type === 'in' ? 'Entrada' : 'Salida',
    fmtDateTime(p.at), punchMethodLabel(p.method), p.distanceM != null ? `${p.distanceM} m` : '—', p.note ?? '', p.hash.slice(0, 16),
  ]);
}

export async function exportPunches(from: number, to: number, title: string, employeeId?: string, kind: 'punch-export' | 'punch-archive' = 'punch-export') {
  const punches = await punchesBetween(from, to, employeeId);
  const [users, stores] = [await userMap(), new Map((await db.stores.toArray()).map((s) => [s.id, s]))];
  const doc = await createSignedDoc(kind, title, {
    from, to, employeeId, count: punches.length,
    punches: punches.map((p) => ({ id: p.id, seq: p.seq, hash: p.hash })),
    chainTip: punches.at(-1)?.hash,
  }, { employeeId });
  const head = ['#', 'Empleado', 'Tienda', 'Tipo', 'Fecha y hora', 'Método', 'Distancia', 'Nota', 'Hash'];
  const rows = punchRows(punches, users, stores);
  const [pdf, xlsx] = await Promise.all([
    buildPdf({ title, subtitle: `${fmtDate(from)} – ${fmtDate(to)} · ${punches.length} ponches`, blocks: [{ type: 'table', head: head.slice(0, 8), body: rows.map((r) => r.slice(0, 8) as (string | number)[]) }], doc }),
    buildXlsx([{ name: 'Ponches', head, rows }], doc),
  ]);
  return { doc, pdf, xlsx, count: punches.length };
}
