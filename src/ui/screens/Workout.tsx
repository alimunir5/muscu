// Onglet Séance : choix du modèle puis saisie de la séance en cours.
import { useEffect, useState } from 'preact/hooks'
import { fmtDuration, isValidISO, programWeek, todayISO } from '../../domain/format'
import type { Session } from '../../domain/types'
import { startSession } from '../../domain/workout'
import { Icon, TopBar } from '../components/common'
import { SessionBody, SessionHeader } from '../components/SessionEditor'
import { confirmDialog, toast } from '../dialogs'
import { createWakeLock } from '../rest'
import { go } from '../router'
import { activeSession, D, mutate } from '../store'

export function Workout() {
  const s = activeSession.value
  return s ? <Active session={s} /> : <Start />
}

function Start() {
  const data = D()
  const [date, setDate] = useState(todayISO())
  const week = programWeek(date, data.settings.programStart)
  const isDeloadWeek = data.settings.deloadWeeks.includes(week)
  const [deload, setDeload] = useState<Session['deload'] | ''>(isDeloadWeek ? 'charges' : '')
  const templates = data.settings.templateOrder.map((id) => data.templates.find((t) => t.id === id)).filter((t) => !!t)

  const start = (templateId: string | null) => {
    if (!isValidISO(date)) return toast('Date invalide', { kind: 'error' })
    mutate('Démarrer une séance', (d) => { d.sessions.push(startSession(d, templateId, date, deload || undefined)) })
  }

  return (
    <>
      <TopBar title="Séance" />
      <main class="page">
        <label class="field">
          <span>Date de la séance <span class="muted">(semaine {week})</span></span>
          <input type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
        </label>
        {isDeloadWeek && (
          <fieldset class="card notice">
            <legend>Semaine allégée (deload)</legend>
            {([['charges', 'Charges à ~60 %'], ['series', 'Moitié des séries'], ['', 'Séance normale']] as const).map(([v, l]) => (
              <label key={v} class="radio"><input type="radio" name="deload" checked={deload === v} onChange={() => setDeload(v)} /> {l}</label>
            ))}
          </fieldset>
        )}
        <h2>Choisis ta séance</h2>
        <ul class="list cards">
          {templates.map((t) => (
            <li key={t.id}>
              <button class="card template-btn" onClick={() => start(t.id)}>
                <span class="grow">
                  <strong>{t.name}</strong>
                  <span class="muted small block">{t.items.map((it) => data.exercises.find((e) => e.id === it.exerciseId)?.name).filter(Boolean).join(' · ')}</span>
                </span>
                <Icon name="chevron" />
              </button>
            </li>
          ))}
        </ul>
        <button class="btn full" onClick={() => start(null)}><Icon name="plus" /> Séance libre</button>
        <p class="muted small center"><a href="#/reglages/modeles">Modifier les modèles de séance</a></p>
      </main>
    </>
  )
}

function Active({ session }: { session: Session }) {
  // Écran allumé pendant toute la séance.
  useEffect(() => {
    const wl = createWakeLock()
    wl.enable()
    return () => wl.disable()
  }, [])

  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const started = Number(localStorage.getItem(`start-${session.id}`) ?? Date.now())
    try { localStorage.setItem(`start-${session.id}`, String(started)) } catch { /* stockage indisponible */ }
    const t = setInterval(() => setElapsed((Date.now() - started) / 1000), 1000)
    return () => clearInterval(t)
  }, [session.id])

  const finish = async () => {
    const pending = session.entries.filter((e) => !e.skipped).flatMap((e) => e.sets).filter((s) => !s.done && !s.abandoned).length
    const ok = await confirmDialog('Terminer la séance ?',
      pending ? `${pending} série(s) non validée(s) seront marquées « non faites ».` : 'Bravo ! La séance sera enregistrée dans l’historique.',
      { confirm: 'Terminer' })
    if (!ok) return
    mutate('Terminer la séance', (d) => {
      const s = d.sessions.find((x) => x.id === session.id)!
      s.status = 'done'
      delete s.restEndsAt
      for (const e of s.entries) for (const x of e.sets) if (!x.done && !e.skipped) x.abandoned = true
    })
    try { localStorage.removeItem(`start-${session.id}`) } catch { /* ignore */ }
    toast('Séance enregistrée')
    go(`/historique/${session.id}`)
  }

  const discard = async () => {
    if (!(await confirmDialog('Abandonner la séance ?', 'Toutes les séries saisies dans cette séance seront supprimées.', { confirm: 'Supprimer', danger: true }))) return
    mutate('Abandonner la séance', (d) => { d.sessions = d.sessions.filter((x) => x.id !== session.id) })
    toast('Séance supprimée')
  }

  return (
    <>
      <TopBar title={`Séance · ${fmtDuration(elapsed)}`} />
      <main class="page workout">
        <SessionHeader session={session} mode="active" />
        <SessionBody session={session} mode="active" />
        <button class="btn primary big full" onClick={finish}><Icon name="check" /> Terminer la séance</button>
        <button class="btn ghost danger-text full" onClick={discard}>Abandonner la séance</button>
      </main>
    </>
  )
}
