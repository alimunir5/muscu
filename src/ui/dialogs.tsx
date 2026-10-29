// Boîtes de dialogue (confirmation, saisie) et notifications éphémères.
import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'

interface DialogState {
  title: string
  message?: string
  confirm: string
  danger?: boolean
  input?: { value: string; label: string; type?: 'text' | 'password' | 'number'; validate?: (v: string) => string | null }
  resolve: (v: string | boolean | null) => void
}

const dialog = signal<DialogState | null>(null)

export function confirmDialog(title: string, message?: string, opts: { confirm?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialog.value = { title, message, confirm: opts.confirm ?? 'Confirmer', danger: opts.danger, resolve: (v) => resolve(v === true) }
  })
}

export function promptDialog(
  title: string, label: string, value = '',
  opts: { confirm?: string; type?: 'text' | 'password' | 'number'; message?: string; validate?: (v: string) => string | null } = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    dialog.value = {
      title, message: opts.message, confirm: opts.confirm ?? 'Valider',
      input: { value, label, type: opts.type, validate: opts.validate },
      resolve: (v) => resolve(typeof v === 'string' ? v : null),
    }
  })
}

export function DialogHost() {
  const d = dialog.value
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<Element | null>(null)

  useEffect(() => {
    if (!d) return
    prevFocus.current = document.activeElement
    setValue(d.input?.value ?? '')
    setError(null)
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input, button.primary, button.danger')?.focus(), 0)
    return () => (prevFocus.current as HTMLElement | null)?.focus?.()
  }, [d])

  if (!d) return null
  const close = (v: string | boolean | null) => { dialog.value = null; d.resolve(v) }
  const submit = (e: Event) => {
    e.preventDefault()
    if (d.input) {
      const err = d.input.validate?.(value) ?? null
      if (err) return setError(err)
      close(value)
    } else close(true)
  }
  return (
    <div class="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close(null)}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-title" ref={ref}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}>
        <form onSubmit={submit}>
          <h2 id="dlg-title">{d.title}</h2>
          {d.message && <p class="muted pre">{d.message}</p>}
          {d.input && (
            <label class="field">
              <span>{d.input.label}</span>
              {d.input.type === 'password'
                ? <input type="password" value={value} onInput={(e) => setValue(e.currentTarget.value)} aria-invalid={!!error} />
                : <input type="text" value={value} onInput={(e) => setValue(e.currentTarget.value)}
                  inputMode={d.input.type === 'number' ? 'numeric' : undefined} aria-invalid={!!error} />}
              {error && <span class="error" role="alert">{error}</span>}
            </label>
          )}
          <div class="row end gap">
            <button type="button" class="btn ghost" onClick={() => close(null)}>Annuler</button>
            <button type="submit" class={`btn ${d.danger ? 'danger' : 'primary'}`}>{d.confirm}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------- Toasts ----------

interface Toast { id: number; text: string; action?: { label: string; run: () => void }; kind?: 'pr' | 'error' }
const toasts = signal<Toast[]>([])
let tid = 0

export function toast(text: string, opts: { action?: Toast['action']; kind?: Toast['kind']; ms?: number } = {}) {
  const t: Toast = { id: ++tid, text, action: opts.action, kind: opts.kind }
  toasts.value = [...toasts.value.slice(-2), t]
  setTimeout(() => { toasts.value = toasts.value.filter((x) => x.id !== t.id) }, opts.ms ?? 4000)
}

export function ToastHost() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.value.map((t) => (
        <div key={t.id} class={`toast ${t.kind ?? ''}`}>
          <span>{t.text}</span>
          {t.action && (
            <button class="btn small ghost" onClick={() => { t.action!.run(); toasts.value = toasts.value.filter((x) => x.id !== t.id) }}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
