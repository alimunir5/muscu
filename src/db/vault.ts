// Stockage local dans IndexedDB (sans mot de passe). Les données restent sur
// l'appareil ; seul l'export JSON peut être chiffré.
// Les anciennes versions chiffraient tout avec un mot de passe : `migrate`
// déchiffre ce coffre une dernière fois pour le convertir.
import { deriveKey, importDataKey, open, openJSON, type KdfParams, type Sealed } from '../crypto/crypto'

const STORE = 'kv'
const STATE = 'state'

interface LegacyHeader { v: 1; kdf: KdfParams; wrapped: Sealed }

export class WrongPasswordError extends Error {
  constructor() { super('Mot de passe incorrect') }
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

  /** Données enregistrées, ou undefined au premier lancement. */
  load<T>(): Promise<T | undefined> {
    return this.get<T>(STATE)
  }

  /** Enregistre ; les écritures sont sérialisées pour éviter toute course. */
  save(data: unknown): Promise<void> {
    const job = this.queue.then(() => this.put(STATE, data))
    this.queue = job.catch(() => undefined)
    return job
  }

  /** Attend la fin des écritures en cours. */
  flush(): Promise<unknown> { return this.queue }

  /** Un coffre chiffré d'une ancienne version attend d'être converti. */
  async hasLegacy(): Promise<boolean> {
    return (await this.get<LegacyHeader>('header')) !== undefined
  }

  /** Déchiffre l'ancien coffre, l'enregistre en clair puis supprime la version chiffrée. */
  async migrate<T>(password: string, check: (d: unknown) => T = (d) => d as T): Promise<T> {
    const header = await this.get<LegacyHeader>('header')
    const sealed = await this.get<Sealed>('data')
    if (!header || !sealed) throw new Error('Aucune ancienne donnée à convertir.')
    let decrypted: unknown
    try {
      const raw = await open(await deriveKey(password, header.kdf), header.wrapped)
      decrypted = await openJSON(await importDataKey(raw), sealed)
    } catch {
      throw new WrongPasswordError()
    }
    const data = check(decrypted) // valide avant d'écrire quoi que ce soit
    await this.save(data)
    await this.dropLegacy()
    return data
  }

  /** Abandonne l'ancien coffre (mot de passe oublié). */
  async dropLegacy(): Promise<void> {
    await tx(await this.conn(), 'readwrite', (s) => {
      for (const k of ['header', 'data', 'attempts']) s.delete(k)
    })
  }
}
