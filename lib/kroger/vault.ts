import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { KrogerNotConfigured } from './token';

const ALG = 'aes-256-gcm';
const VERSION = 'v1';

function key(): Buffer | null {
  const raw = process.env.KROGER_TOKEN_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, 'base64');
  return k.length === 32 ? k : null;
}

/** Whether KROGER_TOKEN_KEY is set to the base64 of exactly 32 bytes. */
export const isVaultConfigured = (): boolean => key() !== null;

/** AES-256-GCM. `aad` ties the sealed text to its owner, so it opens for nobody else. Format: v1.<iv>.<ciphertext>.<tag>. */
export function seal(plain: string, aad: string): string {
  const k = key();
  if (!k) throw new KrogerNotConfigured();
  const iv = randomBytes(12);
  const c = createCipheriv(ALG, k, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [VERSION, iv, ct, c.getAuthTag()].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
}

/** The plain text, or null for anything that is not an untampered seal for this `aad`. Never throws. */
export function unseal(sealed: string, aad: string): string | null {
  try {
    const k = key();
    const parts = sealed.split('.');
    if (!k || parts.length !== 4 || parts[0] !== VERSION) return null;
    const [iv, ct, tag] = parts.slice(1).map((p) => Buffer.from(p, 'base64url'));
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv(ALG, k, iv);
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
