// Création d'une séance à partir d'un modèle, pré-remplie avec la dernière fois.
import { deloadLoad, isRealized, lastPerformance } from './calc'
import { uid } from './format'
import type { AppData, Exercise, ID, ISODate, Session, SessionEntry, SetEntry, TemplateItem } from './types'

export const stepFor = (data: AppData, ex: Exercise | undefined) => (ex ? data.settings.loadSteps[ex.equipment] ?? 1 : 1)

const rangeLabel = (min?: number, max?: number) =>
  min === undefined ? undefined : max !== undefined && max !== min ? `${min}-${max}` : String(min)

export function newSet(index: number, prefill: Partial<SetEntry> = {}): SetEntry {
  return { id: uid(), index, reps: null, load: null, rpe: null, done: false, note: '', ...prefill }
}

/** Entrée de séance pour un exercice, séries pré-remplies d'après la dernière fois. */
export function buildEntry(
  data: AppData, exerciseId: ID, item: Partial<TemplateItem> | undefined,
  opts: { templateId?: ID; deload?: Session['deload'] } = {},
): SessionEntry {
  const ex = data.exercises.find((e) => e.id === exerciseId)
  const last = lastPerformance(data, exerciseId, { templateId: opts.templateId })
  const lastSets = last?.entry.sets.filter(isRealized) ?? []
  let count = item?.sets ?? (lastSets.length || 3)
  if (opts.deload === 'series') count = Math.max(1, Math.ceil(count / 2))
  const step = stepFor(data, ex)
  const planned = rangeLabel(item?.repMin, item?.repMax)

  const sets: SetEntry[] = ex?.kind === 'check' ? [] : Array.from({ length: count }, (_, i) => {
    const ref = lastSets[i] ?? lastSets[lastSets.length - 1]
    let load = ref?.load ?? null
    if (load !== null && opts.deload === 'charges') load = deloadLoad(load, step)
    return newSet(i + 1, { planned, load, reps: ref?.reps ?? item?.repMin ?? null })
  })
  return {
    id: uid(), exerciseId, repMin: item?.repMin, repMax: item?.repMax,
    restSec: item?.restSec ?? 90, superset: item?.superset, note: '', sets,
  }
}

export function startSession(
  data: AppData, templateId: ID | null, date: ISODate, deload?: Session['deload'],
): Session {
  const t = templateId ? data.templates.find((x) => x.id === templateId) : undefined
  return {
    id: uid(), date, name: t?.name ?? 'Séance libre', templateId: t?.id, status: 'active', note: '', deload,
    entries: (t?.items ?? []).map((item) => buildEntry(data, item.exerciseId, item, { templateId: t?.id, deload })),
  }
}

/** Séries réalisées ou terminées (faites, abandonnées) / séries prévues, exercices sautés exclus. */
export function sessionProgress(s: Session): { done: number; total: number } {
  let done = 0, total = 0
  for (const e of s.entries) {
    if (e.skipped) continue
    if (!e.sets.length) { total++; if (e.checked) done++; continue }
    total += e.sets.length
    done += e.sets.filter((x) => x.done || x.abandoned).length
  }
  return { done, total }
}

/** Le repos se déclenche après la série, sauf au milieu d'un superset. */
export function restAfter(s: Session, entryId: ID): number | null {
  const i = s.entries.findIndex((e) => e.id === entryId)
  const e = s.entries[i]
  if (!e) return null
  const next = s.entries[i + 1]
  if (e.superset && next && next.superset === e.superset && !next.skipped) return null
  return e.restSec
}

/** Prochain n° de série libre. */
export const nextIndex = (e: SessionEntry) => Math.max(0, ...e.sets.map((s) => s.index)) + 1

export { isRealized }
