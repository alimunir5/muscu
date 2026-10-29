// Fiche exercice : progression, records personnels, historique des séries.
import { useMemo } from 'preact/hooks'
import { flatten, PR_LABEL, prHistory, type FlatSet } from '../../domain/calc'
import { fmtDate, fmtKg, fmtNum, round2 } from '../../domain/format'
import { Chart } from '../components/Chart'
import { Empty, Icon, TopBar } from '../components/common'
import { back } from '../router'
import { D } from '../store'

export function ExerciseDetail({ id }: { id: string }) {
  const data = D()
  const ex = data.exercises.find((e) => e.id === id)
  const rows = useMemo(() => flatten(data).filter((r) => r.entry.exerciseId === id), [data, id])
  const prs = useMemo(() => prHistory(rows, id), [rows, id])

  if (!ex) return (<><TopBar title="Exercice" backTo={() => back()} /><main class="page"><Empty title="Exercice introuvable" /></main></>)

  // Une valeur par séance (charge max, meilleur 1RM, volume).
  const bySession = new Map<string, FlatSet[]>()
  for (const r of [...rows].sort((a, b) => a.session.date.localeCompare(b.session.date))) {
    bySession.set(r.session.id, [...(bySession.get(r.session.id) ?? []), r])
  }
  const sessions = [...bySession.values()]
  const counted = (list: FlatSet[]) => list.filter((r) => r.load !== null)
  const labels = sessions.map((l) => fmtDate(l[0].session.date).slice(0, 5))
  const maxOf = (list: FlatSet[], f: (r: FlatSet) => number | null) => {
    const v = counted(list).map(f).filter((x): x is number => x !== null)
    return v.length ? Math.max(...v) : null
  }
  const loadSeries = sessions.map((l) => maxOf(l, (r) => r.set.load))
  const e1rmSeries = sessions.map((l) => maxOf(l, (r) => r.e1rm))
  const volSeries = sessions.map((l) => { const c = counted(l); return c.length ? round2(c.reduce((a, r) => a + (r.volume ?? 0), 0)) : null })

  const realized = rows.filter((r) => r.e1rm !== null)
  const best = (f: (r: FlatSet) => number) => realized.length ? realized.reduce((a, b) => (f(b) > f(a) ? b : a)) : null
  const bestE = best((r) => r.e1rm as number)
  const bestLoad = best((r) => r.set.load ?? 0)
  const bestVol = best((r) => r.volume ?? 0)
  const hasNumbers = sessions.some((l) => counted(l).length)

  return (
    <>
      <TopBar title={ex.name} backTo={() => back()} />
      <main class="page">
        {rows.length === 0 ? <Empty title="Pas encore de séries" text="Les séries réalisées sur cet exercice apparaîtront ici." /> : (
          <>
            <section class="kpis" aria-label="Records personnels">
              <div class="kpi"><span class="kpi-label">1RM estimé max</span><span class="kpi-value">{fmtKg(bestE?.e1rm ?? null)}</span>
                {bestE && <span class="muted small">{bestE.set.reps} × {fmtKg(bestE.set.load)} · {fmtDate(bestE.session.date)}</span>}</div>
              <div class="kpi"><span class="kpi-label">Charge max</span><span class="kpi-value">{fmtKg(bestLoad?.set.load ?? null)}</span>
                {bestLoad && <span class="muted small">{bestLoad.set.reps} reps · {fmtDate(bestLoad.session.date)}</span>}</div>
              <div class="kpi"><span class="kpi-label">Meilleure série (volume)</span><span class="kpi-value">{fmtKg(bestVol?.volume ?? null, 0)}</span></div>
              <div class="kpi"><span class="kpi-label">Séances</span><span class="kpi-value">{sessions.length}</span></div>
            </section>

            {hasNumbers && (
              <>
                <section class="card"><h2>1RM estimé par séance</h2>
                  <Chart type="line" title="1RM estimé par séance" labels={labels} series={[{ label: '1RM estimé', data: e1rmSeries }]} /></section>
                <section class="card"><h2>Charge max par séance</h2>
                  <Chart type="line" title="Charge maximale par séance" labels={labels} series={[{ label: 'Charge max', data: loadSeries }]} /></section>
                <section class="card"><h2>Volume par séance</h2>
                  <Chart type="bar" title="Volume par séance" labels={labels} series={[{ label: 'Volume', data: volSeries }]} /></section>
              </>
            )}

            <section class="card">
              <h2>Historique des séries</h2>
              {sessions.slice().reverse().map((list) => {
                const s = list[0].session
                return (
                  <div key={s.id} class="hist-session">
                    <a href={`#/historique/${s.id}`} class="row between"><strong>{fmtDate(s.date)} · {s.name}</strong><Icon name="chevron" size={18} /></a>
                    <ul class="hist-sets">
                      {list.map((r) => (
                        <li key={r.set.id} class={r.set.abandoned ? 'muted' : ''}>
                          <span>#{r.set.index} · {r.set.reps ?? '–'} × {r.set.load !== null ? fmtKg(r.set.load) : 'PDC'}{r.set.rpe !== null && ` · RPE ${fmtNum(r.set.rpe)}`}</span>
                          {r.set.abandoned && <span class="pill bad">Non faite</span>}
                          {prs.get(r.set.id)?.map((p) => <span key={p} class="pill pr" title={PR_LABEL[p]}><Icon name="trophy" size={14} /> {p === 'e1rm' ? '1RM' : p === 'load' ? 'Charge' : 'Reps'}</span>)}
                          {r.set.note && <span class="muted small block">« {r.set.note} »</span>}
                        </li>
                      ))}
                    </ul>
                    {list[0].entry.note && <p class="muted small">« {list[0].entry.note} »</p>}
                  </div>
                )
              })}
            </section>
          </>
        )}
      </main>
    </>
  )
}
