// État global : données en mémoire, annuler / rétablir,
// sauvegarde locale en continu.
import { computed, signal } from '@preact/signals'
import { programWeek, todayISO } from '../domain/format'
import type { AppData, Session } from '../domain/types'
import { normalizeData } from '../db/backup'
import { Vault } from '../db/vault'
import { initialData } from '../seed/initial'
import { buildDemoData } from '../seed/demo'

export type Phase = 'loading' | 'migrate' | 'app'

export const vault = new Vault('muscu')
export const phase = signal<Phase>('loading')
export const demo = signal(false)
export const data = signal<AppData | null>(null)
export const saveError = signal<string | null>(null)

/** Accès non nul, réservé aux écrans affichés une fois les données chargées. */
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
 * l'annulation, puis enregistre en arrière-plan.
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
// Lecture impossible au démarrage : on n'écrit plus rien pour ne pas écraser les données.
let readFailed = false

function scheduleSave() {
  if (demo.value || readFailed) return // le mode démo ne touche jamais au stockage
  if (timer) clearTimeout(timer)
  timer = setTimeout(saveNow, 250)
}

export async function saveNow() {
  if (timer) { clearTimeout(timer); timer = null }
  if (demo.value || readFailed || !data.value) return
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
    const saved = await vault.load<AppData>()
    if (saved) return enterApp(normalizeData(saved))
    if (await vault.hasLegacy()) { phase.value = 'migrate'; return }
  } catch (e) {
    readFailed = true
    saveError.value = `Lecture des données impossible (${(e as Error).message}). Rien ne sera enregistré : ferme et rouvre l’app.`
  }
  const d = initialData()
  enterApp(d)
  void saveNow()
}

export function enterApp(d: AppData, isDemo = false) {
  demo.value = isDemo
  data.value = d
  clearHistory()
  phase.value = 'app'
  // À l'ouverture : reprise directe de la séance en cours, sinon l'accueil.
  location.hash = d.sessions.some((s) => s.status === 'active') ? '#/seance' : '#/'
}

export async function startDemo() {
  await saveNow()
  await vault.flush()
  enterApp(buildDemoData(), true)
}

/** Quitte le mode démo et recharge les vraies données. */
export async function exitDemo() {
  demo.value = false
  phase.value = 'loading'
  await boot()
}

// ---------- Dérivés pratiques ----------

export const activeSession = computed<Session | undefined>(() => data.value?.sessions.find((s) => s.status === 'active'))

export const currentWeek = computed(() => (data.value ? programWeek(todayISO(), data.value.settings.programStart) : 1))
