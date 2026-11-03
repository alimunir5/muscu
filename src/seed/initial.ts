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
    ['Tractions prise neutre', 'poids de corps', true, PDC],
    ['Rowing haltère un bras', 'haltères', true, { unilateral: true }],
  ],
  Jambes: [
    ['Squat barre', 'barre', true],
    ['Presse à cuisses', 'machine', true],
    ['Fentes haltères', 'haltères', true],
    ['Fentes marchées haltères', 'haltères', true, { unilateral: true }],
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
    ['Développé militaire haltères', 'haltères', true],
    ['Élévations latérales', 'haltères', false],
    ['Élévations frontales', 'haltères', false],
    ['Oiseau (élévations arrière)', 'haltères', false],
  ],
  Bras: [
    ['Curl biceps barre', 'barre', false],
    ['Curl barre EZ', 'barre', false],
    ['Curl biceps haltères incliné', 'haltères', false],
    ['Curl marteau', 'haltères', false],
    ['Extension triceps poulie overhead', 'poulie', false],
    ['Barre au front', 'barre', false],
    ['Pushdown triceps', 'poulie', false],
  ],
  Abdominaux: [
    ['Gainage (planche)', 'poids de corps', false, NOVOL],
    ['Crunch', 'poids de corps', false, NOVOL],
    ['Crunch à la poulie', 'poulie', false],
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

/**
 * Version du programme pré-chargé. À incrémenter quand PROGRAM change :
 * les données existantes sont alors mises à jour une fois au démarrage
 * (voir applyProgram), sans toucher à l'historique.
 * 1 = ancien programme ; 2 = Upper / Lower 4 jours (prise de masse).
 */
export const PROGRAM_REVISION = 2

// Planning : lundi = Haut A, mardi = Bas A, jeudi = Haut B, vendredi = Bas B.
const PROGRAM: { name: string; day: number; lines: Line[] }[] = [
  { name: 'Haut A', day: 1, lines: [
    ['Développé couché barre', 4, 5, 8, 150, { note: 'Repos 2 à 3 min' }],
    ['Rowing barre', 4, 6, 10, 120, { note: 'Buste penché' }],
    ['Développé militaire haltères', 3, 8, 10, 120],
    ['Tractions lestées', 3, 6, 10, 120, { note: 'Lestées si possible' }],
    ['Élévations latérales', 3, 12, 15, 60],
    ['Curl barre EZ', 3, 8, 12, 90],
    ['Pushdown triceps', 3, 10, 12, 90, { note: 'Extensions triceps à la poulie haute' }],
  ] },
  { name: 'Bas A', day: 2, lines: [
    ['Squat barre', 4, 5, 8, 180],
    ['Soulevé de terre roumain', 3, 8, 10, 150],
    ['Hip thrust', 3, 8, 12, 120, { note: 'À la barre' }],
    ['Fentes marchées haltères', 3, 10, 12, 90, { note: 'Reps par jambe' }],
    ['Mollets debout', 4, 10, 15, 60],
    ['Crunch à la poulie', 3, 10, 15, 60],
  ] },
  { name: 'Haut B', day: 4, lines: [
    ['Développé incliné haltères', 4, 8, 10, 120],
    ['Tractions prise neutre', 4, 8, 10, 120, { alt: 'Tirage vertical' }],
    ['Rowing haltère un bras', 3, 8, 12, 90, { note: 'Reps par bras' }],
    ['Dips lestés', 3, 8, 12, 120, { note: 'Lestés si possible' }],
    ['Oiseau (élévations arrière)', 3, 12, 15, 60],
    ['Curl marteau', 3, 10, 12, 90],
    ['Barre au front', 3, 10, 12, 90, { note: 'Skull crushers' }],
  ] },
  { name: 'Bas B', day: 5, lines: [
    ['Soulevé de terre', 4, 4, 6, 180, { note: 'Conventionnel ou trap bar' }],
    ['Fentes bulgares', 3, 8, 10, 120, { note: 'Squat bulgare haltères, reps par jambe' }],
    ['Hip thrust', 3, 10, 12, 120],
    ['Leg curl', 3, 10, 12, 90, { alt: 'Leg curl assis', note: 'Allongé ou assis' }],
    ['Mollets assis', 4, 12, 15, 60],
    ['Relevé de jambes suspendu', 3, 8, 15, 60],
  ] },
]

/** Règles de progression du programme, affichées dans Réglages → Programme. */
export const PROGRESSION_RULES = [
  'Double progression : quand toutes les séries atteignent le haut de la fourchette de reps, augmenter la charge de 2,5 kg (1 à 2 kg pour les haltères).',
  'Finir chaque série à 1-2 reps de l’échec (RPE 8-9).',
  'Deload toutes les 6-8 semaines : 2 séries au lieu de 3-4, charges réduites d’environ 10 %.',
]

export const DEFAULT_TRACKED = ['Squat barre', 'Développé couché barre', 'Soulevé de terre', 'Développé militaire haltères']

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
    programRevision: PROGRAM_REVISION,
  }
}

function newExercise(data: AppData, name: string, groupId: string, [, equipment, compound, extra]: Def): Exercise {
  const ex: Exercise = {
    id: uid(), name: cleanName(name), groupId, equipment, compound,
    kind: 'sets', volumeMode: 'charge', unilateral: false, archived: false, ...extra,
  }
  data.exercises.push(ex)
  return ex
}

export function initialData(): AppData {
  const data: AppData = { version: 1, groups: [], exercises: [], templates: [], sessions: [], body: [], settings: defaultSettings() }
  for (const [group, defs] of Object.entries(LIBRARY)) {
    const groupId = uid()
    data.groups.push({ id: groupId, name: group, archived: false })
    for (const def of defs) newExercise(data, def[0], groupId, def)
  }
  applyProgram(data)
  const byName = new Map(data.exercises.map((e) => [nameKey(e.name), e.id]))
  data.settings.trackedExerciseIds = DEFAULT_TRACKED.map((n) => byName.get(nameKey(n))!)
  return data
}

/**
 * Remplace le programme (modèles de séance listés dans l'ordre du programme)
 * par PROGRAM. L'historique (séances, mesures, autres réglages) n'est pas
 * modifié : un modèle de même nom garde son identifiant pour rester lié aux
 * séances passées ; les exercices existants sont réutilisés (même historique
 * de charges) et seuls les manquants sont ajoutés à la bibliothèque.
 */
export function applyProgram(data: AppData): void {
  const exByName = new Map(data.exercises.map((e) => [nameKey(e.name), e]))
  const idOf = (n: string) => {
    let ex = exByName.get(nameKey(n))
    if (!ex) {
      const entry = Object.entries(LIBRARY).find(([, defs]) => defs.some((d) => nameKey(d[0]) === nameKey(n)))
      if (!entry) throw new Error(`Exercice inconnu dans le programme : ${n}`)
      const [groupName, defs] = entry
      let group = data.groups.find((g) => nameKey(g.name) === nameKey(groupName))
      if (!group) data.groups.push((group = { id: uid(), name: groupName, archived: false }))
      ex = newExercise(data, n, group.id, defs.find((d) => nameKey(d[0]) === nameKey(n))!)
      exByName.set(nameKey(n), ex)
    }
    ex.archived = false
    return ex.id
  }

  const old = data.settings.templateOrder
    .map((id) => data.templates.find((t) => t.id === id))
    .filter((t): t is Template => !!t)
  const order: string[] = []
  for (const { name, day, lines } of PROGRAM) {
    const items: TemplateItem[] = lines.map(([ex, sets, repMin, repMax, restSec, opt]) => ({
      id: uid(), exerciseId: idOf(ex), sets, repMin, repMax, restSec,
      superset: opt?.superset, note: opt?.note, altExerciseId: opt?.alt ? idOf(opt.alt) : undefined,
    }))
    let t = old.find((x) => nameKey(x.name) === nameKey(name) && !order.includes(x.id))
    if (t) Object.assign(t, { name, day, items })
    else data.templates.push((t = { id: uid(), name, day, items }))
    order.push(t.id)
  }
  // Anciens modèles du programme non repris : retirés, comme une suppression manuelle
  // (les séances déjà réalisées restent dans l'historique).
  const dropped = new Set(old.map((t) => t.id).filter((id) => !order.includes(id)))
  data.templates = data.templates.filter((t) => !dropped.has(t.id))
  data.settings.templateOrder = order
  data.settings.sessionsPerWeek = PROGRAM.length
  data.settings.programRevision = PROGRAM_REVISION
}
