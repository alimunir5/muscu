// État global : données déchiffrées en mémoire, annuler / rétablir,
// sauvegarde chiffrée en continu.
import { computed, signal } from '@preact/signals'
import { programWeek, todayISO } from '../domain/format'
import type { AppData, Session } from '../domain/types'
import { Vault } from '../db/vault'
import { buildDemoData } from '../seed/demo'

export type Phase = 'loading' | 'setup' | 'locked' | 'app'

export const vault = new Vault('muscu')
export const phase = signal<Phase>('loading')
export const demo = signal(false)
export const data = signal<AppData | null>(null)
export const saveError = signal<string | null>(null)

/** Accès non nul, réservé aux écrans affichés une fois déverrouillé. */
export const D = () => data.value as AppData

const undoStack: { label: string; snap: AppData }[] = []
const redoStack: { label: string; snap: AppData }[] = []
export const history = signal({ undo: '', redo: '' })
const MAX_UNDO = 40

function refreshHistory() {
  history.value = { undo: undoStack.at(-1)?.label ?? '', redo: redoStack.at(-1)?.label ?? '' }
}

/**
 * Seule façon de modifier les données : copie, applique, empile pour
 * l'annulation, puis enregistre (chiffré) en arrière-plan.
 * `undoable: false` pour les saisies de champ qui ne méritent pas d'étape.
 */
export function mutate(label: string, fn: (d: AppData) => void, opts: { undoable?: boolean } = {}) {
  const prev = data.value
  if (!prev) return
  const next = structuredClone(prev)
  fn(next)
  if (opts.undoable !== false) {
    undoStack.push({ label, snap: prev })
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack.length = 0
    refreshHistory()
  }
  data.value = next
  scheduleSave()
}

export function undo() {
  const step = undoStack.pop()
  if (!step || !data.value) return
  redoStack.push({ label: step.label, snap: data.value })
  data.value = step.snap
  refreshHistory()
  scheduleSave()
  return step.label
}

export function redo() {
  const step = redoStack.pop()
  if (!step || !data.value) return
  undoStack.push({ label: step.label, snap: data.value })
  data.value = step.snap
  refreshHistory()
  scheduleSave()
  return step.label
}

function clearHistory() {
  undoStack.length = 0
  redoStack.length = 0
  refreshHistory()
}

// ---------- Sauvegarde ----------

let timer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  if (demo.value) return // le mode démo ne touche jamais au stockage
  if (timer) clearTimeout(timer)
  timer = setTimeout(saveNow, 250)
}

export async function saveNow() {
  if (timer) { clearTimeout(timer); timer = null }
  if (demo.value || !data.value || !vault.unlocked) return
  try {
    await vault.save(data.value)
    saveError.value = null
  } catch (e) {
    saveError.value = `Échec de l’enregistrement : ${(e as Error).message}`
  }
}

// Fermeture de l'app ou passage en arrière-plan : on écrit immédiatement.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void saveNow() })
  window.addEventListener('pagehide', () => void saveNow())
}

// ---------- Cycle de vie ----------

export async function boot() {
  try {
    phase.value = (await vault.exists()) ? 'locked' : 'setup'
  } catch {
    phase.value = 'setup'
  }
}

export function enterApp(d: AppData, isDemo = false) {
  demo.value = isDemo
  data.value = d
  clearHistory()
  phase.value = 'app'
  // Au déverrouillage : reprise directe de la séance en cours, sinon l'accueil.
  location.hash = d.sessions.some((s) => s.status === 'active') ? '#/seance' : '#/'
}

export async function lock() {
  await saveNow()
  await vault.flush()
  vault.lock()
  data.value = null
  clearHistory()
  phase.value = demo.value ? ((await vault.exists()) ? 'locked' : 'setup') : 'locked'
  demo.value = false
}

export function startDemo() {
  enterApp(buildDemoData(), true)
}

// ---------- Dérivés pratiques ----------

export const activeSession = computed<Session | undefined>(() => data.value?.sessions.find((s) => s.status === 'active'))

export const currentWeek = computed(() => (data.value ? programWeek(todayISO(), data.value.settings.programStart) : 1))
