// Coffre chiffré dans IndexedDB. Rien n'est jamais écrit en clair, hormis
// les paramètres de dérivation (sel, itérations) et le compteur d'échecs.
import {
  deriveKey, importDataKey, newDataKey, newKdfParams, open, openJSON, seal, sealJSON,
  type KdfParams, type Sealed,
} from '../crypto/crypto'

const STORE = 'kv'

interface VaultHeader { v: 1; kdf: KdfParams; wrapped: Sealed }
interface Attempts { fails: number; until: number }

export class WrongPasswordError extends Error {
  constructor(public waitMs: number) { super('Mot de passe incorrect') }
}
export class ThrottledError extends Error {
  constructor(public waitMs: number) { super('Trop de tentatives') }
}

/** Délai imposé après `fails` échecs : rien jusqu'à 3, puis 5 s, 10 s, 20 s… (max 15 min). */
export function throttleDelayMs(fails: number): number {
  if (fails < 3) return 0
  return Math.min(5_000 * 2 ** (fails - 3), 15 * 60_000)
}

// ---------- Mini-wrapper IndexedDB ----------

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function tx<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req ? (req.result as T) : (undefined as T))
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error ?? new Error('Transaction annulée'))
  })
}

export class Vault {
  private db: IDBDatabase | null = null
  private dek: CryptoKey | null = null
  private queue: Promise<unknown> = Promise.resolve()

  constructor(public readonly dbName = 'muscu') {}

  private async conn() {
    return (this.db ??= await openDb(this.dbName))
  }
  private async get<T>(key: string): Promise<T | undefined> {
    return tx<T | undefined>(await this.conn(), 'readonly', (s) => s.get(key))
  }
  private async put(key: string, value: unknown): Promise<void> {
    await tx(await this.conn(), 'readwrite', (s) => s.put(value, key))
  }

  async exists(): Promise<boolean> {
    return (await this.get<VaultHeader>('header')) !== undefined
  }

  get unlocked() { return this.dek !== null }

  /** Premier lancement : crée le coffre et y enregistre les données initiales. */
  async create(password: string, initial: unknown): Promise<void> {
    if (await this.exists()) throw new Error('Un coffre existe déjà sur cet appareil.')
    const kdf = newKdfParams()
    const kek = await deriveKey(password, kdf)
    const { key, raw } = await newDataKey()
    await this.put('header', { v: 1, kdf, wrapped: await seal(kek, raw) } satisfies VaultHeader)
    this.dek = key
    await this.save(initial)
  }

  async remainingWaitMs(now = Date.now()): Promise<number> {
    const a = await this.get<Attempts>('attempts')
    return a ? Math.max(0, a.until - now) : 0
  }

  private async unwrap(password: string): Promise<CryptoKey> {
    const header = await this.get<VaultHeader>('header')
    if (!header) throw new Error('Aucun coffre sur cet appareil.')
    const kek = await deriveKey(password, header.kdf)
    const raw = await open(kek, header.wrapped) // lève si mauvais mot de passe
    return importDataKey(raw)
  }

  /** Déverrouille et renvoie les données déchiffrées. */
  async unlock<T>(password: string, now = Date.now()): Promise<T> {
    const wait = await this.remainingWaitMs(now)
    if (wait > 0) throw new ThrottledError(wait)
    let key: CryptoKey
    try {
      key = await this.unwrap(password)
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Aucun')) throw e
      const prev = (await this.get<Attempts>('attempts'))?.fails ?? 0
      const fails = prev + 1
      const delay = throttleDelayMs(fails)
      await this.put('attempts', { fails, until: now + delay } satisfies Attempts)
      throw new WrongPasswordError(delay)
    }
    await this.put('attempts', { fails: 0, until: 0 } satisfies Attempts)
    this.dek = key
    const sealed = await this.get<Sealed>('data')
    if (!sealed) throw new Error('Données introuvables.')
    return openJSON<T>(key, sealed)
  }

  /** Enregistre (chiffré) ; les écritures sont sérialisées pour éviter toute course. */
  save(data: unknown): Promise<void> {
    const key = this.dek
    if (!key) return Promise.reject(new Error('Coffre verrouillé'))
    const job = this.queue.then(async () => this.put('data', await sealJSON(key, data)))
    this.queue = job.catch(() => undefined)
    return job
  }

  /** Attend la fin des écritures en cours. */
  flush(): Promise<unknown> { return this.queue }

  /** Ré-enveloppe la clé de données avec le nouveau mot de passe. */
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const header = await this.get<VaultHeader>('header')
    if (!header) throw new Error('Aucun coffre.')
    let raw: Uint8Array<ArrayBuffer>
    try {
      raw = await open(await deriveKey(oldPassword, header.kdf), header.wrapped)
    } catch {
      throw new WrongPasswordError(0)
    }
    const kdf = newKdfParams()
    const wrapped = await seal(await deriveKey(newPassword, kdf), raw)
    await this.put('header', { v: 1, kdf, wrapped } satisfies VaultHeader)
  }

  lock(): void { this.dek = null }

  /** Efface définitivement le coffre de cet appareil. */
  async destroy(): Promise<void> {
    this.lock()
    this.db?.close()
    this.db = null
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.deleteDatabase(this.dbName)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
      req.onblocked = () => resolve()
    })
  }
}
