// Éditeur de séance, partagé par la séance en cours et la correction depuis l'historique.
import { useEffect, useMemo, useState } from 'preact/hooks'
import {
  detectPRs, duplicateIndexes, flatten, intensityHint, isRealized, lastPerformance, PR_LABEL, progressionSuggestion,
  RPE_SCALE, sessionWeek, setMetrics, bodyweightAt, summarizeSets, validateRpe,
} from '../../domain/calc'
import { fmtDate, fmtDuration, fmtKg, fmtNum, isValidISO, programWeek } from '../../domain/format'
import type { AppData, Exercise, ID, Session, SessionEntry, SetEntry } from '../../domain/types'
import { buildEntry, newSet, nextIndex, restAfter, sessionProgress, stepFor } from '../../domain/workout'
import { confirmDialog, promptDialog, toast } from '../dialogs'
import { primeAudio } from '../rest'
import { D, mutate } from '../store'
import { Icon, NumberStepper, ProgressBar } from './common'
import { pickExercise } from './ExercisePicker'

type Mode = 'active' | 'edit'

/** Modifie la séance `id` dans une copie des données. */
function editSession(id: ID, label: string, fn: (s: Session, d: AppData) => void, undoable = true) {
  mutate(label, (d) => {
    const s = d.sessions.find((x) => x.id === id)
    if (s) fn(s, d)
  }, { undoable })
}

function editEntry(sid: ID, eid: ID, label: string, fn: (e: SessionEntry, s: Session, d: AppData) => void, undoable = true) {
  editSession(sid, label, (s, d) => {
    const e = s.entries.find((x) => x.id === eid)
    if (e) fn(e, s, d)
  }, undoable)
}

export function SessionHeader({ session, mode }: { session: Session; mode: Mode }) {
  const data = D()
  const computed = programWeek(session.date, data.settings.programStart)
  const week = sessionWeek(session, data.settings)
  const prog = sessionProgress(session)
  return (
    <section class="card">
      <div class="row between wrap gap">
        <button class="link-btn" onClick={async () => {
          const name = await promptDialog('Nom de la séance', 'Nom', session.name, { validate: (v) => (v.trim() ? null : 'Nom requis') })
          if (name) editSession(session.id, 'Renommer la séance', (s) => { s.name = name.trim() })
        }}><h2>{session.name}</h2></button>
        {session.deload && <span class="pill warn">Deload · {session.deload === 'charges' ? 'charges ~60 %' : 'moitié des séries'}</span>}
      </div>
      <div class="grid2">
        <label class="field">
          <span>Date</span>
          <input type="date" value={session.date} required onChange={(e) => {
            const v = e.currentTarget.value
            if (!isValidISO(v)) return toast('Date invalide', { kind: 'error' })
            editSession(session.id, 'Changer la date', (s) => { s.date = v })
          }} />
        </label>
        <label class="field">
          <span>Semaine {session.weekOverride !== undefined ? <span class="muted">(corrigée, calculée : {computed})</span> : <span class="muted">(auto)</span>}</span>
          <input inputMode="numeric" value={String(week)} onChange={(e) => {
            const raw = e.currentTarget.value.trim()
            const n = Number(raw)
            if (raw === '' || n === computed) return editSession(session.id, 'Semaine automatique', (s) => { delete s.weekOverride })
            if (!Number.isInteger(n) || n < -100 || n > 1000) { e.currentTarget.value = String(week); return toast('Semaine : nombre entier attendu', { kind: 'error' }) }
            editSession(session.id, 'Corriger la semaine', (s) => { s.weekOverride = n })
          }} />
        </label>
      </div>
      {mode === 'active' && (
        <>
          <div class="row between small"><span>Progression</span><span>{prog.done}/{prog.total} séries</span></div>
          <ProgressBar value={prog.done} max={prog.total} label="Séries faites sur séries prévues" />
        </>
      )}
    </section>
  )
}

export function SessionBody({ session, mode }: { session: Session; mode: Mode }) {
  const data = D()
  // Historique hors séance courante, pour les records et la « dernière fois ».
  const history = useMemo(() => flatten({ ...data, sessions: data.sessions.filter((s) => s.id !== session.id) }), [data.sessions, session.id])

  const addExercise = async () => {
    const exId = await pickExercise('Ajouter un exercice')
    if (!exId) return
    editSession(session.id, 'Ajouter un exercice', (s, d) => {
      s.entries.push(buildEntry(d, exId, undefined, { templateId: s.templateId }))
    })
  }

  // En séance, seul le premier exercice restant a son éditeur ouvert.
  const focusId = mode === 'active'
    ? session.entries.find((e) => !e.skipped && e.sets.some((x) => !x.done && !x.abandoned))?.id
    : undefined

  return (
    <>
      {session.entries.length === 0 && <p class="muted center">Aucun exercice. Ajoute ton premier exercice ci-dessous.</p>}
      {session.entries.map((entry, i) => (
        <ExerciseCard key={entry.id} session={session} entry={entry} index={i} mode={mode} history={history} focused={entry.id === focusId} />
      ))}
      <button class="btn full" onClick={addExercise}><Icon name="plus" /> Ajouter un exercice</button>
      <label class="field">
        <span>Note de séance (sensations, douleurs)</span>
        <textarea rows={3} value={session.note}
          onChange={(e) => { const v = e.currentTarget.value; editSession(session.id, 'Note de séance', (s) => { s.note = v }) }} />
      </label>
    </>
  )
}

function ExerciseCard({ session, entry, index, mode, history, focused }: {
  session: Session; entry: SessionEntry; index: number; mode: Mode; history: ReturnType<typeof flatten>; focused: boolean
}) {
  const data = D()
  const ex = data.exercises.find((e) => e.id === entry.exerciseId)
  const [menu, setMenu] = useState(false)
  const firstPending = entry.sets.find((s) => !s.done && !s.abandoned)?.id ?? null
  const [openSet, setOpenSet] = useState<ID | null>(focused ? firstPending : null)
  // Quand cet exercice devient le suivant à faire, on ouvre sa première série.
  useEffect(() => { if (focused) setOpenSet((cur) => cur ?? firstPending) }, [focused])
  const isOpen = (id: ID) => openSet === id

  const last = useMemo(() => lastPerformance(data, entry.exerciseId, { templateId: session.templateId, excludeSessionId: session.id }), [data.sessions, entry.exerciseId])
  const template = data.templates.find((t) => t.id === session.templateId)
  const item = template?.items.find((it) => it.exerciseId === entry.exerciseId)
  const suggestion = last && ex && entry.repMax !== undefined
    ? progressionSuggestion(last.entry, ex.equipment, { repMin: entry.repMin ?? 0, repMax: entry.repMax, sets: item?.sets ?? entry.sets.length }, stepFor(data, ex))
    : null
  const prev = session.entries[index - 1], next = session.entries[index + 1]
  const inSuperset = !!entry.superset && (prev?.superset === entry.superset || next?.superset === entry.superset)
  const dups = duplicateIndexes(entry)

  const move = (dir: -1 | 1) => editSession(session.id, 'Réordonner', (s) => {
    const j = index + dir
    if (j < 0 || j >= s.entries.length) return
    ;[s.entries[index], s.entries[j]] = [s.entries[j], s.entries[index]]
  })
  const replace = async () => {
    setMenu(false)
    const id = await pickExercise('Remplacer par…')
    if (id) editEntry(session.id, entry.id, 'Remplacer l’exercice', (e) => { e.exerciseId = id })
  }
  const remove = async () => {
    setMenu(false)
    if (await confirmDialog(`Retirer « ${ex?.name ?? 'exercice'} » ?`, 'Ses séries seront supprimées de la séance.', { confirm: 'Retirer', danger: true })) {
      editSession(session.id, 'Retirer l’exercice', (s) => { s.entries = s.entries.filter((e) => e.id !== entry.id) })
    }
  }
  const addSet = () => {
    const ref = entry.sets.at(-1)
    const s = newSet(nextIndex(entry), { planned: ref?.planned, load: ref?.load ?? null, reps: ref?.reps ?? entry.repMin ?? null })
    editEntry(session.id, entry.id, 'Ajouter une série', (e) => { e.sets.push(s) })
    setOpenSet(s.id)
  }

  const altId = item?.altExerciseId && item.altExerciseId !== entry.exerciseId ? item.altExerciseId : item?.exerciseId !== entry.exerciseId ? item?.exerciseId : undefined
  const alt = altId ? data.exercises.find((e) => e.id === altId) : undefined

  return (
    <article class={`card exercise ${entry.skipped ? 'skipped' : ''} ${inSuperset ? 'superset' : ''}`} aria-label={ex?.name}>
      <header class="row between">
        <div class="grow">
          <a class="ex-title" href={`#/exercice/${entry.exerciseId}`}>{ex?.name ?? 'Exercice supprimé'}</a>
          <div class="muted small">
            {entry.repMin !== undefined && <>{entry.sets.length} × {entry.repMin}{entry.repMax !== entry.repMin ? `-${entry.repMax}` : ''} · </>}
            repos {fmtDuration(entry.restSec)}
            {inSuperset && <span class="pill">Superset</span>}
            {entry.skipped && <span class="pill">Sauté</span>}
          </div>
        </div>
        <button class="icon-btn" aria-expanded={menu} aria-label="Options de l’exercice" onClick={() => setMenu(!menu)}><Icon name="more" /></button>
      </header>

      {menu && (
        <div class="menu" role="menu">
          <button role="menuitem" onClick={() => { setMenu(false); editEntry(session.id, entry.id, entry.skipped ? 'Reprendre l’exercice' : 'Sauter l’exercice', (e) => { e.skipped = !e.skipped }) }}>
            <Icon name="skip" /> {entry.skipped ? 'Reprendre' : 'Sauter'}
          </button>
          <button role="menuitem" disabled={index === 0} onClick={() => move(-1)}><Icon name="up" /> Monter</button>
          <button role="menuitem" disabled={index === session.entries.length - 1} onClick={() => move(1)}><Icon name="down" /> Descendre</button>
          {alt && <button role="menuitem" onClick={() => { setMenu(false); editEntry(session.id, entry.id, 'Variante', (e) => { e.exerciseId = alt.id }) }}><Icon name="swap" /> {alt.name}</button>}
          <button role="menuitem" onClick={replace}><Icon name="swap" /> Remplacer…</button>
          <button role="menuitem" onClick={async () => {
            setMenu(false)
            const v = await promptDialog('Repos', 'Repos en secondes', String(entry.restSec), { type: 'number', validate: (x) => (/^\d{1,4}$/.test(x.trim()) ? null : 'Nombre de secondes') })
            if (v !== null) editEntry(session.id, entry.id, 'Durée de repos', (e) => { e.restSec = Number(v) })
          }}><Icon name="timer" /> Durée du repos</button>
          <button role="menuitem" class="danger-text" onClick={remove}><Icon name="trash" /> Retirer</button>
        </div>
      )}

      {!entry.skipped && ex && (
        <>
          {item?.note && <p class="muted small">{item.note}</p>}
          {intensityHint(ex) && <p class="hint small">{intensityHint(ex)}</p>}
          {last && (
            <div class="last">
              <span class="muted small">Dernière fois ({fmtDate(last.session.date)}) :</span>{' '}
              <span>{summarizeSets(last.entry) || 'aucune série réalisée'}</span>
              {last.entry.note && <div class="muted small">« {last.entry.note} »</div>}
              {suggestion && <div class="suggest"><Icon name="up" size={16} /> {suggestion.text}</div>}
            </div>
          )}

          {ex.kind === 'check' ? (
            <label class="check big-check">
              <input type="checkbox" checked={!!entry.checked}
                onChange={(e) => { const v = e.currentTarget.checked; editEntry(session.id, entry.id, v ? 'Bloc fait' : 'Bloc non fait', (x) => { x.checked = v }) }} />
              <span>Fait</span>
            </label>
          ) : (
            <>
              {dups.length > 0 && <p class="error" role="alert">N° de série en double : {dups.join(', ')}. Corrige les numéros.</p>}
              <ol class="sets">
                {entry.sets.map((set, k) => (
                  <li key={set.id}>
                    <SetRow set={set} ex={ex} session={session} entry={entry} open={isOpen(set.id)}
                      onToggle={() => setOpenSet(isOpen(set.id) ? null : set.id)}
                      prevSet={entry.sets[k - 1]} mode={mode} history={history}
                      onDone={() => {
                        const nextPending = entry.sets.slice(k + 1).find((s) => !s.done && !s.abandoned)
                        setOpenSet(nextPending?.id ?? null)
                      }} />
                  </li>
                ))}
              </ol>
              <button class="btn small ghost" onClick={addSet}><Icon name="plus" size={18} /> Ajouter une série</button>
            </>
          )}
          <details class="entry-note">
            <summary>Note d’exercice{entry.note ? ' ✎' : ''}</summary>
            <textarea rows={2} value={entry.note} aria-label="Note d’exercice"
              onChange={(e) => { const v = e.currentTarget.value; editEntry(session.id, entry.id, 'Note d’exercice', (x) => { x.note = v }) }} />
          </details>
        </>
      )}
    </article>
  )
}

function SetRow({ set, ex, session, entry, open, onToggle, prevSet, mode, history, onDone }: {
  set: SetEntry; ex: Exercise; session: Session; entry: SessionEntry; open: boolean; onToggle: () => void
  prevSet?: SetEntry; mode: Mode; history: ReturnType<typeof flatten>; onDone: () => void
}) {
  const data = D()
  const defaultStep = stepFor(data, ex)
  const [step, setStep] = useState(defaultStep)
  const [error, setError] = useState<string | null>(null)
  const bodyweight = ex.volumeMode === 'pdc' || ex.equipment === 'poids de corps'
  const loadLabel = bodyweight ? 'Lest' : 'Charge'

  const upd = (fn: (s: SetEntry) => void, label = 'Modifier la série', undoable = false) =>
    editEntry(session.id, entry.id, label, (e) => { const s = e.sets.find((x) => x.id === set.id); if (s) fn(s) }, undoable)

  const status = set.abandoned ? 'abandoned' : set.done ? 'done' : 'pending'
  const m = setMetrics(set, ex, bodyweightAt(data.body, session.date))

  const validate = () => {
    if (set.reps === null || set.reps <= 0) return setError('Saisis les répétitions réalisées, ou marque la série « non faite ».')
    const rpeErr = validateRpe(set.rpe)
    if (rpeErr) return setError(rpeErr)
    if (entry.sets.some((s) => s.id !== set.id && s.index === set.index)) return setError(`La série n° ${set.index} existe déjà pour cet exercice.`)
    setError(null)
    primeAudio()
    // Records : comparaison avec tout l'historique de l'exercice (hors cette séance) + séries déjà faites aujourd'hui.
    const bw = bodyweightAt(data.body, session.date)
    const candidate = { set: { ...set, done: true, abandoned: false }, ...setMetrics({ ...set, done: true, abandoned: false }, ex, bw) }
    const today = entry.sets.filter((s) => s.id !== set.id && isRealized(s)).map((s) => ({ set: s, ...setMetrics(s, ex, bw) }))
    const prs = detectPRs([...history.filter((r) => r.entry.exerciseId === ex.id), ...today], candidate)
    const rest = mode === 'active' ? restAfter(session, entry.id) : null
    editSession(session.id, 'Valider la série', (s) => {
      const e = s.entries.find((x) => x.id === entry.id)!
      const x = e.sets.find((y) => y.id === set.id)!
      x.done = true
      x.abandoned = false
      // Série suivante encore vide : on la pré-remplit avec celle-ci.
      const nxt = e.sets.find((y) => y.index > x.index && !y.done && !y.abandoned)
      if (nxt && nxt.load === null && nxt.reps === null) { nxt.load = x.load; nxt.reps = x.reps }
      else if (nxt && nxt.load === null) nxt.load = x.load
      if (rest) s.restEndsAt = Date.now() + rest * 1000
    })
    if (prs.length) toast(`🏆 ${prs.map((p) => PR_LABEL[p]).join(' · ')} — ${ex.name}`, { kind: 'pr', ms: 6000 })
    onDone()
  }

  const copyPrev = () => {
    if (!prevSet) return
    upd((s) => { s.load = prevSet.load; s.reps = prevSet.reps; s.rpe = prevSet.rpe }, 'Copier la série précédente', true)
  }

  return (
    <div class={`set ${status} ${open ? 'open' : ''}`}>
      <button class="set-summary" onClick={onToggle} aria-expanded={open}>
        <span class="set-index">{set.index}</span>
        <span class="set-main">
          {set.reps ?? '–'} × {set.load !== null ? fmtKg(set.load) : bodyweight ? 'PDC' : '— kg'}
          {set.rpe !== null && <span class="muted"> · RPE {fmtNum(set.rpe)}</span>}
          {set.planned && <span class="muted small"> (prévu {set.planned})</span>}
        </span>
        <span class="set-status">
          {status === 'done' && <><Icon name="check" size={20} label="Faite" />{m.volume !== null && <span class="muted small"> {fmtNum(m.volume, 0)}</span>}</>}
          {status === 'abandoned' && <span class="pill bad">Non faite</span>}
        </span>
      </button>
      {set.note && !open && <p class="muted small set-note">« {set.note} »</p>}

      {open && (
        <div class="set-editor">
          <NumberStepper label={loadLabel} unit="kg" value={set.load} step={step} max={1000}
            placeholder={bodyweight ? '0' : '—'} onChange={(v) => upd((s) => { s.load = v })} />
          <div class="chips" role="radiogroup" aria-label="Pas des boutons de charge">
            {[0.5, 1, 2.5].map((v) => (
              <button key={v} role="radio" aria-checked={step === v} class={`chip small ${step === v ? 'on' : ''}`} onClick={() => setStep(v)}>
                ±{fmtNum(v)}
              </button>
            ))}
          </div>
          <NumberStepper label="Répétitions" value={set.reps} step={1} integer max={200} onChange={(v) => upd((s) => { s.reps = v })} />
          <fieldset class="rpe">
            <legend>RPE <span class="muted small">{set.rpe !== null ? RPE_SCALE.find((r) => r.rpe === Math.floor(set.rpe!))?.label : 'optionnel'}</span></legend>
            <div class="chips">
              {[6, 7, 8, 9, 10].map((v) => (
                <button key={v} type="button" aria-pressed={set.rpe === v} class={`chip ${set.rpe === v ? 'on' : ''}`}
                  title={RPE_SCALE.find((r) => r.rpe === v)?.label}
                  onClick={() => upd((s) => { s.rpe = s.rpe === v ? null : v })}>{v}</button>
              ))}
            </div>
          </fieldset>
          {mode === 'edit' && (
            <NumberStepper label="N° de série" value={set.index} step={1} integer min={1} max={50}
              onChange={(v) => v !== null && upd((s) => { s.index = v })} />
          )}
          <label class="field">
            <span>Note de série</span>
            <input value={set.note} placeholder="ex. mal à la nuque, revoir le poids"
              onChange={(e) => { const v = e.currentTarget.value; upd((s) => { s.note = v }, 'Note de série') }} />
          </label>
          {error && <p class="error" role="alert">{error}</p>}
          <button class="btn primary big full" onClick={validate}>
            <Icon name="check" /> {status === 'done' ? 'Valider à nouveau' : 'Valider la série'}
          </button>
          <div class="row gap wrap">
            {prevSet && <button class="btn small" onClick={copyPrev}><Icon name="copy" size={18} /> Copier la précédente</button>}
            <button class="btn small" onClick={() => {
              upd((s) => { s.abandoned = !s.abandoned; s.done = false }, set.abandoned ? 'Série à faire' : 'Série non faite', true)
              if (!set.abandoned) onDone()
            }}>{set.abandoned ? 'Remettre à faire' : 'Non faite'}</button>
            <button class="btn small ghost danger-text" onClick={async () => {
              if (await confirmDialog(`Supprimer la série ${set.index} ?`, undefined, { confirm: 'Supprimer', danger: true })) {
                editEntry(session.id, entry.id, 'Supprimer la série', (e) => { e.sets = e.sets.filter((x) => x.id !== set.id) })
              }
            }}><Icon name="trash" size={18} /> Supprimer</button>
          </div>
        </div>
      )}
    </div>
  )
}
