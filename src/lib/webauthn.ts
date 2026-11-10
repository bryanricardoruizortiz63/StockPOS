import { Capacitor, registerPlugin } from '@capacitor/core';
import { b64, b64url, fromB64, fromB64url } from './crypto';
import type { Passkey } from './types';

/**
 * Face ID / huella / Windows Hello.
 * - Web y PWA: WebAuthn con autenticador de plataforma y verificación de usuario obligatoria.
 * - App nativa (Capacitor): plugin NativeBiometric (@capgo/capacitor-native-biometric).
 */

interface NativeBiometricPlugin {
  isAvailable(): Promise<{ isAvailable: boolean; biometryType: number }>;
  verifyIdentity(o: { reason: string; title: string }): Promise<void>;
}
const NativeBiometric = registerPlugin<NativeBiometricPlugin>('NativeBiometric');

export async function biometricsAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    try { return (await NativeBiometric.isAvailable()).isAvailable; } catch { return false; }
  }
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

export async function registerPasskey(user: { id: string; email: string; name: string }, label: string): Promise<Passkey> {
  if (Capacitor.isNativePlatform()) {
    await NativeBiometric.verifyIdentity({ reason: 'Registrar biometría para StockPOS', title: 'StockPOS' });
    return { id: 'native:' + crypto.randomUUID(), publicKey: '', alg: 0, label, createdAt: Date.now() };
  }
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'StockPOS', id: location.hostname },
      user: { id: new TextEncoder().encode(user.id), name: user.email, displayName: user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('Registro cancelado');
  const res = cred.response as AuthenticatorAttestationResponse;
  const spki = res.getPublicKey?.();
  if (!spki) throw new Error('Este navegador no expone la llave pública. Actualízalo e intenta de nuevo.');
  return { id: b64url(cred.rawId), publicKey: b64(spki), alg: res.getPublicKeyAlgorithm(), label, createdAt: Date.now() };
}

/** DER ECDSA → r||s crudo (64 bytes) para WebCrypto. */
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let p = 2;
  const read = () => {
    if (der[p++] !== 0x02) throw new Error('DER inválido');
    let len = der[p++];
    let v = der.slice(p, p + len);
    p += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read();
  const s = read();
  const raw = new Uint8Array(new ArrayBuffer(64));
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

export async function verifyWithPasskey(passkeys: Passkey[]): Promise<boolean> {
  if (!passkeys.length) throw new Error('No hay biometría registrada');
  if (Capacitor.isNativePlatform()) {
    await NativeBiometric.verifyIdentity({ reason: 'Confirma tu identidad', title: 'StockPOS' });
    return true;
  }
  const ch = challenge();
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: ch,
      rpId: location.hostname,
      allowCredentials: passkeys.filter((p) => !p.id.startsWith('native:')).map((p) => ({ type: 'public-key' as const, id: fromB64url(p.id) })),
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  const pk = passkeys.find((p) => p.id === b64url(cred.rawId));
  if (!pk) return false;
  const res = cred.response as AuthenticatorAssertionResponse;
  const client = JSON.parse(new TextDecoder().decode(res.clientDataJSON));
  if (client.type !== 'webauthn.get' || client.challenge !== b64url(ch) || client.origin !== location.origin) return false;
  const auth = new Uint8Array(res.authenticatorData);
  const flags = auth[32];
  if (!(flags & 0x01) || !(flags & 0x04)) return false; // presencia + verificación de usuario
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', res.clientDataJSON));
  const signed = new Uint8Array(auth.length + clientHash.length);
  signed.set(auth, 0);
  signed.set(clientHash, auth.length);
  const sig = new Uint8Array(res.signature);
  if (pk.alg === -7) {
    const key = await crypto.subtle.importKey('spki', fromB64(pk.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed);
  }
  const key = await crypto.subtle.importKey('spki', fromB64(pk.publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
}
