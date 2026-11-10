import { db } from './db';
import { uid } from './util';
import type { Notice, OutboxMail } from './types';

export async function notify(n: Omit<Notice, 'id' | 'read' | 'createdAt'>) {
  await db.notices.add({ ...n, id: uid(), read: false, createdAt: Date.now() });
}

/**
 * Cola de correo. Sin backend los correos quedan en la bandeja de salida,
 * listos para descargar o reenviar. Con Supabase configurado se envían con la
 * Edge Function `send-email` (ver supabase/functions/send-email).
 */
export async function queueMail(m: Omit<OutboxMail, 'id' | 'status' | 'createdAt'>) {
  const mail: OutboxMail = { ...m, id: uid(), status: 'queued', createdAt: Date.now() };
  await db.outbox.add(mail);
  void trySend(mail);
  return mail;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const emailBackendConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

async function blobToB64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function trySend(mail: OutboxMail) {
  if (!emailBackendConfigured()) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_KEY}`, 'Idempotency-Key': mail.id },
      body: JSON.stringify({
        to: mail.to, subject: mail.subject, text: mail.body,
        attachment: mail.attachment ? { filename: mail.attachmentName, content: await blobToB64(mail.attachment) } : undefined,
      }),
    });
    await db.outbox.update(mail.id, { status: res.ok ? 'sent' : 'failed' });
  } catch {
    await db.outbox.update(mail.id, { status: 'failed' });
  }
}
