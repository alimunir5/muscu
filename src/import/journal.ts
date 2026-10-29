// Import tolérant du journal (CSV ou JSON) : chaque ligne est analysée,
// les problèmes sont signalés sans jamais interrompre l'import.
import { validateRpe } from '../domain/calc'
import { cleanName, nameKey, parseDecimal, parseFrDate, programWeek, repairDate, uid } from '../domain/format'
import type { AppData, Exercise, ID, ISODate, Session, SessionEntry } from '../domain/types'

export type Field = 'date' | 'week' | 'session' | 'exercise' | 'index' | 'planned' | 'reps' | 'load' | 'rpe' | 'note'

/** En-têtes reconnus (comparaison sans accents ni casse, début du libellé). */
const SYNONYMS: Record<Field, string[]> = {
  date: ['date'],
  week: ['semaine', 'sem', 'week'],
  session: ['seance', 'groupe', 'session'],
  exercise: ['exercice', 'nom de l', 'exercise'],
  index: ['serie', 'n° serie', 'no serie', 'set'],
  planned: ['reps prevues', 'repetitions prevues', 'prevu', 'planned'],
  reps: ['reps realisees', 'repetitions realisees', 'realise', 'reps'],
  load: ['charge', 'poids', 'load', 'kg'],
  rpe: ['rpe', 'rir'],
  note: ['notes', 'note', 'sensations', 'commentaire'],
}
/** Colonnes calculées par l'app : ignorées à l'import. */
const IGNORED = ['volume', '1rm', 'statut']

export interface Issue { level: 'error' | 'warning' | 'info'; field?: Field; message: string }

export interface ImportRow {
  line: number
  raw: Partial<Record<Field, string>>
  date: ISODate | null
  week: number | null
  session: string
  exercise: string
  index: number | null
  planned: string
  reps: number | null
  load: number | null
  rpe: number | null
  note: string
  issues: Issue[]
  ignored: boolean
}

export interface ParsedImport { rows: ImportRow[]; emptyLines: number; missingColumns: Field[]; unknownColumns: string[] }

// ---------- CSV ----------

export function detectDelimiter(firstLine: string): string {
  const counts = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length] as const)
  return counts.sort((a, b) => b[1] - a[1])[0][0]
}

/** Analyse CSV conforme RFC 4180 (guillemets, retours ligne dans les cellules). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delim = detectDelimiter(src.split(/\r?\n/, 1)[0] ?? '')
  const out: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === delim) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out
}

function matchHeader(h: string): Field | null | 'ignored' {
  const k = nameKey(h).replace(/\(.*\)/, '').trim()
  if (!k) return null
  if (IGNORED.some((i) => k.startsWith(i))) return 'ignored'
  // Les libellés les plus spécifiques d'abord (« reps prévues » avant « reps »).
  const order: Field[] = ['planned', 'reps', 'date', 'week', 'session', 'exercise', 'index', 'load', 'rpe', 'note']
  for (const f of order) if (SYNONYMS[f].some((s) => k.startsWith(s))) return f
  return null
}

/** Tableau de cellules (1re ligne = en-têtes) → lignes analysées. */
export function analyzeTable(table: string[][], programStart: ISODate): ParsedImport {
  const [header = [], ...body] = table
  const cols = new Map<Field, number>()
  const unknownColumns: string[] = []
  header.forEach((h, i) => {
    const f = matchHeader(h)
    if (f === 'ignored') return
    if (f && !cols.has(f)) cols.set(f, i)
    else if (h.trim()) unknownColumns.push(h.trim())
  })
  const missingColumns = (['date', 'exercise'] as Field[]).filter((f) => !cols.has(f))

  const rows: ImportRow[] = []
  let emptyLines = 0
  body.forEach((cells, i) => {
    if (cells.every((c) => !c || !c.trim())) { emptyLines++; return }
    const raw: Partial<Record<Field, string>> = {}
    for (const [f, idx] of cols) raw[f] = (cells[idx] ?? '').trim()
    rows.push(analyzeRow(raw, i + 2, programStart))
  })
  fixDuplicateIndexes(rows)
  return { rows, emptyLines, missingColumns, unknownColumns }
}

export function analyzeRow(raw: Partial<Record<Field, string>>, line: number, programStart: ISODate): ImportRow {
  const issues: Issue[] = []
  const r: ImportRow = {
    line, raw, issues, ignored: false,
    date: null, week: null, index: null, reps: null, load: null, rpe: null,
    session: cleanName(raw.session ?? ''), exercise: cleanName(raw.exercise ?? ''),
    planned: (raw.planned ?? '').trim(), note: (raw.note ?? '').trim(),
  }

  const d = raw.date ?? ''
  if (!d) issues.push({ level: 'error', field: 'date', message: 'Date manquante' })
  else {
    r.date = parseFrDate(d)
    if (!r.date) {
      r.date = repairDate(d)
      if (r.date) issues.push({ level: 'warning', field: 'date', message: `Date « ${d} » corrigée, à vérifier` })
      else issues.push({ level: 'error', field: 'date', message: `Date « ${d} » illisible` })
    }
  }

  if (!r.exercise) issues.push({ level: 'error', field: 'exercise', message: 'Exercice manquant' })
  if (!r.session) {
    r.session = 'Séance importée'
    issues.push({ level: 'info', field: 'session', message: 'Séance non renseignée : « Séance importée »' })
  }

  const w = raw.week ? parseDecimal(raw.week) : null
  if (w !== null && Number.isInteger(w) && w > 0 && w < 1000) r.week = w
  else if (raw.week) issues.push({ level: 'warning', field: 'week', message: `Semaine « ${raw.week} » invalide : recalculée depuis la date` })
  if (r.week === null && r.date) r.week = programWeek(r.date, programStart)

  const idx = raw.index ? parseDecimal(raw.index) : null
  if (idx !== null && Number.isInteger(idx) && idx > 0) r.index = idx
  else if (raw.index) issues.push({ level: 'warning', field: 'index', message: `N° de série « ${raw.index} » invalide : renuméroté` })

  const reps = raw.reps ? parseDecimal(raw.reps) : null
  if (reps !== null && Number.isInteger(reps) && reps >= 0) r.reps = reps
  else if (raw.reps) issues.push({ level: 'warning', field: 'reps', message: `Reps « ${raw.reps} » invalides : ignorées` })

  const load = raw.load ? parseDecimal(raw.load) : null
  if (load !== null && Number.isFinite(load) && load >= 0) r.load = load
  else if (raw.load) issues.push({ level: 'warning', field: 'load', message: `Charge « ${raw.load} » invalide : ignorée` })

  if (raw.rpe) {
    const v = parseDecimal(raw.rpe)
    if (v !== null && !validateRpe(v)) r.rpe = v
    else issues.push({ level: 'warning', field: 'rpe', message: `RPE « ${raw.rpe} » invalide (6 à 10) : ignoré` })
  }

  if (!r.reps && (raw.load || raw.planned) && !issues.some((i) => i.field === 'reps')) {
    issues.push({ level: 'info', field: 'reps', message: 'Série non réalisée : importée comme « non faite »' })
  }
  return r
}

const groupKey = (r: ImportRow) => `${r.date}|${nameKey(r.session)}|${nameKey(r.exercise)}`

/** Numéros de série manquants ou dupliqués : renumérotation et signalement. */
export function fixDuplicateIndexes(rows: ImportRow[]): void {
  const used = new Map<string, Set<number>>()
  for (const r of rows) {
    if (r.ignored) continue
    const set = used.get(groupKey(r)) ?? new Set<number>()
    used.set(groupKey(r), set)
    if (r.index !== null && set.has(r.index)) {
      const old = r.index
      r.index = null
      r.issues.push({ level: 'warning', field: 'index', message: `Série n° ${old} en double : renumérotée` })
    }
    if (r.index === null) {
      let n = 1
      while (set.has(n)) n++
      r.index = n
    }
    set.add(r.index)
  }
}

/** Applique la date de la ligne précédente aux lignes sans date valide. */
export function fillMissingDates(rows: ImportRow[], programStart: ISODate): number {
  let prev: ISODate | null = null, filled = 0
  for (const r of rows) {
    if (r.ignored) continue
    if (r.date) { prev = r.date; continue }
    if (!prev) continue
    r.date = prev
    r.issues = r.issues.filter((i) => !(i.field === 'date' && i.level === 'error'))
    r.issues.push({ level: 'warning', field: 'date', message: 'Date reprise de la ligne précédente' })
    if (r.week === null) r.week = programWeek(prev, programStart)
    filled++
  }
  return filled
}

/** Modifie la date d'une ligne depuis l'écran de correction. */
export function setRowDate(r: ImportRow, iso: ISODate, programStart: ISODate): void {
  r.date = iso
  r.issues = r.issues.filter((i) => i.field !== 'date')
  if (r.week === null || !r.raw.week) r.week = programWeek(iso, programStart)
}

export const hasError = (r: ImportRow) => r.issues.some((i) => i.level === 'error')

// ---------- JSON ----------

/** Tableau d'objets JSON aux mêmes clés que le CSV → tableau de cellules. */
export function jsonToTable(json: unknown): string[][] {
  const list = Array.isArray(json) ? json : (json as { rows?: unknown[] })?.rows
  if (!Array.isArray(list)) throw new Error('Le JSON doit être un tableau de lignes (ou { "rows": [...] }).')
  const headers = [...new Set(list.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))]
  return [headers, ...list.map((o) => headers.map((h) => {
    const v = (o as Record<string, unknown>)?.[h]
    return v === null || v === undefined ? '' : String(v)
  }))]
}

// ---------- Conversion en séances ----------

export interface ImportResult {
  sessions: Session[]
  newExercises: Exercise[]
  skippedSessions: string[]
  importedSets: number
}

/**
 * `mapping` : nom d'exercice (clé normalisée) → id existant, ou absent pour
 * créer l'exercice dans le groupe `fallbackGroupId`.
 */
export function buildSessions(rows: ImportRow[], data: AppData, mapping: Map<string, ID>, fallbackGroupId: ID): ImportResult {
  const exByKey = new Map(data.exercises.map((e) => [nameKey(e.name), e]))
  const newExercises: Exercise[] = []
  const resolve = (name: string, rowsOfEx: ImportRow[]): Exercise => {
    const k = nameKey(name)
    const mapped = mapping.get(k)
    const existing = (mapped && data.exercises.find((e) => e.id === mapped)) || exByKey.get(k)
    if (existing) return existing
    const noNumbers = rowsOfEx.every((r) => r.reps === null && r.load === null)
    const ex: Exercise = {
      id: uid(), name: cleanName(name), groupId: fallbackGroupId, equipment: 'autre', compound: false,
      kind: noNumbers ? 'check' : 'sets', volumeMode: noNumbers ? 'aucun' : 'charge', unilateral: false, archived: false,
    }
    exByKey.set(k, ex)
    newExercises.push(ex)
    return ex
  }

  const existingKeys = new Set(data.sessions.map((s) => `${s.date}|${nameKey(s.name)}`))
  const sessions = new Map<string, Session>()
  const skipped = new Set<string>()
  let importedSets = 0
  const valid = rows.filter((r) => !r.ignored && !hasError(r) && r.date)

  for (const r of valid) {
    const sKey = `${r.date}|${nameKey(r.session)}`
    if (existingKeys.has(sKey)) { skipped.add(`${r.session} du ${r.date}`); continue }
    let s = sessions.get(sKey)
    if (!s) {
      const computed = programWeek(r.date as ISODate, data.settings.programStart)
      s = {
        id: uid(), date: r.date as ISODate, name: r.session, status: 'done', note: '', entries: [],
        weekOverride: r.week !== null && r.week !== computed ? r.week : undefined,
      }
      sessions.set(sKey, s)
    }
    const ex = resolve(r.exercise, valid.filter((x) => nameKey(x.exercise) === nameKey(r.exercise)))
    let entry: SessionEntry | undefined = s.entries.find((e) => e.exerciseId === ex.id)
    if (!entry) {
      entry = { id: uid(), exerciseId: ex.id, restSec: 90, note: '', sets: [] }
      s.entries.push(entry)
    }
    if (ex.kind === 'check') {
      entry.checked = true
      if (r.note) entry.note = entry.note ? `${entry.note} · ${r.note}` : r.note
      continue
    }
    const realized = r.reps !== null && r.reps > 0
    entry.sets.push({
      id: uid(), index: r.index ?? entry.sets.length + 1, planned: r.planned || undefined,
      reps: r.reps, load: r.load, rpe: r.rpe, done: realized, abandoned: !realized, note: r.note,
    })
    importedSets++
  }
  for (const s of sessions.values()) for (const e of s.entries) e.sets.sort((a, b) => a.index - b.index)
  return { sessions: [...sessions.values()], newExercises, skippedSessions: [...skipped], importedSets }
}

/** Noms d'exercices du fichier absents de la bibliothèque. */
export function unknownExercises(rows: ImportRow[], data: AppData): string[] {
  const known = new Set(data.exercises.map((e) => nameKey(e.name)))
  const out = new Map<string, string>()
  for (const r of rows) if (!r.ignored && r.exercise && !known.has(nameKey(r.exercise))) out.set(nameKey(r.exercise), r.exercise)
  return [...out.values()]
}
