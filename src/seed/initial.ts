// Données pré-chargées : bibliothèque d'exercices et programme Upper / Lower.
import { cleanName, nameKey, uid } from '../domain/format'
import type { AppData, Equipment, Exercise, Settings, Template, TemplateItem, VolumeMode } from '../domain/types'

type Def = [name: string, equipment: Equipment, compound: boolean, extra?: Partial<Pick<Exercise, 'volumeMode' | 'unilateral' | 'kind'>>]

const PDC: Partial<Exercise> = { volumeMode: 'pdc' as VolumeMode }
const NOVOL: Partial<Exercise> = { volumeMode: 'aucun' as VolumeMode }

const LIBRARY: Record<string, Def[]> = {
  Pectoraux: [
    ['Développé couché barre', 'barre', true],
    ['Développé couché haltères', 'haltères', true],
    ['Développé incliné haltères', 'haltères', true],
    ['Dips lestés', 'poids de corps', true, PDC],
    ['Écarté couché haltères', 'haltères', false],
    ['Cable fly', 'poulie', false],
  ],
  Dos: [
    ['Tractions lestées', 'poids de corps', true, PDC],
    ['Tractions supination', 'poids de corps', true, PDC],
    ['Rowing barre', 'barre', true],
    ['Tirage horizontal', 'poulie', true],
    ['Tirage vertical', 'poulie', true],
    ['Soulevé de terre', 'barre', true],
    ['Face pull', 'poulie', false],
  ],
  Jambes: [
    ['Squat barre', 'barre', true],
    ['Presse à cuisses', 'machine', true],
    ['Fentes haltères', 'haltères', true],
    ['Fentes bulgares', 'haltères', true, { unilateral: true }],
    ['Soulevé de terre roumain', 'barre', true],
    ['Leg curl', 'machine', false],
    ['Leg curl assis', 'machine', false],
    ['Leg extension', 'machine', false],
    ['Hip thrust', 'barre', true],
  ],
  Mollets: [
    ['Mollets debout', 'machine', false],
    ['Mollets assis', 'machine', false],
  ],
  Épaules: [
    ['Développé militaire barre', 'barre', true],
    ['Développé haltères assis', 'haltères', true],
    ['Élévations latérales', 'haltères', false],
    ['Élévations frontales', 'haltères', false],
    ['Oiseau (élévations arrière)', 'haltères', false],
  ],
  Bras: [
    ['Curl biceps barre', 'barre', false],
    ['Curl biceps haltères incliné', 'haltères', false],
    ['Curl marteau', 'haltères', false],
    ['Extension triceps poulie overhead', 'poulie', false],
    ['Barre au front', 'barre', false],
    ['Pushdown triceps', 'poulie', false],
  ],
  Abdominaux: [
    ['Gainage (planche)', 'poids de corps', false, NOVOL],
    ['Crunch', 'poids de corps', false, NOVOL],
    ['Relevé de jambes', 'poids de corps', false, NOVOL],
    ['Relevé de jambes suspendu', 'poids de corps', false, NOVOL],
    ['Russian twist', 'poids de corps', false, NOVOL],
    ['Ab wheel', 'poids de corps', false, NOVOL],
    ['Circuit Abdos', 'autre', false, { ...NOVOL, kind: 'check' }],
  ],
}

// [exercice, séries, repMin, repMax, repos (s), options]
type LineOpts = Partial<Pick<TemplateItem, 'superset' | 'note'>> & { alt?: string }
type Line = [string, number, number, number, number, LineOpts?]

const PROGRAM: Record<string, Line[]> = {
  'Haut A': [
    ['Développé couché barre', 4, 5, 8, 150],
    ['Rowing barre', 4, 6, 8, 120],
    ['Développé militaire barre', 3, 6, 10, 120],
    ['Tractions supination', 3, 6, 10, 120],
    ['Pushdown triceps', 3, 10, 12, 90, { alt: 'Extension triceps poulie overhead' }],
    ['Curl biceps barre', 3, 10, 12, 90],
  ],
  'Bas A': [
    ['Squat barre', 4, 5, 8, 150],
    ['Soulevé de terre roumain', 3, 8, 10, 120],
    ['Fentes bulgares', 3, 8, 10, 90, { note: 'Reps par jambe' }],
    ['Leg curl', 3, 10, 12, 90],
    ['Mollets debout', 4, 10, 15, 60],
    ['Relevé de jambes suspendu', 3, 10, 15, 60],
  ],
  'Haut B': [
    ['Développé incliné haltères', 4, 6, 10, 120],
    ['Tirage vertical', 4, 8, 10, 120],
    ['Dips lestés', 3, 6, 10, 120],
    ['Tirage horizontal', 3, 10, 12, 90],
    ['Élévations latérales', 3, 12, 15, 60],
    ['Curl marteau', 3, 10, 12, 90, { superset: 'ss-bras', note: 'Superset avec l’extension overhead' }],
    ['Extension triceps poulie overhead', 3, 10, 12, 90, { superset: 'ss-bras', note: 'Repos 1 min 30 après la paire' }],
  ],
  'Bas B': [
    ['Soulevé de terre', 3, 4, 6, 180],
    ['Hip thrust', 4, 8, 10, 120],
    ['Presse à cuisses', 3, 10, 12, 120],
    ['Leg curl assis', 3, 10, 12, 90],
    ['Mollets assis', 4, 12, 15, 60],
    ['Ab wheel', 3, 10, 12, 60],
  ],
}

export const DEFAULT_TRACKED = ['Squat barre', 'Développé couché barre', 'Soulevé de terre', 'Développé militaire barre']

export function defaultSettings(): Settings {
  return {
    sessionsPerWeek: 4,
    weeklyVolumeGoal: null,
    programStart: '2026-11-01',
    templateOrder: [],
    trackedExerciseIds: [],
    loadSteps: { barre: 2.5, haltères: 1, machine: 1, poulie: 1, 'poids de corps': 1, autre: 1 },
    sound: true,
    vibrate: true,
    notify: false,
    deloadEvery: 7,
    deloadWeeks: [],
    deloadDismissedWeek: null,
    lastExportAt: null,
  }
}

export function initialData(): AppData {
  const data: AppData = { version: 1, groups: [], exercises: [], templates: [], sessions: [], body: [], settings: defaultSettings() }
  for (const [group, defs] of Object.entries(LIBRARY)) {
    const groupId = uid()
    data.groups.push({ id: groupId, name: group, archived: false })
    for (const [name, equipment, compound, extra] of defs) {
      data.exercises.push({
        id: uid(), name: cleanName(name), groupId, equipment, compound,
        kind: 'sets', volumeMode: 'charge', unilateral: false, archived: false, ...extra,
      })
    }
  }
  const byName = new Map(data.exercises.map((e) => [nameKey(e.name), e.id]))
  const idOf = (n: string) => {
    const id = byName.get(nameKey(n))
    if (!id) throw new Error(`Exercice inconnu dans le programme : ${n}`)
    return id
  }
  for (const [name, lines] of Object.entries(PROGRAM)) {
    const t: Template = {
      id: uid(), name,
      items: lines.map(([ex, sets, repMin, repMax, restSec, opt]) => ({
        id: uid(), exerciseId: idOf(ex), sets, repMin, repMax, restSec,
        superset: opt?.superset, note: opt?.note, altExerciseId: opt?.alt ? idOf(opt.alt) : undefined,
      })),
    }
    data.templates.push(t)
  }
  data.settings.templateOrder = data.templates.map((t) => t.id)
  data.settings.trackedExerciseIds = DEFAULT_TRACKED.map(idOf)
  return data
}
