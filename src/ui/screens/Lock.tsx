// Premier lancement (création du mot de passe) et déverrouillage.
import { useEffect, useState } from 'preact/hooks'
import type { AppData } from '../../domain/types'
import { normalizeData } from '../../db/backup'
import { ThrottledError, WrongPasswordError } from '../../db/vault'
import { initialData } from '../../seed/initial'
import { confirmDialog } from '../dialogs'
import { enterApp, phase, startDemo, vault } from '../store'

const MIN_LEN = 8

export function LockScreen() {
  return phase.value === 'setup' ? <Setup /> : <Unlock />
}

function Brand() {
  return (
    <div class="brand">
      <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={72} height={72} />
      <h1>Muscu</h1>
    </div>
  )
}

function Setup() {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    if (pw.length < MIN_LEN) return setError(`Au moins ${MIN_LEN} caractères.`)
    if (pw !== pw2) return setError('Les deux mots de passe ne correspondent pas.')
    if (!ack) return setError('Coche la case pour confirmer que tu as compris.')
    setBusy(true)
    try {
      const d = initialData()
      await vault.create(pw, d)
      enterApp(d)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <main class="lock">
      <Brand />
      <form class="card" onSubmit={submit}>
        <h2>Crée ton mot de passe</h2>
        <p class="muted">Il chiffre toutes tes données sur cet appareil. Il n’est stocké nulle part.</p>
        <label class="field">
          <span>Mot de passe</span>
          <input type="password" autocomplete="new-password" value={pw} onInput={(e) => setPw(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span>Confirmation</span>
          <input type="password" autocomplete="new-password" value={pw2} onInput={(e) => setPw2(e.currentTarget.value)} />
        </label>
        <label class="check">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.currentTarget.checked)} />
          <span>J’ai compris : <strong>si j’oublie ce mot de passe, mes données sont perdues</strong>. Aucune récupération n’est possible. Je ferai des exports réguliers.</span>
        </label>
        {error && <p class="error" role="alert">{error}</p>}
        <button class="btn primary big" disabled={busy}>{busy ? 'Chiffrement…' : 'Créer et commencer'}</button>
      </form>
      <button class="btn ghost" onClick={startDemo}>Essayer d’abord en mode démo</button>
    </main>
  )
}

function Unlock() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState(0)

  useEffect(() => { void vault.remainingWaitMs().then(setWait) }, [])
  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1000)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!pw || wait > 0) return
    setBusy(true)
    setError(null)
    try {
      const d = await vault.unlock<AppData>(pw)
      enterApp(normalizeData(d))
    } catch (err) {
      if (err instanceof WrongPasswordError) {
        setError('Mot de passe incorrect.')
        setWait(err.waitMs)
      } else if (err instanceof ThrottledError) setWait(err.waitMs)
      else setError((err as Error).message)
      setPw('')
      setBusy(false)
    }
  }

  const reset = async () => {
    const ok = await confirmDialog(
      'Effacer toutes les données ?',
      'Sans le mot de passe, les données ne peuvent pas être déchiffrées. Tu pourras repartir de zéro puis restaurer une sauvegarde (export JSON). Cette action est définitive.',
      { confirm: 'Tout effacer', danger: true },
    )
    if (!ok) return
    await vault.destroy()
    phase.value = 'setup'
  }

  return (
    <main class="lock">
      <Brand />
      <form class="card" onSubmit={submit}>
        <label class="field">
          <span>Mot de passe</span>
          <input type="password" autocomplete="current-password" value={pw} autoFocus
            onInput={(e) => setPw(e.currentTarget.value)} disabled={wait > 0} />
        </label>
        {error && <p class="error" role="alert">{error}</p>}
        {wait > 0 && <p class="muted" role="status">Trop d’essais. Réessaie dans {Math.ceil(wait / 1000)} s.</p>}
        <button class="btn primary big" disabled={busy || wait > 0 || !pw}>{busy ? 'Déchiffrement…' : 'Déverrouiller'}</button>
      </form>
      <div class="row center gap wrap">
        <button class="btn ghost" onClick={startDemo}>Mode démo</button>
        <button class="btn ghost danger-text" onClick={reset}>Mot de passe oublié ?</button>
      </div>
    </main>
  )
}
