// Import : restauration d'une sauvegarde JSON, ou import du journal (CSV / JSON)
// avec aperçu, signalement des erreurs et correction avant validation.
import { useState } from 'preact/hooks'
import { cleanName, fmtDate, fmtNum, nameKey, parseDecimal, parseFrDate, repairDate, uid } from '../../domain/format'
import type { AppData, BodyEntry, ID } from '../../domain/types'
import { BackupPasswordError, isBackupFile, readBackup } from '../../db/backup'
import {
  analyzeTable, buildSessions, fillMissingDates, hasError, jsonToTable, parseCsv, setRowDate, unknownExercises,
  type ImportRow, type ParsedImport,
} from '../../import/journal'
import { Icon, TopBar } from '../components/common'
import { confirmDialog, promptDialog, toast } from '../dialogs'
import { back, go } from '../router'
import { D, mutate } from '../store'

type Stage =
  | { kind: 'pick' }
  | { kind: 'backup'; data: AppData; name: string }
  | { kind: 'journal'; parsed: ParsedImport; name: string }
  | { kind: 'body'; rows: BodyRow[]; name: string }

interface BodyRow { line: number; entry: BodyEntry; issues: string[]; ignored: boolean }

export function ImportScreen() {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const start = D().settings.programStart

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      const text = await file.text()
      const trimmed = text.replace(/^﻿/, '').trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const json = JSON.parse(trimmed)
        if (isBackupFile(json)) {
          let pw: string | undefined
          if (json.encrypted) {
            pw = (await promptDialog('Sauvegarde chiffrée', 'Mot de passe de la sauvegarde', '', { type: 'password' })) ?? undefined
            if (!pw) return
          }
          return setStage({ kind: 'backup', data: await readBackup(json, pw), name: file.name })
        }
        return setStage({ kind: 'journal', parsed: analyzeTable(jsonToTable(json), start), name: file.name })
      }
      const table = parseCsv(text)
      const header = (table[0] ?? []).map(nameKey)
      if (!header.some((h) => h.startsWith('exercice')) && header.some((h) => h.startsWith('poids')) && header.some((h) => h.includes('taille'))) {
        return setStage({ kind: 'body', rows: analyzeBody(table), name: file.name })
      }
      setStage({ kind: 'journal', parsed: analyzeTable(table, start), name: file.name })
    } catch (e) {
      setError(e instanceof BackupPasswordError ? e.message : `Fichier illisible : ${(e as Error).message}`)
    }
  }

  return (
    <>
      <TopBar title="Import" backTo={() => (stage.kind === 'pick' ? back('/reglages/sauvegarde') : setStage({ kind: 'pick' }))} />
      <main class="page">
        {stage.kind === 'pick' && (
          <>
            <section class="card">
              <h2>Choisir un fichier</h2>
              <ul class="muted small">
                <li><strong>Sauvegarde Muscu</strong> (.json, chiffrée ou non) : restauration complète.</li>
                <li><strong>Journal des séances</strong> (.csv ou .json) : colonnes Date ; Semaine ; Séance ; Exercice ; Série ; Reps prévues ; Reps réalisées ; Charge (kg) ; RPE ; Notes.</li>
                <li><strong>Mensurations</strong> (.csv) : Date ; Poids ; Tour de taille ; Tour de bras ; Tour de cuisse ; Tour de poitrine ; Notes.</li>
              </ul>
              <label class="btn primary big full file-btn">
                <Icon name="plus" /> Sélectionner un fichier
                <input type="file" accept=".csv,.json,.txt,text/csv,application/json" class="sr-only"
                  onChange={(e) => { void onFile(e.currentTarget.files?.[0]); e.currentTarget.value = '' }} />
              </label>
              {error && <p class="error" role="alert">{error}</p>}
            </section>
            <p class="muted small">Le format détaillé, avec un exemple, est décrit dans le README du projet.</p>
          </>
        )}
        {stage.kind === 'backup' && <BackupPreview data={stage.data} name={stage.name} />}
        {stage.kind === 'journal' && <JournalPreview parsed={stage.parsed} name={stage.name} />}
        {stage.kind === 'body' && <BodyPreview rows={stage.rows} name={stage.name} />}
      </main>
    </>
  )
}

function BackupPreview({ data, name }: { data: AppData; name: string }) {
  const restore = async () => {
    if (!(await confirmDialog('Remplacer toutes les données ?', 'Les données actuelles de l’app seront remplacées par celles de la sauvegarde. Pense à exporter avant si besoin.', { confirm: 'Remplacer', danger: true }))) return
    mutate('Restaurer une sauvegarde', (d) => { Object.assign(d, data) })
    toast('Sauvegarde restaurée')
    go('/')
  }
  return (
    <section class="card">
      <h2>Sauvegarde : {name}</h2>
      <ul>
        <li>{data.sessions.length} séances</li>
        <li>{data.exercises.length} exercices, {data.templates.length} modèles</li>
        <li>{data.body.length} mesures</li>
      </ul>
      <button class="btn danger big full" onClick={restore}>Restaurer (remplace tout)</button>
    </section>
  )
}

const LEVEL_LABEL = { error: 'Erreur', warning: 'Attention', info: 'Info' } as const

function JournalPreview({ parsed, name }: { parsed: ParsedImport; name: string }) {
  const data = D()
  const start = data.settings.programStart
  const [rows, setRows] = useState<ImportRow[]>(parsed.rows)
  const [, setTick] = useState(0)
  const refresh = () => { setRows([...rows]); setTick((t) => t + 1) }
  const [onlyIssues, setOnlyIssues] = useState(true)
  const unknown = unknownExercises(rows, data)
  const [mapping, setMapping] = useState(new Map<string, ID>())

  const errors = rows.filter((r) => !r.ignored && hasError(r)).length
  const warnings = rows.filter((r) => !r.ignored && !hasError(r) && r.issues.some((i) => i.level === 'warning')).length
  const missingDates = rows.filter((r) => !r.ignored && !r.date).length
  const ok = rows.filter((r) => !r.ignored && !hasError(r))
  const sessionsCount = new Set(ok.map((r) => `${r.date}|${nameKey(r.session)}`)).size
  const shown = onlyIssues ? rows.filter((r) => r.issues.length) : rows

  if (parsed.missingColumns.length) {
    return (
      <section class="card notice">
        <h2>Colonnes manquantes</h2>
        <p>Impossible de trouver : {parsed.missingColumns.map((c) => (c === 'date' ? 'Date' : 'Exercice')).join(', ')}.</p>
        <p class="muted small">Vérifie la ligne d’en-tête du fichier (voir le README).</p>
      </section>
    )
  }

  const doImport = async () => {
    let groupId = data.groups.find((g) => nameKey(g.name) === 'importes')?.id
    const newGroup = !groupId && unknown.some((n) => !mapping.has(nameKey(n)))
    if (!groupId) groupId = uid()
    const res = buildSessions(rows, data, mapping, groupId)
    const msg = [
      `${res.importedSets} séries dans ${res.sessions.length} séances.`,
      res.newExercises.length ? `${res.newExercises.length} exercice(s) ajouté(s) au groupe « Importés ».` : '',
      res.skippedSessions.length ? `${res.skippedSessions.length} séance(s) déjà présente(s) ignorée(s).` : '',
      errors ? `${errors} ligne(s) en erreur non importée(s).` : '',
    ].filter(Boolean).join('\n')
    if (!(await confirmDialog('Importer ?', msg, { confirm: 'Importer' }))) return
    mutate('Import du journal', (d) => {
      if (newGroup) d.groups.push({ id: groupId!, name: 'Importés', archived: false })
      d.exercises.push(...res.newExercises)
      d.sessions.push(...res.sessions)
    })
    toast(`Import terminé : ${res.sessions.length} séances`)
    go('/historique')
  }

  return (
    <>
      <section class="card">
        <h2>{name}</h2>
        <ul class="summary">
          <li><strong>{rows.length}</strong> lignes{parsed.emptyLines ? ` (+ ${parsed.emptyLines} vides ignorées)` : ''}</li>
          <li class={errors ? 'bad' : ''}><strong>{errors}</strong> en erreur (non importées)</li>
          <li><strong>{warnings}</strong> corrigées automatiquement, à vérifier</li>
          <li><strong>{sessionsCount}</strong> séances à importer</li>
        </ul>
        {parsed.unknownColumns.length > 0 && <p class="muted small">Colonnes ignorées : {parsed.unknownColumns.join(', ')}</p>}
        {missingDates > 0 && (
          <button class="btn small" onClick={() => { const n = fillMissingDates(rows, start); toast(`${n} date(s) reprise(s)`); refresh() }}>
            Reprendre la date de la ligne précédente ({missingDates})
          </button>
        )}
      </section>

      {unknown.length > 0 && (
        <section class="card">
          <h2>Exercices inconnus</h2>
          <p class="muted small">Associe-les à un exercice existant, ou laisse « Créer » pour les ajouter à la bibliothèque (groupe « Importés »).</p>
          {unknown.map((n) => (
            <label class="field" key={n}><span>{n}</span>
              <select value={mapping.get(nameKey(n)) ?? ''} onChange={(e) => {
                const m = new Map(mapping)
                if (e.currentTarget.value) m.set(nameKey(n), e.currentTarget.value); else m.delete(nameKey(n))
                setMapping(m)
              }}>
                <option value="">Créer « {cleanName(n)} »</option>
                {data.exercises.filter((x) => !x.archived).sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
          ))}
        </section>
      )}

      <div class="row between">
        <h2>Aperçu</h2>
        <label class="check small"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.currentTarget.checked)} /> <span>Lignes signalées seulement</span></label>
      </div>
      {shown.length === 0 && <p class="muted center">Aucun problème détecté.</p>}
      <ul class="list import-rows">
        {shown.slice(0, 300).map((r) => (
          <li key={r.line} class={`card import-row ${r.ignored ? 'ignored' : hasError(r) ? 'has-error' : ''}`}>
            <div class="row between gap">
              <strong>Ligne {r.line}</strong>
              <label class="check small"><input type="checkbox" checked={r.ignored} onChange={(e) => { r.ignored = e.currentTarget.checked; refresh() }} /> <span>Ignorer</span></label>
            </div>
            <div class="small">
              {r.date ? fmtDate(r.date) : <span class="bad">date ?</span>} · S{r.week ?? '?'} · {r.session} · <strong>{r.exercise || '?'}</strong>
              {' '}· série {r.index ?? '?'} · {r.reps ?? '–'} × {r.load !== null ? `${fmtNum(r.load)} kg` : '—'}{r.rpe !== null && ` · RPE ${fmtNum(r.rpe)}`}
              {r.note && <span class="muted block">« {r.note} »</span>}
            </div>
            <ul class="issues">
              {r.issues.map((i, k) => <li key={k} class={i.level}><span class="pill">{LEVEL_LABEL[i.level]}</span> {i.message}</li>)}
            </ul>
            {r.issues.some((i) => i.field === 'date') && (
              <label class="field small"><span>Corriger la date</span>
                <input type="date" value={r.date ?? ''} onChange={(e) => { if (e.currentTarget.value) { setRowDate(r, e.currentTarget.value, start); refresh() } }} /></label>
            )}
            {r.issues.some((i) => i.field === 'rpe') && (
              <label class="field small"><span>RPE (6 à 10, vide = aucun)</span>
                <input inputMode="decimal" value={r.rpe === null ? '' : fmtNum(r.rpe)} onChange={(e) => {
                  const v = parseDecimal(e.currentTarget.value)
                  if (v === null || (v >= 6 && v <= 10)) { r.rpe = v; r.issues = r.issues.filter((i) => i.field !== 'rpe'); refresh() } else toast('RPE entre 6 et 10', { kind: 'error' })
                }} /></label>
            )}
          </li>
        ))}
      </ul>
      {shown.length > 300 && <p class="muted center small">… {shown.length - 300} lignes de plus non affichées.</p>}
      <button class="btn primary big full" disabled={!ok.length} onClick={doImport}>Importer {ok.length} lignes</button>
    </>
  )
}

// ---------- Mensurations ----------

function analyzeBody(table: string[][]): BodyRow[] {
  const [header = [], ...body] = table
  const col = (pred: (h: string) => boolean) => header.findIndex((h) => pred(nameKey(h)))
  const c = {
    date: col((h) => h.startsWith('date')), weight: col((h) => h.startsWith('poids')), waist: col((h) => h.includes('taille')),
    arm: col((h) => h.includes('bras')), thigh: col((h) => h.includes('cuisse')), chest: col((h) => h.includes('poitrine')), note: col((h) => h.startsWith('note')),
  }
  return body.filter((r) => r.some((x) => x.trim())).map((cells, i) => {
    const issues: string[] = []
    const raw = (k: keyof typeof c) => (c[k] >= 0 ? (cells[c[k]] ?? '').trim() : '')
    let date = parseFrDate(raw('date'))
    if (!date) {
      date = repairDate(raw('date'))
      issues.push(date ? `Date « ${raw('date')} » corrigée` : `Date « ${raw('date')} » illisible`)
    }
    const num = (k: 'weight' | 'waist' | 'arm' | 'thigh' | 'chest') => {
      const v = parseDecimal(raw(k))
      if (v !== null && Number.isNaN(v)) { issues.push(`Valeur « ${raw(k)} » ignorée`); return null }
      return v
    }
    const entry: BodyEntry = { id: uid(), date: date ?? '', weight: num('weight'), waist: num('waist'), arm: num('arm'), thigh: num('thigh'), chest: num('chest'), note: raw('note') }
    return { line: i + 2, entry, issues, ignored: !date }
  })
}

function BodyPreview({ rows, name }: { rows: BodyRow[]; name: string }) {
  const valid = rows.filter((r) => !r.ignored)
  const doImport = () => {
    mutate('Import des mensurations', (d) => { d.body.push(...valid.map((r) => r.entry)) })
    toast(`${valid.length} mesures importées`)
    go('/corps')
  }
  return (
    <>
      <section class="card">
        <h2>Mensurations : {name}</h2>
        <p>{valid.length} mesures valides sur {rows.length}.</p>
      </section>
      <ul class="list import-rows">
        {rows.map((r) => (
          <li key={r.line} class={`card import-row ${r.ignored ? 'has-error' : ''}`}>
            <strong>Ligne {r.line}</strong> · {r.entry.date ? fmtDate(r.entry.date) : 'date ?'} · {fmtNum(r.entry.weight)} kg
            {r.issues.map((i, k) => <p key={k} class="small warning">{i}</p>)}
          </li>
        ))}
      </ul>
      <button class="btn primary big full" disabled={!valid.length} onClick={doImport}>Importer {valid.length} mesures</button>
    </>
  )
}
