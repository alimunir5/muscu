// Tableau de bord : indicateurs de la semaine sélectionnée et graphiques.
import { useMemo, useState } from 'preact/hooks'
import {
  bestE1rm, completion, deloadDue, flatten, sessionsDoneInWeek, totalVolume, weeklyBestE1rm, weeklyVolume, weekRange,
} from '../../domain/calc'
import { addDaysISO, fmtDate, fmtKg, fmtNum, weekStartISO } from '../../domain/format'
import { Chart } from '../components/Chart'
import { Empty, Icon, ProgressBar, TopBar } from '../components/common'
import { go } from '../router'
import { activeSession, currentWeek, D, demo, mutate } from '../store'

const EXPORT_REMINDER_DAYS = 30

export function Home() {
  const data = D()
  const s = data.settings
  const [week, setWeek] = useState(currentWeek.value)
  const rows = useMemo(() => flatten(data), [data])
  const volumes = useMemo(() => weeklyVolume(rows), [rows])
  const active = activeSession.value

  const weekVol = volumes.get(week) ?? 0
  const done = sessionsDoneInWeek(data, week)
  const comp = completion(done, s.sessionsPerWeek)
  const monday = weekStartISO(week, s.programStart)
  const weeks = weekRange(volumes.keys(), [currentWeek.value])
  const hasData = rows.some((r) => r.volume !== null)
  const tracked = s.trackedExerciseIds.map((id) => data.exercises.find((e) => e.id === id)).filter((e) => !!e)
  const e1rmWeeks = tracked.map((ex) => weeklyBestE1rm(rows, ex.id))
  const e1rmRange = weekRange(e1rmWeeks.flatMap((m) => [...m.keys()]))
  const showDeload = deloadDue(currentWeek.value, s)
  const daysSinceExport = s.lastExportAt ? (Date.now() - s.lastExportAt) / 86_400_000 : Infinity
  const showExport = !demo.value && data.sessions.length > 0 && daysSinceExport > EXPORT_REMINDER_DAYS

  return (
    <>
      <TopBar title="Accueil" />
      <main class="page">
        {active ? (
          <button class="card cta" onClick={() => go('/seance')}>
            <Icon name="dumbbell" />
            <span><strong>Séance en cours : {active.name}</strong><br /><span class="muted">Reprendre où tu en étais</span></span>
            <Icon name="chevron" />
          </button>
        ) : (
          <button class="btn primary big full" onClick={() => go('/seance')}>
            <Icon name="dumbbell" /> Démarrer une séance
          </button>
        )}

        {showDeload && (
          <section class="card notice" aria-label="Semaine allégée">
            <p><strong>Semaine allégée conseillée</strong> (semaine {currentWeek.value}).<br />
              <span class="muted">Après {s.deloadEvery} semaines d’entraînement, une semaine de deload aide à récupérer.</span></p>
            <div class="row gap wrap">
              <button class="btn small primary" onClick={() => mutate('Accepter le deload', (d) => { d.settings.deloadWeeks.push(currentWeek.value) })}>
                Accepter
              </button>
              <button class="btn small ghost" onClick={() => mutate('Ignorer le deload', (d) => { d.settings.deloadDismissedWeek = currentWeek.value })}>
                Ignorer
              </button>
            </div>
          </section>
        )}

        {showExport && (
          <section class="card notice soft">
            <p>{s.lastExportAt ? `Dernier export il y a ${Math.floor(daysSinceExport)} jours.` : 'Tu n’as encore jamais exporté tes données.'}{' '}
              Une sauvegarde te protège en cas de perte ou de changement de téléphone.</p>
            <button class="btn small" onClick={() => go('/reglages/sauvegarde')}>Exporter maintenant</button>
          </section>
        )}

        <nav class="week-picker" aria-label="Semaine affichée">
          <button class="icon-btn" onClick={() => setWeek(week - 1)} aria-label="Semaine précédente"><Icon name="back" /></button>
          <div class="center">
            <strong>Semaine {week}</strong>{week === currentWeek.value && <span class="pill">en cours</span>}
            <div class="muted small">{fmtDate(monday)} → {fmtDate(addDaysISO(monday, 6))}</div>
          </div>
          <button class="icon-btn" onClick={() => setWeek(week + 1)} aria-label="Semaine suivante"><Icon name="chevron" /></button>
        </nav>

        <section class="kpis" aria-label="Indicateurs">
          <div class="kpi">
            <span class="kpi-label">Volume de la semaine</span>
            <span class="kpi-value">{fmtKg(weekVol, 0)}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Séances réalisées</span>
            <span class="kpi-value">{comp.label}</span>
            <span class="muted small">{comp.pct} %{comp.extra > 0 && ` · +${comp.extra} en plus`}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Volume cumulé</span>
            <span class="kpi-value">{fmtKg(totalVolume(rows), 0)}</span>
          </div>
          <div class="kpi">
            <span class="kpi-label">Prévues / semaine</span>
            <span class="kpi-value">{s.sessionsPerWeek}</span>
          </div>
        </section>
        <ProgressBar value={comp.done} max={comp.planned} label="Taux de réalisation" />

        {s.weeklyVolumeGoal ? (
          <section class="card">
            <div class="row between"><span>Objectif de volume</span><strong>{Math.round((weekVol / s.weeklyVolumeGoal) * 100)} %</strong></div>
            <ProgressBar value={weekVol} max={s.weeklyVolumeGoal} label="Progression vers l’objectif de volume" />
            <p class="muted small">{fmtKg(weekVol, 0)} sur {fmtKg(s.weeklyVolumeGoal, 0)}</p>
          </section>
        ) : null}

        {!hasData ? (
          <Empty title="Pas encore de données" text="Tes graphiques apparaîtront après ta première séance.">
            <button class="btn" onClick={() => go('/reglages/import')}>Importer mon historique</button>
          </Empty>
        ) : (
          <>
            <section class="card">
              <h2>Volume hebdomadaire</h2>
              <Chart type="bar" title="Volume total par semaine" labels={weeks.map((w) => `S${w}`)}
                series={[{ label: 'Volume', data: weeks.map((w) => volumes.get(w) ?? null) }]} />
            </section>

            <section class="card">
              <div class="row between">
                <h2>1RM estimé — records</h2>
                <button class="btn small ghost" onClick={() => go('/reglages/suivis')}>Choisir</button>
              </div>
              {tracked.length === 0 ? <p class="muted">Aucun exercice suivi.</p> : (
                <table class="table">
                  <thead><tr><th scope="col">Mouvement</th><th scope="col" class="num">Meilleur</th><th scope="col" class="num">Date</th></tr></thead>
                  <tbody>
                    {tracked.map((ex) => {
                      const b = bestE1rm(rows, ex.id)
                      return (
                        <tr key={ex.id} onClick={() => go(`/exercice/${ex.id}`)} class="clickable">
                          <th scope="row"><a href={`#/exercice/${ex.id}`}>{ex.name}</a></th>
                          <td class="num">{b ? fmtKg(b.e1rm) : '—'}</td>
                          <td class="num muted">{b ? fmtDate(b.session.date) : ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </section>

            {tracked.length > 0 && e1rmRange.length > 0 && (
              <section class="card">
                <h2>Progression du 1RM estimé</h2>
                <p class="muted small">Meilleur 1RM estimé de chaque semaine.</p>
                <Chart type="line" title="1RM estimé par semaine" labels={e1rmRange.map((w) => `S${w}`)}
                  series={tracked.map((ex, i) => ({ label: ex.name, data: e1rmRange.map((w) => e1rmWeeks[i].get(w) ?? null) }))}
                  height={260} />
              </section>
            )}
          </>
        )}
        <p class="muted small center">Semaine du programme calculée depuis le {fmtDate(s.programStart)} · {fmtNum(rows.filter((r) => r.volume !== null).length, 0)} séries comptées</p>
      </main>
    </>
  )
}
