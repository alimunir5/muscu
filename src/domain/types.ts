// Modèle de données de l'application. Tout est stocké dans un seul objet
// AppData, stocké localement (voir src/db/vault.ts).

export type ID = string
/** Date calendaire locale au format ISO « AAAA-MM-JJ ». */
export type ISODate = string

export type Equipment = 'barre' | 'haltères' | 'machine' | 'poulie' | 'poids de corps' | 'autre'

/**
 * Calcul du volume pour un exercice :
 * - 'charge' : reps × charge saisie (lest pour le poids de corps)
 * - 'pdc'    : reps × (poids de corps + lest)
 * - 'aucun'  : pas de volume ni de 1RM (gainage, crunch…)
 */
export type VolumeMode = 'charge' | 'pdc' | 'aucun'

export interface MuscleGroup {
  id: ID
  name: string
  archived: boolean
}

export interface Exercise {
  id: ID
  name: string
  groupId: ID
  equipment: Equipment
  /** Polyarticulaire (cible RPE 8-9) ou isolation (RPE 9-10 sur la dernière série). */
  compound: boolean
  /** 'sets' = séries chiffrées ; 'check' = bloc à cocher (ex. Circuit Abdos). */
  kind: 'sets' | 'check'
  volumeMode: VolumeMode
  /** Exercice unilatéral saisi « par jambe / par bras » : volume compté ×2. */
  unilateral: boolean
  archived: boolean
}

export interface TemplateItem {
  id: ID
  exerciseId: ID
  /** Exercice de remplacement proposé (ex. Pushdown ↔ Extension overhead). */
  altExerciseId?: ID
  sets: number
  repMin: number
  repMax: number
  restSec: number
  /** Les items consécutifs portant le même identifiant forment un superset. */
  superset?: string
  note?: string
}

export interface Template {
  id: ID
  name: string
  items: TemplateItem[]
}

export interface SetEntry {
  id: ID
  /** N° de série (1, 2, 3…), unique au sein d'un exercice d'une séance. */
  index: number
  /** Répétitions prévues, texte libre : « 8 » ou « 5-8 ». */
  planned?: string
  reps: number | null
  /** Charge en kg (lest pour un exercice au poids de corps). */
  load: number | null
  rpe: number | null
  /** true quand la série a été validée (ou importée). */
  done: boolean
  /** Série marquée explicitement « non faite / abandonnée ». */
  abandoned?: boolean
  note: string
}

export interface SessionEntry {
  id: ID
  exerciseId: ID
  repMin?: number
  repMax?: number
  restSec: number
  superset?: string
  skipped?: boolean
  /** Pour les blocs « check ». */
  checked?: boolean
  note: string
  sets: SetEntry[]
}

export interface Session {
  id: ID
  date: ISODate
  /** Nom de la séance (« Haut A ») : copié du modèle, modifiable. */
  name: string
  templateId?: ID
  /** Numéro de semaine corrigé à la main ; sinon calculé depuis la date. */
  weekOverride?: number
  status: 'active' | 'done'
  deload?: 'charges' | 'series'
  note: string
  entries: SessionEntry[]
  /** Fin du minuteur de repos en cours (timestamp ms). */
  restEndsAt?: number
}

export interface BodyEntry {
  id: ID
  date: ISODate
  weight: number | null
  waist: number | null
  arm: number | null
  thigh: number | null
  chest: number | null
  note: string
}

export interface Settings {
  sessionsPerWeek: number
  weeklyVolumeGoal: number | null
  programStart: ISODate
  /** Ordre des séances du programme (ids de modèles). */
  templateOrder: ID[]
  trackedExerciseIds: ID[]
  /** Pas par défaut des boutons +/- selon le matériel. */
  loadSteps: Record<Equipment, number>
  sound: boolean
  vibrate: boolean
  notify: boolean
  deloadEvery: number
  /** Semaines de programme acceptées comme deload, et dernière proposition ignorée. */
  deloadWeeks: number[]
  deloadDismissedWeek: number | null
  lastExportAt: number | null
}

export interface AppData {
  version: 1
  groups: MuscleGroup[]
  exercises: Exercise[]
  templates: Template[]
  sessions: Session[]
  body: BodyEntry[]
  settings: Settings
}
