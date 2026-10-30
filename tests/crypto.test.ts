import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildExport, BackupPasswordError, readBackup } from '../src/db/backup'
import { Vault, WrongPasswordError } from '../src/db/vault'
import { deriveKey, newDataKey, newKdfParams, seal, sealJSON } from '../src/crypto/crypto'
import { initialData } from '../src/seed/initial'

let n = 0
const freshVault = () => new Vault(`test-${n++}`)

/** Écrit un coffre au format des anciennes versions (chiffré par mot de passe). */
async function writeLegacy(dbName: string, password: string, value: unknown) {
  const kdf = newKdfParams(1000)
  const { key, raw } = await newDataKey()
  const header = { v: 1, kdf, wrapped: await seal(await deriveKey(password, kdf), raw) }
  const data = await sealJSON(key, value)
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('kv')
    req.onsuccess = () => {
      const t = req.result.transaction('kv', 'readwrite')
      t.objectStore('kv').put(header, 'header')
      t.objectStore('kv').put(data, 'data')
      t.oncomplete = () => { req.result.close(); resolve() }
      t.onerror = () => reject(t.error)
    }
  })
}

describe('stockage local', () => {
  it('premier lancement vide, puis relecture après enregistrement', async () => {
    const v = freshVault()
    expect(await v.load()).toBeUndefined()
    expect(await v.hasLegacy()).toBe(false)
    const data = initialData()
    void v.save({ old: true })
    await v.save(data)
    const out = await new Vault(v.dbName).load<typeof data>()
    expect(out?.exercises.length).toBe(data.exercises.length)
  })

  it('conversion d’un ancien coffre chiffré', async () => {
    const v = freshVault()
    await writeLegacy(v.dbName, 'ancien-mdp', { x: 42 })
    expect(await v.hasLegacy()).toBe(true)
    expect(await v.load()).toBeUndefined()
    await expect(v.migrate('faux')).rejects.toBeInstanceOf(WrongPasswordError)
    expect(await v.hasLegacy()).toBe(true)
    await expect(v.migrate('ancien-mdp')).resolves.toEqual({ x: 42 })
    expect(await v.hasLegacy()).toBe(false)
    expect(await new Vault(v.dbName).load()).toEqual({ x: 42 })
  })

  it('abandon d’un ancien coffre', async () => {
    const v = freshVault()
    await writeLegacy(v.dbName, 'oublié', { x: 1 })
    await v.dropLegacy()
    expect(await v.hasLegacy()).toBe(false)
  })
})

describe('export / import', () => {
  it('export chiffré : relecture avec le bon mot de passe uniquement', async () => {
    const data = initialData()
    const file = JSON.parse(await buildExport(data, 'export-pass'))
    expect(file.encrypted).toBe(true)
    expect(JSON.stringify(file)).not.toContain('Squat')
    await expect(readBackup(file)).rejects.toBeInstanceOf(BackupPasswordError)
    await expect(readBackup(file, 'mauvais')).rejects.toBeInstanceOf(BackupPasswordError)
    const back = await readBackup(file, 'export-pass')
    expect(back.templates.map((t) => t.name)).toEqual(['Haut A', 'Bas A', 'Haut B', 'Bas B'])
  })

  it('export en clair', async () => {
    const data = initialData()
    const back = await readBackup(JSON.parse(await buildExport(data)))
    expect(back.exercises).toEqual(data.exercises)
  })
})
