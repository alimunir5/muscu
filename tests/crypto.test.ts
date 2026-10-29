import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildExport, BackupPasswordError, readBackup } from '../src/db/backup'
import { ThrottledError, throttleDelayMs, Vault, WrongPasswordError } from '../src/db/vault'
import { initialData } from '../src/seed/initial'

let n = 0
const freshVault = () => new Vault(`test-${n++}`)

describe('coffre chiffré', () => {
  it('création puis déverrouillage avec le bon mot de passe', async () => {
    const v = freshVault()
    const data = initialData()
    await v.create('Correct horse 1', data)
    v.lock()
    const out = await new Vault(v.dbName).unlock<typeof data>('Correct horse 1')
    expect(out.exercises.length).toBe(data.exercises.length)
  })

  it('les données ne sont pas stockées en clair', async () => {
    const v = freshVault()
    await v.create('secret-pass', { marqueur: 'Développé couché barre' })
    const raw = await new Promise<unknown>((resolve) => {
      const req = indexedDB.open(v.dbName)
      req.onsuccess = () => {
        const g = req.result.transaction('kv').objectStore('kv').get('data')
        g.onsuccess = () => resolve(g.result)
      }
    })
    expect(JSON.stringify(raw)).not.toContain('Développé')
    expect(JSON.stringify(raw)).not.toContain('secret-pass')
  })

  it('échec avec un mauvais mot de passe, puis délai croissant', async () => {
    const v = freshVault()
    await v.create('bon-mot-de-passe', { a: 1 })
    v.lock()
    const t0 = 1_000_000
    for (let i = 0; i < 2; i++) await expect(v.unlock('faux', t0)).rejects.toBeInstanceOf(WrongPasswordError)
    const third = await v.unlock('faux', t0).catch((e) => e)
    expect(third).toBeInstanceOf(WrongPasswordError)
    expect((third as WrongPasswordError).waitMs).toBe(5_000)
    // Pendant le délai, même le bon mot de passe est refusé.
    await expect(v.unlock('bon-mot-de-passe', t0 + 1_000)).rejects.toBeInstanceOf(ThrottledError)
    // Après le délai, ça passe et le compteur repart à zéro.
    await expect(v.unlock('bon-mot-de-passe', t0 + 6_000)).resolves.toEqual({ a: 1 })
    expect(await v.remainingWaitMs(t0 + 6_000)).toBe(0)
    expect(throttleDelayMs(4)).toBe(10_000)
    expect(throttleDelayMs(50)).toBe(15 * 60_000)
  })

  it('changement de mot de passe', async () => {
    const v = freshVault()
    await v.create('ancien', { x: 42 })
    await expect(v.changePassword('pas le bon', 'nouveau')).rejects.toBeInstanceOf(WrongPasswordError)
    await v.changePassword('ancien', 'nouveau')
    await v.save({ x: 43 })
    v.lock()
    await expect(v.unlock('ancien')).rejects.toBeInstanceOf(WrongPasswordError)
    await expect(v.unlock('nouveau')).resolves.toEqual({ x: 43 })
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
