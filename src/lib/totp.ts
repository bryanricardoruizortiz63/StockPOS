import * as OTPAuth from 'otpauth';

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label = 'StockPOS', issuer = 'StockPOS', period = 30) {
  return new OTPAuth.TOTP({ issuer, label, algorithm: 'SHA1', digits: 6, period, secret: OTPAuth.Secret.fromBase32(secret) });
}

/** URI otpauth:// para Microsoft Authenticator, Google Authenticator, etc. */
export function totpUri(secret: string, accountLabel: string) {
  return totp(secret, accountLabel).toString();
}

export function verifyTotp(secret: string, token: string, window = 1, period = 30): boolean {
  const clean = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  return totp(secret, 'x', 'StockPOS', period).validate({ token: clean, window }) !== null;
}

export function currentTotp(secret: string, period = 30): string {
  return totp(secret, 'x', 'StockPOS', period).generate();
}
