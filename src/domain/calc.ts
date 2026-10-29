// Calculs « cellules noires » de l'Excel : volume, 1RM estimé, agrégats.
// Fonctions pures, testées dans tests/calc.test.ts.
import { fmtNum, programWeek, round2 } from './format'
import type {
  AppData, BodyEntry, Equipment, Exercise, ID, ISODate, Session, SessionEntry, SetEntry, Settings,
} from './types'

/** Formule d'Epley : charge × (1 + reps / 30). */
export function epley(load: number, reps: number): number {
  return load * (1 + reps / 30)
}

/** Poids de corps connu le plus récent à la date donnée (sinon le plus ancien connu). */
export function bodyweightAt(body: BodyEntry[], date: ISODate): number | null {
  const withW = body.filter((b) => b.weight !== null && b.weight > 0).sort((a, b) => a.date.localeCompare(b.date))
  if (!withW.length) return null
  let found: BodyEntry | undefined
  for (const b of withW) if (b.date <= date) found = b
  return (found ?? withW[0]).weight
}

/** Charge prise en compte pour le volume et le 1RM, ou null si non comptée. */
export function effectiveLoad(ex: Pick<Exercise, 'volumeMode'>, load: number | null, bodyweight: number | null): number | null {
  if (ex.volumeMode === 'aucun') return null
  if (ex.volumeMode === 'pdc') {
    const total = (bodyweight ?? 0) + (load ?? 0)
    return total > 0 ? total : null
  }
  return load !== null && load > 0 ? load : null
}

/** Une série compte si elle est validée avec au moins 1 répétition. */
export const isRealized = (s: SetEntry) => s.done && !s.abandoned && s.reps !== null && s.reps > 0

export interface SetMetrics { volume: number | null; e1rm: number | null; load: number | null }

/**
 * Volume = reps × charge (×2 si unilatéral) ; 1RM = Epley.
 * Une série sans reps réalisées ou sans charge ne produit aucune valeur
 * (null, jamais 0) pour ne pas fausser moyennes et graphiques.
 */
export function setMetrics(set: SetEntry, ex: Pick<Exercise, 'volumeMode' | 'unilateral'>, bodyweight: number | null = null): SetMetrics {
  if (!isRealized(set)) return { volume: null, e1rm: null, load: null }
  const load = effectiveLoad(ex, set.load, bodyweight)
  if (load === null) return { volume: null, e1rm: null, load: null }
  const reps = set.reps as number
  return {
    volume: round2(reps * load * (ex.unilateral ? 2 : 1)),
    e1rm: round2(epley(load, reps)),
    load,
  }
}

export function sessionWeek(s: Session, settings: Pick<Settings, 'programStart'>): number {
  return s.weekOverride ?? programWeek(s.date, settings.programStart)
}

/** Une ligne par série, enrichie : l'équivalent du « Journal des séances ». */
export interface FlatSet {
  session: Session
  entry: SessionEntry
  set: SetEntry
  exercise: Exercise | undefined
  week: number
  volume: number | null
  e1rm: number | null
  load: number | null
}

export function flatten(data: AppData, opts: { includeActive?: boolean } = {}): FlatSet[] {
  const exById = new Map(data.exercises.map((e) => [e.id, e]))
  const rows: FlatSet[] = []
  for (const session of data.sessions) {
    if (session.status === 'active' && !opts.includeActive) continue
    const week = sessionWeek(session, data.settings)
    const bw = bodyweightAt(data.body, session.date)
    for (const entry of session.entries) {
      const exercise = exById.get(entry.exerciseId)
      for (const set of entry.sets) {
        const m = exercise ? setMetrics(set, exercise, bw) : { volume: null, e1rm: null, load: null }
        rows.push({ session, entry, set, exercise, week, ...m })
      }
    }
  }
  return rows
}

/** Volume total par numéro de semaine (seules les semaines avec données sont présentes). */
export function weeklyVolume(rows: FlatSet[]): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of rows) if (r.volume !== null) out.set(r.week, round2((out.get(r.week) ?? 0) + r.volume))
  return out
}

export function totalVolume(rows: FlatSet[]): number {
  return round2(rows.reduce((acc, r) => acc + (r.volume ?? 0), 0))
}

/** Une séance est réalisée si elle a au moins une série réalisée (ou un bloc coché). */
export function sessionRealized(s: Session): boolean {
  return s.entries.some((e) => e.checked || e.sets.some(isRealized))
}

/**
 * Nombre de séances distinctes (date + nom de séance) réalisées dans la semaine.
 * Corrige le bug de l'Excel (5,05 séances) : c'est toujours un entier.
 */
export function sessionsDoneInWeek(data: AppData, week: number): number {
  const keys = new Set<string>()
  for (const s of data.sessions) {
    if (s.status === 'active') continue
    if (sessionWeek(s, data.settings) === week && sessionRealized(s)) keys.add(`${s.date}|${s.name.trim().toLowerCase()}`)
  }
  return keys.size
}

export interface Completion { done: number; planned: number; pct: number; label: string; extra: number }

/** Taux de réalisation, plafonné à 100 % ; les séances en plus sont signalées à part. */
export function completion(done: number, planned: number): Completion {
  const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0
  return { done, planned, pct, label: `${done}/${planned}`, extra: Math.max(0, done - planned) }
}

/** Meilleur 1RM estimé enregistré par exercice. */
export function bestE1rm(rows: FlatSet[], exerciseId: ID): FlatSet | null {
  let best: FlatSet | null = null
  for (const r of rows) if (r.entry.exerciseId === exerciseId && r.e1rm !== null && (!best || r.e1rm > (best.e1rm as number))) best = r
  return best
}

/** Meilleur 1RM estimé de chaque semaine pour un exercice. */
export function weeklyBestE1rm(rows: FlatSet[], exerciseId: ID): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of rows) {
    if (r.entry.exerciseId !== exerciseId || r.e1rm === null) continue
    out.set(r.week, Math.max(out.get(r.week) ?? 0, r.e1rm))
  }
  return out
}

/** Semaines de min à max (sans trou) pour l'axe des graphiques. */
export function weekRange(weeks: Iterable<number>, extra: number[] = []): number[] {
  const all = [...weeks, ...extra]
  if (!all.length) return []
  const min = Math.min(...all), max = Math.max(...all)
  return Array.from({ length: max - min + 1 }, (_, i) => min + i)
}

// ---------- Records personnels ----------

export type PRKind = 'e1rm' | 'load' | 'reps'
export const PR_LABEL: Record<PRKind, string> = {
  e1rm: 'Record 1RM estimé',
  load: 'Record de charge',
  reps: 'Record de reps à cette charge',
}

/** Records battus par `candidate` par rapport à l'historique `previous` (même exercice). */
export function detectPRs(previous: Pick<FlatSet, 'e1rm' | 'load' | 'set'>[], candidate: Pick<FlatSet, 'e1rm' | 'load' | 'set'>): PRKind[] {
  if (candidate.e1rm === null || candidate.load === null) return []
  const counted = previous.filter((p) => p.e1rm !== null && p.load !== null)
  if (!counted.length) return [] // première fois : pas de « record » artificiel
  const out: PRKind[] = []
  if (candidate.e1rm > Math.max(...counted.map((p) => p.e1rm as number))) out.push('e1rm')
  if (candidate.load > Math.max(...counted.map((p) => p.load as number))) out.push('load')
  const sameLoad = counted.filter((p) => p.load === candidate.load)
  if (sameLoad.length && (candidate.set.reps as number) > Math.max(...sameLoad.map((p) => p.set.reps as number))) out.push('reps')
  return out
}

const chrono = (a: FlatSet, b: FlatSet) =>
  a.session.date.localeCompare(b.session.date) || a.set.index - b.set.index

/** Records de chaque série d'un exercice, en rejouant l'historique dans l'ordre. */
export function prHistory(rows: FlatSet[], exerciseId: ID): Map<ID, PRKind[]> {
  const list = rows.filter((r) => r.entry.exerciseId === exerciseId && r.e1rm !== null).sort(chrono)
  const out = new Map<ID, PRKind[]>()
  list.forEach((r, i) => {
    const prs = detectPRs(list.slice(0, i), r)
    if (prs.length) out.set(r.set.id, prs)
  })
  return out
}

// ---------- « Dernière fois » et double progression ----------

export interface LastPerf { session: Session; entry: SessionEntry }

/** Dernière séance terminée contenant l'exercice avec au moins une série réalisée (même modèle en priorité). */
export function lastPerformance(data: AppData, exerciseId: ID, opts: { templateId?: ID; excludeSessionId?: ID } = {}): LastPerf | null {
  const candidates: LastPerf[] = []
  for (const session of data.sessions) {
    if (session.id === opts.excludeSessionId || session.status === 'active') continue
    const entry = session.entries.find((e) => e.exerciseId === exerciseId && e.sets.some(isRealized))
    if (entry) candidates.push({ session, entry })
  }
  if (!candidates.length) return null
  candidates.sort((a, b) => b.session.date.localeCompare(a.session.date))
  return candidates.find((c) => opts.templateId && c.session.templateId === opts.templateId) ?? candidates[0]
}

export function summarizeSets(entry: SessionEntry): string {
  return entry.sets
    .filter(isRealized)
    .map((s) => `${s.reps} × ${s.load !== null ? fmtNum(s.load) + ' kg' : 'PDC'}${s.rpe !== null ? `, RPE ${fmtNum(s.rpe)}` : ''}`)
    .join(' · ')
}

export interface Suggestion { text: string; load: number | null }

/**
 * Double progression : si toutes les séries prévues ont atteint le haut de la
 * fourchette, suggérer d'augmenter la charge et de repartir au bas.
 * Ne s'applique jamais automatiquement.
 */
export function progressionSuggestion(
  last: SessionEntry, equipment: Equipment, range: { repMin: number; repMax: number; sets: number }, step: number,
): Suggestion | null {
  const done = last.sets.filter(isRealized)
  if (!done.length || done.length < range.sets) return null
  if (!done.every((s) => (s.reps as number) >= range.repMax)) return null
  const top = Math.max(...done.map((s) => s.load ?? 0))
  const back = `et repartir à ${range.repMin} reps`
  switch (equipment) {
    case 'barre':
      return { text: `Fourchette atteinte : passer à ${fmtNum(top + 2.5)} kg (+2,5 kg) ${back}`, load: top + 2.5 }
    case 'haltères':
      return { text: `Fourchette atteinte : +1 à 2 kg par haltère (${fmtNum(top + 1)}–${fmtNum(top + 2)} kg) ${back}`, load: top + 1 }
    case 'machine':
    case 'poulie':
      return { text: `Fourchette atteinte : monter d’un palier (+${fmtNum(step)} kg environ) ${back}`, load: top + step }
    case 'poids de corps':
      return { text: `Fourchette atteinte : ajouter du lest (+1,25 à 2,5 kg) ${back}`, load: top + 2.5 }
    default:
      return { text: `Fourchette atteinte : +${fmtNum(step)} kg ${back}`, load: top + step }
  }
}

export function intensityHint(ex: Pick<Exercise, 'compound' | 'kind'>): string {
  if (ex.kind === 'check') return ''
  return ex.compound ? 'Cible : RPE 8-9 (1 à 2 reps en réserve)' : 'Cible : RPE 9-10 sur la dernière série'
}

// ---------- Deload ----------

/** Semaine allégée à proposer toutes les `deloadEvery` semaines. */
export function deloadDue(currentWeek: number, s: Pick<Settings, 'deloadEvery' | 'deloadWeeks' | 'deloadDismissedWeek'>): boolean {
  if (currentWeek < 1 || s.deloadDismissedWeek === currentWeek || s.deloadWeeks.includes(currentWeek)) return false
  const last = Math.max(0, ...s.deloadWeeks.filter((w) => w < currentWeek))
  return currentWeek - last >= s.deloadEvery
}

/** Charge allégée (~60 %) arrondie au pas. */
export function deloadLoad(load: number, step: number): number {
  const s = step > 0 ? step : 0.5
  return round2(Math.round((load * 0.6) / s) * s)
}

export const RPE_SCALE: { rpe: number; label: string }[] = [
  { rpe: 10, label: 'Échec, 0 rep en réserve' },
  { rpe: 9, label: '1 rep en réserve' },
  { rpe: 8, label: '2 reps en réserve' },
  { rpe: 7, label: '3 reps en réserve' },
  { rpe: 6, label: '4 reps en réserve' },
]

/** Validation d'un RPE saisi : nombre entre 6 et 10 (demi-points acceptés). */
export function validateRpe(v: number | null): string | null {
  if (v === null) return null
  if (!Number.isFinite(v)) return 'Le RPE doit être un nombre.'
  if (v < 6 || v > 10) return 'Le RPE doit être compris entre 6 et 10.'
  if (Math.round(v * 2) !== v * 2) return 'Le RPE accepte les demi-points (8 ou 8,5).'
  return null
}

export function validateReps(v: number | null): string | null {
  if (v === null) return null
  if (!Number.isInteger(v) || v < 0) return 'Les répétitions doivent être un entier positif.'
  if (v > 200) return 'Nombre de répétitions improbable.'
  return null
}

export function validateLoad(v: number | null): string | null {
  if (v === null) return null
  if (!Number.isFinite(v)) return 'La charge doit être un nombre (ex. 11,3).'
  if (v < 0 || v > 1000) return 'Charge hors limites.'
  return null
}

/** Numéros de série dupliqués dans un exercice. */
export function duplicateIndexes(entry: SessionEntry): number[] {
  const seen = new Set<number>(), dup = new Set<number>()
  for (const s of entry.sets) (seen.has(s.index) ? dup : seen).add(s.index)
  return [...dup]
}
