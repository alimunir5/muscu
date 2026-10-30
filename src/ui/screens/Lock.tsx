// Conversion unique des données chiffrées par une ancienne version (avec mot de passe).
import { useState } from 'preact/hooks'
import type { AppData } from '../../domain/types'
import { normalizeData } from '../../db/backup'
import { WrongPasswordError } from '../../db/vault'
import { confirmDialog } from '../dialogs'
import { boot, enterApp, vault } from '../store'

export function MigrateScreen() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: Event) => {
    e.preventDefault()
    if (!pw) return
    setBusy(true)
    setError(null)
    try {
      enterApp(await vault.migrate<AppData>(pw, normalizeData))
    } catch (err) {
      setError(err instanceof WrongPasswordError ? 'Mot de passe incorrect.' : (err as Error).message)
      setPw('')
      setBusy(false)
    }
  }

  const reset = async () => {
    const ok = await confirmDialog(
      'Repartir de zéro ?',
      'Sans le mot de passe, les anciennes données ne peuvent pas être lues. Elles seront effacées ; tu pourras ensuite restaurer une sauvegarde JSON.',
      { confirm: 'Effacer et repartir', danger: true },
    )
    if (!ok) return
    await vault.dropLegacy()
    await boot()
  }

  return (
    <main class="lock">
      <div class="brand">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" width={72} height={72} />
        <h1>Muscu</h1>
      </div>
      <form class="card" onSubmit={submit}>
        <h2>Le mot de passe disparaît</h2>
        <p class="muted">Saisis-le une dernière fois pour récupérer tes données. Ensuite, l’app s’ouvrira directement.</p>
        <label class="field">
          <span>Ancien mot de passe</span>
          <input type="password" autocomplete="current-password" value={pw} autoFocus
            onInput={(e) => setPw(e.currentTarget.value)} />
        </label>
        {error && <p class="error" role="alert">{error}</p>}
        <button class="btn primary big" disabled={busy || !pw}>{busy ? 'Conversion…' : 'Récupérer mes données'}</button>
      </form>
      <button class="btn ghost danger-text" onClick={reset}>Mot de passe oublié ?</button>
    </main>
  )
}
