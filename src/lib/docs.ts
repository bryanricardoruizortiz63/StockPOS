import { db } from './db';
import { canonical, sha256, signHash, verifyHash } from './crypto';
import { appUrl, uid } from './util';
import type { DocKind, SignedDoc } from './types';

export async function createSignedDoc(
  kind: DocKind, title: string, payload: unknown,
  meta: { storeId?: string; employeeId?: string } = {},
): Promise<SignedDoc> {
  const id = uid();
  const createdAt = Date.now();
  const hash = await sha256(canonical({ id, kind, title, payload, createdAt, ...meta }));
  const signature = await signHash(hash);
  const doc: SignedDoc = { id, kind, title, payload, hash, signature, createdAt, ...meta };
  await db.docs.add(doc);
  return doc;
}

/** Código humano impreso en cada documento: 8 del id + 8 del hash. */
export const verificationCode = (d: Pick<SignedDoc, 'id' | 'hash'>) =>
  `${d.id.slice(0, 8)}-${d.hash.slice(0, 8)}`.toUpperCase();

export const verificationUrl = (d: Pick<SignedDoc, 'id' | 'hash'>) =>
  appUrl(`verificar?c=${verificationCode(d)}`);

export type VerifyResult =
  | { status: 'valid'; doc: SignedDoc }
  | { status: 'tampered'; doc: SignedDoc }
  | { status: 'not-found' };

export async function verifyDocument(code: string): Promise<VerifyResult> {
  const clean = code.trim().toLowerCase();
  const [idPart, hashPart] = clean.split('-');
  if (!idPart || !hashPart) return { status: 'not-found' };
  const doc = await db.docs.filter((d) => d.id.startsWith(idPart) && d.hash.startsWith(hashPart)).first();
  if (!doc) return { status: 'not-found' };
  return (await checkDoc(doc)) ? { status: 'valid', doc } : { status: 'tampered', doc };
}

export async function checkDoc(doc: SignedDoc): Promise<boolean> {
  const { id, kind, title, payload, createdAt, storeId, employeeId } = doc;
  const hash = await sha256(canonical({ id, kind, title, payload, createdAt, storeId, employeeId }));
  return hash === doc.hash && (await verifyHash(hash, doc.signature));
}
