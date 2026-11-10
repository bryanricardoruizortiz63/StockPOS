import { db, getSetting, setSetting } from './db';
import { hashSecret, randomSalt, verifySecret } from './crypto';
import { verifyTotp } from './totp';
import { verifyWithPasskey } from './webauthn';
import { dayKey, uid } from './util';
import type { Role, User } from './types';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

interface Attempts { count: number; lockedUntil?: number }

async function checkLock(email: string) {
  const a = await getSetting<Attempts>('attempts:' + email);
  if (a?.lockedUntil && a.lockedUntil > Date.now()) {
    const min = Math.ceil((a.lockedUntil - Date.now()) / 60000);
    throw new Error(`Demasiados intentos. Intenta de nuevo en ${min} min.`);
  }
}
async function fail(email: string) {
  const a = (await getSetting<Attempts>('attempts:' + email)) ?? { count: 0 };
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) { a.lockedUntil = Date.now() + LOCK_MS; a.count = 0; }
  await setSetting('attempts:' + email, a);
}
async function clear(email: string) {
  await db.settings.delete('attempts:' + email);
}

export const normEmail = (e: string) => e.trim().toLowerCase();

export async function findUser(email: string) {
  return db.users.where('email').equals(normEmail(email)).first();
}

/** Contraseña (admin o empleado) o PIN (empleado). */
export async function loginWithSecret(email: string, secret: string): Promise<User> {
  const e = normEmail(email);
  await checkLock(e);
  const user = await findUser(e);
  const generic = new Error('Correo o contraseña incorrectos.');
  if (!user || !user.active) { await fail(e); throw generic; }
  const ok = (await verifySecret(secret, user.salt, user.passwordHash))
    || (user.role === 'employee' && /^\d{4,8}$/.test(secret) && (await verifySecret(secret, user.salt, user.pinHash)));
  if (!ok) { await fail(e); throw generic; }
  await clear(e);
  return user;
}

export async function loginWithPasskey(email: string): Promise<User> {
  const e = normEmail(email);
  await checkLock(e);
  const user = await findUser(e);
  if (!user || !user.active || !user.passkeys.length) throw new Error('No hay Face ID / huella registrada para este correo.');
  const ok = await verifyWithPasskey(user.passkeys);
  if (!ok) { await fail(e); throw new Error('No se pudo verificar la biometría.'); }
  await clear(e);
  // Passkey con verificación de usuario = posesión + biometría: cuenta como MFA del día.
  await db.users.update(user.id, { mfaVerifiedOn: dayKey() });
  return (await db.users.get(user.id))!;
}

export function needsDailyMfa(user: User): boolean {
  return user.role === 'admin' && user.mfaVerifiedOn !== dayKey();
}

export async function completeMfaTotp(user: User, code: string) {
  if (!user.totpSecret) throw new Error('Microsoft Authenticator no está configurado.');
  if (!verifyTotp(user.totpSecret, code)) throw new Error('Código incorrecto o vencido.');
  await db.users.update(user.id, { mfaVerifiedOn: dayKey() });
}

export async function completeMfaPasskey(user: User) {
  if (!(await verifyWithPasskey(user.passkeys))) throw new Error('No se pudo verificar la biometría.');
  await db.users.update(user.id, { mfaVerifiedOn: dayKey() });
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Usa letras y números.';
  return null;
}

export interface NewUserInput {
  name: string;
  email: string;
  role: Role;
  storeIds: string[];
  password?: string;
  pin?: string;
  position?: string;
  hireDate?: string;
  hourlyRate?: number;
  weeklyHours?: number;
}

export async function createUser(input: NewUserInput): Promise<User> {
  const email = normEmail(input.email);
  if (await findUser(email)) throw new Error('Ya existe un usuario con ese correo.');
  const salt = randomSalt();
  const builtinDeductions = (await db.deductions.toArray()).filter((d) => d.builtin && d.active).map((d) => d.id);
  const user: User = {
    id: uid(),
    name: input.name.trim(),
    email,
    role: input.role,
    storeIds: input.storeIds,
    position: input.position,
    hireDate: input.hireDate,
    active: true,
    salt,
    passwordHash: input.password ? await hashSecret(input.password, salt) : undefined,
    pinHash: input.pin ? await hashSecret(input.pin, salt) : undefined,
    passkeys: [],
    hourlyRate: input.hourlyRate ?? 0,
    weeklyHours: input.weeklyHours ?? 40,
    deductionIds: input.role === 'employee' ? builtinDeductions : [],
    createdAt: Date.now(),
  };
  await db.users.add(user);
  return user;
}

export async function setPassword(userId: string, password: string) {
  const u = await db.users.get(userId);
  if (!u) return;
  await db.users.update(userId, { passwordHash: await hashSecret(password, u.salt) });
}
export async function setPin(userId: string, pin: string) {
  const u = await db.users.get(userId);
  if (!u) return;
  await db.users.update(userId, { pinHash: await hashSecret(pin, u.salt) });
}
