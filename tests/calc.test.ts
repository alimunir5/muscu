import { describe, expect, it } from 'vitest'
import {
  bestE1rm, completion, deloadDue, deloadLoad, detectPRs, flatten, progressionSuggestion, sessionsDoneInWeek,
  setMetrics, totalVolume, validateRpe, weeklyBestE1rm, weeklyVolume, weekRange,
} from '../src/domain/calc'
import { addDaysISO, fmtDate, parseDecimal, parseFrDate, programWeek, repairDate } from '../src/domain/format'
import type { AppData, Exercise, Session, SetEntry } from '../src/domain/types'
import { initialData } from '../src/seed/initial'

const charge: Pick<Exercise, 'volumeMode' | 'unilateral'> = { volumeMode: 'charge', unilateral: false }
const set = (reps: number | null, load: number | null, extra: Partial<SetEntry> = {}): SetEntry =>
  ({ id: Math.random().toString(36), index: 1, reps, load, rpe: null, done: true, note: '', ...extra })

describe('volume et 1RM (exemples de l’Excel)', () => {
  it('Développé couché haltères 8 × 20 kg', () => {
    expect(setMetrics(set(8, 20), charge)).toMatchObject({ volume: 160, e1rm: 25.33 })
  })
  it('Squat barre 8 × 50 kg', () => {
    expect(setMetrics(set(8, 50), charge)).toMatchObject({ volume: 400, e1rm: 63.33 })
  })
  it('Face pull 15 × 11,3 kg', () => {
    expect(setMetrics(set(15, parseDecimal('11,3')), charge)).toMatchObject({ volume: 169.5, e1rm: 16.95 })
  })
  it('série vide, à 0 rep, sans charge ou non validée : aucune valeur (pas de 0)', () => {
    for (const s of [set(null, 50), set(0, 50), set(8, null), set(8, 0), set(8, 50, { done: false }), set(8, 50, { abandoned: true })]) {
      expect(setMetrics(s, charge)).toEqual({ volume: null, e1rm: null, load: null })
    }
  })
  it('poids de corps : lest seul, PDC + lest, ou pas de volume', () => {
    expect(setMetrics(set(10, 0), { volumeMode: 'pdc', unilateral: false }, 78.4).volume).toBe(784)
    expect(setMetrics(set(10, 5), { volumeMode: 'pdc', unilateral: false }, 78.4).volume).toBe(834)
    expect(setMetrics(set(10, 5), charge).volume).toBe(50)
    expect(setMetrics(set(10, 5), { volumeMode: 'aucun', unilateral: false }).volume).toBeNull()
  })
  it('unilatéral : volume ×2, 1RM inchangé', () => {
    expect(setMetrics(set(8, 20), { volumeMode: 'charge', unilateral: true })).toMatchObject({ volume: 320, e1rm: 25.33 })
  })
})

describe('formats français', () => {
  it('virgule décimale', () => {
    expect(parseDecimal('13,5')).toBe(13.5)
    expect(parseDecimal(' 15.8 ')).toBe(15.8)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNaN()
  })
  it('dates JJ/MM/AAAA', () => {
    expect(parseFrDate('05/09/2026')).toBe('2026-09-05')
    expect(parseFrDate('31/02/2026')).toBeNull()
    expect(fmtDate('2026-11-01')).toBe('01/11/2026')
  })
  it('réparation des dates mal saisies', () => {
    expect(repairDate('05.09/2026')).toBe('2026-09-05')
    expect(repairDate('12/010/2026')).toBe('2026-10-12')
    expect(repairDate('xx')).toBeNull()
    expect(repairDate('')).toBeNull()
  })
  it('semaines du lundi au dimanche à partir du début de programme', () => {
    // Le 01/11/2026 est un dimanche : la semaine 1 va du lundi 26/10 au dimanche 01/11.
    expect(programWeek('2026-11-01', '2026-11-01')).toBe(1)
    expect(programWeek('2026-10-26', '2026-11-01')).toBe(1)
    expect(programWeek('2026-11-02', '2026-11-01')).toBe(2)
    expect(programWeek('2026-11-08', '2026-11-01')).toBe(2)
    expect(programWeek('2026-11-09', '2026-11-01')).toBe(3)
    expect(programWeek('2026-10-25', '2026-11-01')).toBe(0)
  })
})

function mkSession(data: AppData, date: string, name: string, sets: SetEntry[], exName = 'Squat barre', extra: Partial<Session> = {}): Session {
  const ex = data.exercises.find((e) => e.name === exName)!
  const s: Session = {
    id: Math.random().toString(36), date, name, status: 'done', note: '',
    entries: [{ id: 'e', exerciseId: ex.id, restSec: 90, note: '', sets }], ...extra,
  }
  data.sessions.push(s)
  return s
}

describe('agrégats par semaine', () => {
  const data = initialData()
  data.settings.programStart = '2026-11-02' // un lundi
  mkSession(data, '2026-11-02', 'Bas A', [set(8, 50), set(8, 50, { index: 2 })])
  mkSession(data, '2026-11-04', 'Haut A', [set(8, 20)], 'Développé couché haltères')
  // Même date + même séance saisie en deux fois : une seule séance distincte.
  mkSession(data, '2026-11-04', 'Haut A', [set(15, 11.3)], 'Face pull')
  // Séance non réalisée (série abandonnée) : ne compte pas.
  mkSession(data, '2026-11-06', 'Bas B', [set(0, 100, { note: 'douleur dans le dos' })], 'Soulevé de terre')
  // Semaine 3 avec numéro corrigé à la main en semaine 2.
  mkSession(data, '2026-11-16', 'Bas B', [set(5, 60)], 'Squat barre', { weekOverride: 2 })
  // Semaine 5 (aucune donnée en semaine 3 et 4).
  mkSession(data, '2026-11-30', 'Bas A', [set(5, 70)])
  const rows = flatten(data)

  it('volume par semaine à partir du numéro de semaine (saisi ou calculé)', () => {
    const v = weeklyVolume(rows)
    expect(v.get(1)).toBe(800 + 160 + 169.5)
    expect(v.get(2)).toBe(300)
    expect(v.has(3)).toBe(false) // pas de zéro trompeur
    expect(v.get(5)).toBe(350)
    expect(totalVolume(rows)).toBe(1779.5)
  })
  it('séances distinctes réalisées : entier correct', () => {
    expect(sessionsDoneInWeek(data, 1)).toBe(2)
    expect(sessionsDoneInWeek(data, 2)).toBe(1)
    expect(sessionsDoneInWeek(data, 3)).toBe(0)
  })
  it('taux de réalisation plafonné', () => {
    expect(completion(3, 4)).toMatchObject({ pct: 75, label: '3/4', extra: 0 })
    expect(completion(5, 4)).toMatchObject({ pct: 100, label: '5/4', extra: 1 })
    expect(completion(0, 0).pct).toBe(0)
  })
  it('meilleur 1RM global et par semaine', () => {
    const squat = data.exercises.find((e) => e.name === 'Squat barre')!.id
    expect(bestE1rm(rows, squat)?.e1rm).toBe(81.67)
    const w = weeklyBestE1rm(rows, squat)
    expect(w.get(1)).toBe(63.33)
    expect(w.get(2)).toBe(70)
    expect(weekRange(w.keys())).toEqual([1, 2, 3, 4, 5])
  })
})

describe('records, progression, deload, validation', () => {
  it('détection des records', () => {
    const prev = [{ set: set(8, 50), load: 50, e1rm: 63.33 }]
    expect(detectPRs(prev, { set: set(10, 50), load: 50, e1rm: 66.67 })).toEqual(['e1rm', 'reps'])
    expect(detectPRs(prev, { set: set(3, 55), load: 55, e1rm: 60.5 })).toEqual(['load'])
    expect(detectPRs([], { set: set(3, 55), load: 55, e1rm: 60.5 })).toEqual([])
  })
  it('double progression', () => {
    const entry = { id: 'e', exerciseId: 'x', restSec: 0, note: '', sets: [set(8, 50), set(8, 50), set(8, 50), set(8, 50)] }
    expect(progressionSuggestion(entry, 'barre', { repMin: 5, repMax: 8, sets: 4 }, 2.5)?.load).toBe(52.5)
    entry.sets[3].reps = 7
    expect(progressionSuggestion(entry, 'barre', { repMin: 5, repMax: 8, sets: 4 }, 2.5)).toBeNull()
  })
  it('deload toutes les N semaines', () => {
    const s = { deloadEvery: 7, deloadWeeks: [] as number[], deloadDismissedWeek: null }
    expect(deloadDue(6, s)).toBe(false)
    expect(deloadDue(7, s)).toBe(true)
    expect(deloadDue(7, { ...s, deloadDismissedWeek: 7 })).toBe(false)
    expect(deloadDue(10, { ...s, deloadWeeks: [7] })).toBe(false)
    expect(deloadDue(14, { ...s, deloadWeeks: [7] })).toBe(true)
    expect(deloadLoad(100, 2.5)).toBe(60)
    expect(deloadLoad(52.5, 2.5)).toBe(32.5)
  })
  it('validation RPE', () => {
    expect(validateRpe(8)).toBeNull()
    expect(validateRpe(8.5)).toBeNull()
    expect(validateRpe(11)).not.toBeNull()
    expect(validateRpe(NaN)).not.toBeNull()
  })
  it('bibliothèque initiale : noms normalisés, programme complet', () => {
    const d = initialData()
    expect(d.exercises.every((e) => e.name === e.name.replace(/\s+/g, ' ').trim())).toBe(true)
    expect(d.templates.map((t) => t.name)).toEqual(['Haut A', 'Bas A', 'Haut B', 'Bas B'])
    expect(d.settings.trackedExerciseIds).toHaveLength(4)
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
  })
})
