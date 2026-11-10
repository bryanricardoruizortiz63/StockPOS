import { getSetting, setSetting } from './db';

const enc = new TextEncoder();

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function b64(buf: ArrayBuffer | Uint8Array): string {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s);
}
export function fromB64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const b64url = (buf: ArrayBuffer | Uint8Array) => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = (s: string) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

/** JSON canónico: llaves ordenadas, para que el hash sea estable. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const obj = value as Record<string, unknown>;
  return '{' + Object.keys(obj).filter((k) => obj[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}

export async function sha256(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}

export function randomSalt(bytes = 16) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PBKDF2-SHA256, 210k iteraciones (OWASP). */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(salt), iterations: 210_000 }, key, 256);
  return b64(bits);
}

export async function verifySecret(secret: string, salt: string, expected?: string) {
  if (!expected) return false;
  const got = await hashSecret(secret, salt);
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---------- Llave de firma del sistema (ECDSA P-256) ----------
// Local-first: la llave privada vive en IndexedDB, no exportable a la UI.
// Con Supabase, la firma se mueve a una Edge Function y aquí solo queda la pública.

interface KeyPairRecord { publicJwk: JsonWebKey; privateJwk: JsonWebKey; createdAt: number }

let cached: { pub: CryptoKey; priv: CryptoKey; publicJwk: JsonWebKey } | null = null;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGN = { name: 'ECDSA', hash: 'SHA-256' } as const;

export async function systemKeys() {
  if (cached) return cached;
  let rec = await getSetting<KeyPairRecord>('signingKey');
  if (!rec) {
    const kp = await crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
    rec = {
      publicJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
      privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
      createdAt: Date.now(),
    };
    await setSetting('signingKey', rec);
  }
  const pub = await crypto.subtle.importKey('jwk', rec.publicJwk, ALG, true, ['verify']);
  const priv = await crypto.subtle.importKey('jwk', rec.privateJwk, ALG, false, ['sign']);
  cached = { pub, priv, publicJwk: rec.publicJwk };
  return cached;
}
export function resetKeyCache() { cached = null; }

export async function signHash(hashHex: string): Promise<string> {
  const { priv } = await systemKeys();
  return b64(await crypto.subtle.sign(SIGN, priv, enc.encode(hashHex)));
}
export async function verifyHash(hashHex: string, signature: string): Promise<boolean> {
  const { pub } = await systemKeys();
  try {
    return await crypto.subtle.verify(SIGN, pub, fromB64(signature), enc.encode(hashHex));
  } catch {
    return false;
  }
}

/** Huella corta de la llave pública, impresa en los documentos. */
export async function keyFingerprint() {
  const { publicJwk } = await systemKeys();
  return (await sha256(canonical({ crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }))).slice(0, 16);
}
