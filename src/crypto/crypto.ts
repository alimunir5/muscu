// Primitives Web Crypto : PBKDF2-SHA256 → AES-GCM 256.
//
// Schéma « enveloppe » : une clé de données (DEK) aléatoire chiffre les
// données ; la DEK est elle-même chiffrée par une clé dérivée du mot de
// passe (KEK). Changer de mot de passe ne re-chiffre que la DEK.

export const PBKDF2_ITERATIONS = 600_000

export interface KdfParams { salt: string; iterations: number }
export interface Sealed { iv: string; ct: string }

const enc = new TextEncoder()
const dec = new TextDecoder()

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n))

export function newKdfParams(iterations = PBKDF2_ITERATIONS): KdfParams {
  return { salt: toB64(randomBytes(16)), iterations }
}

/** Dérive une clé AES-GCM (non extractible) à partir du mot de passe. */
export async function deriveKey(password: string, p: KdfParams): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(p.salt), iterations: p.iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  )
}

export async function seal(key: CryptoKey, plain: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12)
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { iv: toB64(iv), ct: toB64(ct) }
}

/** Lève une erreur si la clé est mauvaise ou les données altérées (tag GCM). */
export async function open(key: CryptoKey, s: Sealed): Promise<Uint8Array<ArrayBuffer>> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(s.iv) }, key, fromB64(s.ct))
  return new Uint8Array(pt)
}

export const sealJSON = (key: CryptoKey, value: unknown) => seal(key, enc.encode(JSON.stringify(value)))
export const openJSON = async <T>(key: CryptoKey, s: Sealed): Promise<T> => JSON.parse(dec.decode(await open(key, s)))

/** Génère une DEK : renvoie la clé utilisable et ses octets bruts (pour l'envelopper). */
export async function newDataKey(): Promise<{ key: CryptoKey; raw: Uint8Array<ArrayBuffer> }> {
  const raw = randomBytes(32)
  return { key: await importDataKey(raw), raw }
}

export const importDataKey = (raw: Uint8Array<ArrayBuffer>) =>
  crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
