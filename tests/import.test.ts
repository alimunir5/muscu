import { describe, expect, it } from 'vitest'
import { flatten, sessionsDoneInWeek, weeklyVolume } from '../src/domain/calc'
import { analyzeTable, buildSessions, fillMissingDates, hasError, jsonToTable, parseCsv, unknownExercises } from '../src/import/journal'
import { initialData } from '../src/seed/initial'

const CSV = `﻿Date;Semaine;Séance;Exercice;Série;Reps prévues;Reps réalisées;Charge (kg);RPE;Volume (kg);1RM estimé (kg);Notes
02/11/2026;1;Haut A;Développé couché  haltères;1;8;8;20;8;160;25,33;
02/11/2026;1;Haut A;Développé couché haltères;1;8;8;20;abc;;;"mal à la nuque; à cause de la barre"
;;;;;;;;;;;
05.09/2026;1;Bas A;Squat barre;1;8;8;50;8;;;
12/010/2026;1;Bas A;Leg extension;1;10;10;39;9;;;
12/010/2026;1;Bas A;Leg extension;2;10;10;45;9;;;
xx;1;Bas A;Face pull;1;15;15;11,3;7;;;
03/11/2026;1;Bas B;Soulevé de terre;1;5;;100;;;;douleur dans le dos, j'arrête les jambes
03/11/2026;1;Bas B;Circuit Abdos;;;;;;;;fait
03/11/2026;1;Bas B;Mouvement inconnu;1;10;10;30;8;;;
`

describe('import CSV tolérant', () => {
  const data = initialData()
  data.settings.programStart = '2026-11-01'
  const parsed = analyzeTable(parseCsv(CSV), data.settings.programStart)

  it('ignore les lignes vides et les colonnes calculées', () => {
    expect(parsed.emptyLines).toBe(1)
    expect(parsed.rows).toHaveLength(9)
    expect(parsed.missingColumns).toEqual([])
    expect(parsed.unknownColumns).toEqual([])
  })

  it('signale les erreurs sans planter', () => {
    const [a, b, squat, leg1, , face, sdt] = parsed.rows
    expect(a.exercise).toBe('Développé couché haltères') // espaces normalisés
    expect(b.rpe).toBeNull()
    expect(b.issues.some((i) => i.field === 'rpe')).toBe(true)
    expect(b.note).toBe('mal à la nuque; à cause de la barre')
    expect(b.index).toBe(2) // série n°1 en double → renumérotée
    expect(b.issues.some((i) => i.message.includes('double'))).toBe(true)
    expect(squat.date).toBe('2026-09-05')
    expect(squat.issues[0].level).toBe('warning')
    expect(leg1.date).toBe('2026-10-12')
    expect(hasError(face)).toBe(true)
    expect(sdt.reps).toBeNull()
    expect(sdt.issues.some((i) => i.message.includes('non réalisée'))).toBe(true)
  })

  it('reprise de la date précédente sur demande', () => {
    const p = analyzeTable(parseCsv(CSV), data.settings.programStart)
    expect(fillMissingDates(p.rows, data.settings.programStart)).toBe(1)
    expect(p.rows[5].date).toBe('2026-10-12')
    expect(hasError(p.rows[5])).toBe(false)
  })

  it('conversion en séances avec semaines saisies et exercices inconnus', () => {
    expect(unknownExercises(parsed.rows, data)).toEqual(['Mouvement inconnu'])
    const res = buildSessions(parsed.rows, data, new Map(), data.groups[0].id)
    expect(res.newExercises.map((e) => e.name)).toEqual(['Mouvement inconnu'])
    // Haut A, Bas A 05/09, Bas A 12/10, Bas B ; Face pull exclue (date illisible)
    expect(res.sessions).toHaveLength(4)
    expect(res.sessions.filter((s) => s.name === 'Bas A')).toHaveLength(2)
    expect(res.importedSets).toBe(7)
    // Ré-importer le même fichier ne crée pas de doublons.
    data.exercises.push(...res.newExercises)
    data.sessions.push(...res.sessions)
    const again = buildSessions(parsed.rows, data, new Map(), data.groups[0].id)
    expect(again.sessions).toHaveLength(0)
    expect(again.skippedSessions).toHaveLength(4)
  })
})

describe('agrégats après import', () => {
  it('respecte le numéro de semaine saisi et la série non faite', () => {
    const data = initialData()
    data.settings.programStart = '2026-11-01'
    const p = analyzeTable(parseCsv(CSV), data.settings.programStart)
    const res = buildSessions(p.rows, data, new Map(), data.groups[0].id)
    data.exercises.push(...res.newExercises)
    data.sessions.push(...res.sessions)
    const rows = flatten(data)
    // Tout est saisi en semaine 1 : 160 + 160 + 400 + 390 + 450 + 300 (Mouvement inconnu) = 1860
    expect(weeklyVolume(rows).get(1)).toBe(1860)
    const sdt = rows.find((r) => r.exercise?.name === 'Soulevé de terre')!
    expect(sdt.set.abandoned).toBe(true)
    expect(sdt.volume).toBeNull()
    const circuit = res.sessions.flatMap((s) => s.entries).find((e) => e.checked)
    expect(circuit?.note).toBe('fait')
    expect(sessionsDoneInWeek(data, 1)).toBe(4) // Haut A 02/11, Bas A 05/09, Bas A 12/10, Bas B 03/11
  })

  it('import JSON aux mêmes clés', () => {
    const table = jsonToTable([{ Date: '02/11/2026', Séance: 'Haut A', Exercice: 'Squat barre', 'Reps réalisées': 8, Charge: '50' }])
    const p = analyzeTable(table, '2026-11-01')
    expect(p.rows[0]).toMatchObject({ reps: 8, load: 50, week: 2 })
  })
})

describe('fichier d’exemple du README', () => {
  it('docs/exemple-journal.csv s’importe sans erreur', async () => {
    const { readFileSync } = await import('node:fs')
    const data = initialData()
    const p = analyzeTable(parseCsv(readFileSync('docs/exemple-journal.csv', 'utf-8')), data.settings.programStart)
    expect(p.rows.filter(hasError)).toHaveLength(0)
    const res = buildSessions(p.rows, data, new Map(), data.groups[0].id)
    expect(res.sessions).toHaveLength(2)
    expect(res.newExercises).toHaveLength(0)
  })
})
