import { db, getSetting, setSetting } from './db';
import { canonical, sha256, signHash, verifyHash } from './crypto';
import { currentTotp, verifyTotp } from './totp';
import { uid } from './util';
import type { Punch, PunchMethod, Store } from './types';

/**
 * Ponches con evidencia:
 * 1. Prueba de presencia: sticker NFC (o QR impreso) con un token de la tienda,
 *    o QR dinámico que cambia cada 30 s en la tablet de la tienda (no se puede fotografiar y reusar).
 * 2. Geocerca opcional: el teléfono debe estar dentro del radio de la tienda.
 * 3. Cadena de hashes: cada ponche incluye el hash del anterior y va firmado (ECDSA).
 *    Alterar o borrar un ponche rompe la cadena y la verificación lo detecta.
 */

export const KIOSK_PERIOD = 30;

export async function stickerToken(store: Store) {
  return (await sha256(store.punchSecret + ':sticker')).slice(0, 32);
}
export async function stickerPayload(store: Store) {
  return `stockpos:tag:${store.id}:${await stickerToken(store)}`;
}
export function kioskPayload(store: Store) {
  return `stockpos:kiosk:${store.id}:${currentTotp(store.punchSecret, KIOSK_PERIOD)}`;
}

export async function validatePresence(payload: string, store: Store): Promise<'nfc-tag' | 'kiosk'> {
  const [scheme, kind, storeId, token] = payload.trim().split(':');
  if (scheme !== 'stockpos' || !kind || !storeId || !token) throw new Error('Este código no es de StockPOS.');
  if (storeId !== store.id) throw new Error('Este código pertenece a otra tienda.');
  if (kind === 'tag') {
    if (token !== (await stickerToken(store))) throw new Error('Sticker no válido o reemplazado.');
    return 'nfc-tag';
  }
  if (kind === 'kiosk') {
    if (!verifyTotp(store.punchSecret, token, 1, KIOSK_PERIOD)) throw new Error('El código QR venció. Escanéalo de nuevo.');
    return 'kiosk';
  }
  throw new Error('Código desconocido.');
}

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function getLocation(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Este dispositivo no da ubicación.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => reject(new Error('Permite el acceso a la ubicación para ponchar.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function checkGeofence(store: Store, loc: { lat: number; lng: number; accuracy: number }) {
  if (!store.geofence) return undefined;
  const d = distanceM(store.geofence, loc);
  // Se tolera la imprecisión del GPS hasta 50 m extra.
  if (d - Math.min(loc.accuracy, 50) > store.geofence.radiusM) {
    throw new Error(`Estás a ${Math.round(d)} m de la tienda. Debes estar en el local para ponchar.`);
  }
  return Math.round(d);
}

export async function lastPunch(employeeId: string) {
  return db.punches.where('[employeeId+at]').between([employeeId, -Infinity], [employeeId, Infinity]).last();
}

const GENESIS = '0'.repeat(64);

function punchBody(p: Omit<Punch, 'hash' | 'signature'>) {
  const { id, seq, storeId, employeeId, type, at, method, location, distanceM, note, prevHash } = p;
  return canonical({ id, seq, storeId, employeeId, type, at, method, location, distanceM, note, prevHash });
}

export async function recordPunch(input: {
  storeId: string; employeeId: string; method: PunchMethod;
  location?: Punch['location']; distanceM?: number; note?: string; type?: 'in' | 'out'; at?: number;
}): Promise<Punch> {
  // IndexedDB cierra la transacción si se espera a WebCrypto dentro de ella, así que
  // se calcula el hash afuera y se inserta con control optimista sobre la punta de la cadena.
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await lastPunch(input.employeeId);
    const type = input.type ?? (last?.type === 'in' ? 'out' : 'in');
    const tip = await db.punches.orderBy('seq').last();
    const draft = {
      id: uid(), seq: (tip?.seq ?? 0) + 1, storeId: input.storeId, employeeId: input.employeeId,
      type, at: input.at ?? Date.now(), method: input.method, location: input.location,
      distanceM: input.distanceM, note: input.note, prevHash: tip?.hash ?? GENESIS,
    };
    const hash = await sha256(punchBody(draft));
    const punch: Punch = { ...draft, hash, signature: await signHash(hash) };
    try {
      await db.transaction('rw', db.punches, async () => {
        const now = await db.punches.orderBy('seq').last();
        if ((now?.hash ?? GENESIS) !== punch.prevHash) throw new Error('retry');
        await db.punches.add(punch); // seq es único: dos ponches simultáneos no pueden compartirlo
      });
      return punch;
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error('No se pudo registrar el ponche.');
}

export interface ChainReport { ok: boolean; count: number; brokenAt?: number; tip?: string }

export async function verifyChain(): Promise<ChainReport> {
  const all = await db.punches.orderBy('seq').toArray();
  let prev = GENESIS;
  for (let i = 0; i < all.length; i++) {
    const p = all[i];
    if (p.seq !== i + 1 || p.prevHash !== prev) return { ok: false, count: all.length, brokenAt: p.seq };
    const h = await sha256(punchBody(p));
    if (h !== p.hash || !(await verifyHash(h, p.signature))) return { ok: false, count: all.length, brokenAt: p.seq };
    prev = p.hash;
  }
  return { ok: true, count: all.length, tip: prev };
}

// ---------- Archivo anual ----------
export async function archivedYears(): Promise<number[]> {
  return (await getSetting<number[]>('punchArchivedYears')) ?? [];
}
export async function markArchived(year: number) {
  const ys = new Set(await archivedYears());
  ys.add(year);
  await setSetting('punchArchivedYears', [...ys].sort());
}
/** Años anteriores al actual con ponches que aún no se han archivado. */
export async function yearsPendingArchive(): Promise<number[]> {
  const done = new Set(await archivedYears());
  const thisYear = new Date().getFullYear();
  const first = await db.punches.orderBy('at').first();
  if (!first) return [];
  const out: number[] = [];
  for (let y = new Date(first.at).getFullYear(); y < thisYear; y++) if (!done.has(y)) out.push(y);
  return out;
}

export async function punchesBetween(from: number, to: number, employeeId?: string) {
  const rows = await db.punches.where('at').between(from, to, true, true).toArray();
  return (employeeId ? rows.filter((p) => p.employeeId === employeeId) : rows).sort((a, b) => a.at - b.at);
}
