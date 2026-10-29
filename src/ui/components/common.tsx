// Composants réutilisables : barre de titre, icônes, champs numériques, états vides.
import type { ComponentChildren } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { fmtNum, parseDecimal } from '../../domain/format'
import { toast } from '../dialogs'
import { history, lock, redo, undo } from '../store'

const PATHS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  dumbbell: 'M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  body: 'M12 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 9l7 1 7-1M12 10v5l-3 7M12 15l3 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15.1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 8.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9.3A1.7 1.7 0 0 0 10 4.2V4a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M19 12l-7 7-7-7',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 6l6 6-6 6',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  timer: 'M12 8v5l3 2M12 22a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10 2h4',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  note: 'M4 4h16v12H8l-4 4z',
  skip: 'M5 5l10 7-10 7zM19 5v14',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
}

export function Icon({ name, size = 22, label }: { name: keyof typeof PATHS | string; size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined}
      aria-label={label} class="icon">
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}

/** Barre de titre avec annuler / rétablir / verrouiller. */
export function TopBar({ title, backTo, actions }: { title: string; backTo?: () => void; actions?: ComponentChildren }) {
  const h = history.value
  return (
    <header class="topbar">
      {backTo && (
        <button class="icon-btn" onClick={backTo} aria-label="Retour"><Icon name="back" /></button>
      )}
      <h1>{title}</h1>
      <div class="topbar-actions">
        {actions}
        <button class="icon-btn" disabled={!h.undo} aria-label={h.undo ? `Annuler : ${h.undo}` : 'Rien à annuler'}
          title={h.undo ? `Annuler : ${h.undo}` : undefined}
          onClick={() => { const l = undo(); if (l) toast(`Annulé : ${l}`) }}><Icon name="undo" /></button>
        <button class="icon-btn" disabled={!h.redo} aria-label={h.redo ? `Rétablir : ${h.redo}` : 'Rien à rétablir'}
          onClick={() => { const l = redo(); if (l) toast(`Rétabli : ${l}`) }}><Icon name="redo" /></button>
        <button class="icon-btn" onClick={() => void lock()} aria-label="Verrouiller"><Icon name="lock" /></button>
      </div>
    </header>
  )
}

export function Empty({ title, text, children }: { title: string; text?: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <p class="empty-title">{title}</p>
      {text && <p class="muted">{text}</p>}
      {children}
    </div>
  )
}

/**
 * Champ numérique tolérant (virgule ou point) avec boutons − / +.
 * La valeur n'est envoyée qu'une fois valide ; l'erreur est affichée sinon.
 */
export function NumberStepper({
  label, value, onChange, step, min = 0, max = 1000, integer = false, unit, placeholder = '—',
}: {
  label: string; value: number | null; onChange: (v: number | null) => void; step: number
  min?: number; max?: number; integer?: boolean; unit?: string; placeholder?: string
}) {
  const [text, setText] = useState(value === null ? '' : fmtNum(value))
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const parsed = parseDecimal(text)
    if (parsed !== value) setText(value === null ? '' : fmtNum(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (raw: string) => {
    setText(raw)
    const v = parseDecimal(raw)
    if (v === null) { setError(null); return onChange(null) }
    if (Number.isNaN(v)) return setError(integer ? 'Nombre entier attendu' : 'Nombre attendu (ex. 11,3)')
    if (integer && !Number.isInteger(v)) return setError('Nombre entier attendu')
    if (v < min || v > max) return setError(`Entre ${fmtNum(min)} et ${fmtNum(max)}`)
    setError(null)
    onChange(v)
  }
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0
    const next = Math.min(max, Math.max(min, Math.round((base + dir * step) * 100) / 100))
    setError(null)
    setText(fmtNum(next))
    onChange(next)
  }
  const id = `f-${label.replace(/\W+/g, '-')}`
  return (
    <div class="stepper">
      <label for={id} class="stepper-label">{label}{unit && <span class="muted"> ({unit})</span>}</label>
      <div class="stepper-row">
        <button type="button" class="step-btn" onClick={() => bump(-1)} aria-label={`${label} moins ${fmtNum(step)}`}>
          <Icon name="minus" size={26} />
        </button>
        <input id={id} class="step-input" value={text} placeholder={placeholder}
          inputMode={integer ? 'numeric' : 'decimal'} autocomplete="off" enterKeyHint="done"
          aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined}
          onInput={(e) => commit(e.currentTarget.value)} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" class="step-btn" onClick={() => bump(1)} aria-label={`${label} plus ${fmtNum(step)}`}>
          <Icon name="plus" size={26} />
        </button>
      </div>
      {error && <span id={`${id}-err`} class="error" role="alert">{error}</span>}
    </div>
  )
}

/** Champ numérique simple (mensurations, réglages). */
export function NumField({ label, value, onChange, unit, integer, min = 0, max = 100000 }: {
  label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; integer?: boolean; min?: number; max?: number
}) {
  const [text, setText] = useState(value === null ? '' : fmtNum(value))
  const [error, setError] = useState<string | null>(null)
  return (
    <label class="field">
      <span>{label}{unit && <span class="muted"> ({unit})</span>}</span>
      <input value={text} inputMode={integer ? 'numeric' : 'decimal'} aria-invalid={!!error}
        onInput={(e) => {
          const raw = e.currentTarget.value
          setText(raw)
          const v = parseDecimal(raw)
          if (v === null) { setError(null); return onChange(null) }
          if (Number.isNaN(v) || (integer && !Number.isInteger(v))) return setError(integer ? 'Nombre entier attendu' : 'Nombre attendu (ex. 78,4)')
          if (v < min || v > max) return setError(`Entre ${fmtNum(min)} et ${fmtNum(max)}`)
          setError(null)
          onChange(v)
        }} />
      {error && <span class="error" role="alert">{error}</span>}
    </label>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label class="toggle">
      <span>{label}{hint && <small class="muted block">{hint}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
    </label>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div class="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div class="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  )
}
