// Formats français : dates JJ/MM/AAAA, virgule décimale.
import type { ISODate } from './types'

const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** « 11,3 » → 11.3 ; accepte aussi le point. Renvoie null si vide, NaN si invalide. */
export function parseDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN
  const s = raw.trim().replace(/\s+/g, '').replace(/kg$/i, '')
  if (s === '') return null
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return NaN
  return Number(s.replace(',', '.'))
}

export function fmtNum(n: number | null | undefined, digits: 0 | 2 = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return (digits === 0 ? nf0 : nf2).format(n)
}

export function fmtKg(n: number | null | undefined, digits: 0 | 2 = 2): string {
  return n === null || n === undefined || !Number.isFinite(n) ? '—' : `${fmtNum(n, digits)} kg`
}

/** Arrondi à 2 décimales, pour éviter les 169.49999999. */
export const round2 = (n: number) => Math.round(n * 100) / 100

// ---------- Dates ----------

const pad = (n: number) => String(n).padStart(2, '0')

export function todayISO(d = new Date()): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function isValidISO(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return false
  return isRealDate(+m[1], +m[2], +m[3])
}

function isRealDate(y: number, mo: number, d: number): boolean {
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate()
}

export function fmtDate(iso: ISODate | null | undefined): string {
  if (!iso || !isValidISO(iso)) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

/** Analyse stricte d'une date JJ/MM/AAAA (ou AAAA-MM-JJ). */
export function parseFrDate(raw: string): ISODate | null {
  const s = raw.trim()
  if (isValidISO(s)) return s
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s)
  if (!m) return null
  const [d, mo, y] = [+m[1], +m[2], +m[3]]
  return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
}

/**
 * Tente de réparer une date mal saisie (« 05.09/2026 », « 12/010/2026 »,
 * « 5-9-26 »). Renvoie null si irrécupérable (« xx »).
 */
export function repairDate(raw: string): ISODate | null {
  const strict = parseFrDate(raw)
  if (strict) return strict
  const parts = raw.trim().split(/[^\d]+/).filter(Boolean)
  if (parts.length !== 3) return null
  let [d, mo, y] = parts.map((p) => parseInt(p, 10))
  if (parts[0].length === 4) [y, mo, d] = [d, mo, y]
  if (y < 100) y += 2000
  return isRealDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null
}

const dayNumber = (iso: ISODate) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

/** Lundi de la semaine contenant la date. */
export function mondayOf(iso: ISODate): number {
  const n = dayNumber(iso)
  const dow = (new Date(n * 86_400_000).getUTCDay() + 6) % 7 // 0 = lundi
  return n - dow
}

/**
 * Numéro de semaine du programme : semaine 1 = semaine (lundi → dimanche)
 * contenant la date de début. Peut être ≤ 0 pour une date antérieure.
 */
export function programWeek(date: ISODate, start: ISODate): number {
  return Math.floor((mondayOf(date) - mondayOf(start)) / 7) + 1
}

/** Lundi (ISO) de la semaine n du programme. */
export function weekStartISO(week: number, start: ISODate): ISODate {
  const d = new Date((mondayOf(start) + (week - 1) * 7) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const d = new Date((dayNumber(iso) + days) * 86_400_000)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${pad(s % 60)}`
}

/** Nom normalisé : espaces superflus retirés. */
export const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Clé de comparaison insensible à la casse, aux accents et aux espaces. */
export const nameKey = (s: string) =>
  cleanName(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

let counter = 0
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id-${Date.now().toString(36)}-${(counter++).toString(36)}`
}
