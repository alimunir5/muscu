// Sauvegarde complète (JSON, éventuellement chiffré) et exports CSV par table.
import { deriveKey, newKdfParams, openJSON, sealJSON, type KdfParams } from '../crypto/crypto'
import { flatten } from '../domain/calc'
import { fmtDate } from '../domain/format'
import type { AppData } from '../domain/types'
import { defaultSettings } from '../seed/initial'

export const EXPORT_FORMAT = 'muscu-export'

interface PlainExport { format: typeof EXPORT_FORMAT; version: 1; encrypted: false; exportedAt: string; data: AppData }
interface EncryptedExport { format: typeof EXPORT_FORMAT; version: 1; encrypted: true; exportedAt: string; kdf: KdfParams; iv: string; ct: string }
export type ExportFile = PlainExport | EncryptedExport

export async function buildExport(data: AppData, password?: string): Promise<string> {
  const exportedAt = new Date().toISOString()
  if (!password) {
    return JSON.stringify({ format: EXPORT_FORMAT, version: 1, encrypted: false, exportedAt, data } satisfies PlainExport, null, 1)
  }
  const kdf = newKdfParams()
  const sealed = await sealJSON(await deriveKey(password, kdf), data)
  return JSON.stringify({ format: EXPORT_FORMAT, version: 1, encrypted: true, exportedAt, kdf, ...sealed } satisfies EncryptedExport)
}

export function isBackupFile(json: unknown): json is ExportFile {
  return typeof json === 'object' && json !== null && (json as ExportFile).format === EXPORT_FORMAT
}

export class BackupPasswordError extends Error {}

/** Lit une sauvegarde complète ; `password` requis si elle est chiffrée. */
export async function readBackup(file: ExportFile, password?: string): Promise<AppData> {
  if (!file.encrypted) return normalizeData(file.data)
  if (!password) throw new BackupPasswordError('Cette sauvegarde est chiffrée : mot de passe requis.')
  try {
    return normalizeData(await openJSON<AppData>(await deriveKey(password, file.kdf), file))
  } catch {
    throw new BackupPasswordError('Mot de passe de sauvegarde incorrect ou fichier altéré.')
  }
}

/** Contrôle minimal de structure et complète les champs manquants. */
export function normalizeData(raw: unknown): AppData {
  const d = raw as Partial<AppData>
  if (!d || typeof d !== 'object' || !Array.isArray(d.exercises) || !Array.isArray(d.sessions)) {
    throw new Error('Fichier de sauvegarde invalide.')
  }
  return {
    version: 1,
    groups: d.groups ?? [],
    exercises: d.exercises,
    templates: d.templates ?? [],
    sessions: d.sessions,
    body: d.body ?? [],
    settings: { ...defaultSettings(), ...d.settings },
  }
}

// ---------- CSV (séparateur « ; », virgule décimale : s'ouvre tel quel dans Excel FR) ----------

const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

function csvCell(v: string | number | null | undefined): string {
  const s = typeof v === 'number' ? num(v) : (v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  // BOM pour qu'Excel détecte l'UTF-8 (accents).
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n')
}

export const JOURNAL_HEADERS = [
  'Date', 'Semaine', 'Séance', 'Exercice', 'Série', 'Reps prévues', 'Reps réalisées', 'Charge (kg)', 'RPE',
  'Volume (kg)', '1RM estimé (kg)', 'Statut', 'Notes',
]

export function journalCsv(data: AppData): string {
  const rows = flatten(data).sort((a, b) => a.session.date.localeCompare(b.session.date))
  return toCsv([
    JOURNAL_HEADERS,
    ...rows.map((r) => [
      fmtDate(r.session.date), r.week, r.session.name, r.exercise?.name ?? '?', r.set.index, r.set.planned ?? '',
      r.set.reps, r.set.load, r.set.rpe, r.volume, r.e1rm,
      r.set.abandoned ? 'abandonnée' : r.set.done ? 'faite' : 'non faite', r.set.note,
    ]),
    // Blocs « à cocher » (Circuit Abdos) : une ligne sans chiffres.
    ...data.sessions.flatMap((s) => s.entries.filter((e) => e.checked).map((e) => [
      fmtDate(s.date), '', s.name, data.exercises.find((x) => x.id === e.exerciseId)?.name ?? '?', '', '', '', '', '', '', '', 'faite', e.note,
    ])),
  ])
}

export function sessionsCsv(data: AppData): string {
  return toCsv([
    ['Date', 'Séance', 'Semaine corrigée', 'Note de séance'],
    ...data.sessions.filter((s) => s.status === 'done').map((s) => [fmtDate(s.date), s.name, s.weekOverride ?? '', s.note]),
  ])
}

export function bodyCsv(data: AppData): string {
  return toCsv([
    ['Date', 'Poids (kg)', 'Tour de taille (cm)', 'Tour de bras (cm)', 'Tour de cuisse (cm)', 'Tour de poitrine (cm)', 'Notes'],
    ...[...data.body].sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => [fmtDate(b.date), b.weight, b.waist, b.arm, b.thigh, b.chest, b.note]),
  ])
}

export function libraryCsv(data: AppData): string {
  const g = new Map(data.groups.map((x) => [x.id, x.name]))
  return toCsv([
    ['Groupe', 'Exercice', 'Matériel', 'Polyarticulaire', 'Volume', 'Unilatéral', 'Archivé'],
    ...data.exercises.map((e) => [g.get(e.groupId) ?? '', e.name, e.equipment, e.compound ? 'oui' : 'non', e.volumeMode, e.unilateral ? 'oui' : 'non', e.archived ? 'oui' : 'non']),
  ])
}
