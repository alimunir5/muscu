// Historique filtrable et consultation / correction d'une séance.
import { useMemo, useState } from 'preact/hooks'
import { flatten, sessionWeek, totalVolume } from '../../domain/calc'
import { fmtDate, fmtKg } from '../../domain/format'
import { Empty, Icon, TopBar } from '../components/common'
import { SessionBody, SessionHeader } from '../components/SessionEditor'
import { confirmDialog, toast } from '../dialogs'
import { back, go } from '../router'
import { D, mutate } from '../store'

export function HistoryList() {
  const data = D()
  const [name, setName] = useState('')
  const [exId, setExId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const done = data.sessions.filter((s) => s.status === 'done')
  const names = [...new Set(done.map((s) => s.name))].sort()
  const usedEx = new Set(done.flatMap((s) => s.entries.map((e) => e.exerciseId)))
  const exercises = data.exercises.filter((e) => usedEx.has(e.id)).sort((a, b) => a.name.localeCompare(b.name))

  const list = useMemo(() => done
    .filter((s) => (!name || s.name === name) && (!exId || s.entries.some((e) => e.exerciseId === exId))
      && (!from || s.date >= from) && (!to || s.date <= to))
    .sort((a, b) => b.date.localeCompare(a.date)), [data, name, exId, from, to])

  const volumeOf = useMemo(() => {
    const rows = flatten(data)
    const m = new Map<string, number>()
    for (const r of rows) if (r.volume !== null) m.set(r.session.id, (m.get(r.session.id) ?? 0) + r.volume)
    return m
  }, [data])
  const filtered = !!(name || exId || from || to)

  return (
    <>
      <TopBar title="Historique" />
      <main class="page">
        {done.length === 0 ? (
          <Empty title="Aucune séance enregistrée" text="Tes séances terminées apparaîtront ici.">
            <div class="row gap center wrap">
              <button class="btn primary" onClick={() => go('/seance')}>Démarrer une séance</button>
              <button class="btn" onClick={() => go('/reglages/import')}>Importer</button>
            </div>
          </Empty>
        ) : (
          <>
            <details class="card filters" open={filtered}>
              <summary>Filtres{filtered && ` · ${list.length} résultat(s)`}</summary>
              <label class="field"><span>Séance</span>
                <select value={name} onChange={(e) => setName(e.currentTarget.value)}>
                  <option value="">Toutes</option>
                  {names.map((n) => <option key={n}>{n}</option>)}
                </select>
              </label>
              <label class="field"><span>Exercice</span>
                <select value={exId} onChange={(e) => setExId(e.currentTarget.value)}>
                  <option value="">Tous</option>
                  {exercises.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </label>
              <div class="grid2">
                <label class="field"><span>Du</span><input type="date" value={from} onChange={(e) => setFrom(e.currentTarget.value)} /></label>
                <label class="field"><span>Au</span><input type="date" value={to} onChange={(e) => setTo(e.currentTarget.value)} /></label>
              </div>
              {filtered && <button class="btn small ghost" onClick={() => { setName(''); setExId(''); setFrom(''); setTo('') }}>Effacer les filtres</button>}
            </details>
            {list.length === 0 && <p class="muted center">Aucune séance ne correspond aux filtres.</p>}
            <ul class="list cards">
              {list.map((s) => (
                <li key={s.id}>
                  <a class="card session-link" href={`#/historique/${s.id}`}>
                    <span class="grow">
                      <strong>{s.name}</strong> <span class="muted">· S{sessionWeek(s, data.settings)}</span>
                      <span class="muted small block">{fmtDate(s.date)} · {s.entries.length} exercices · {fmtKg(volumeOf.get(s.id) ?? null, 0)}</span>
                      {s.note && <span class="muted small block">« {s.note} »</span>}
                    </span>
                    <Icon name="chevron" />
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </>
  )
}

export function SessionDetail({ id }: { id: string }) {
  const data = D()
  const s = data.sessions.find((x) => x.id === id)
  if (!s) {
    return (
      <>
        <TopBar title="Séance" backTo={() => go('/historique')} />
        <main class="page"><Empty title="Séance introuvable" text="Elle a peut-être été supprimée." /></main>
      </>
    )
  }
  const vol = totalVolume(flatten({ ...data, sessions: [s] }, { includeActive: true }))
  const remove = async () => {
    if (!(await confirmDialog('Supprimer cette séance ?', `${s.name} du ${fmtDate(s.date)} et toutes ses séries.`, { confirm: 'Supprimer', danger: true }))) return
    mutate('Supprimer la séance', (d) => { d.sessions = d.sessions.filter((x) => x.id !== id) })
    toast('Séance supprimée')
    go('/historique')
  }
  return (
    <>
      <TopBar title={fmtDate(s.date)} backTo={() => back('/historique')} />
      <main class="page">
        {s.status === 'active' && <p class="card notice">Séance en cours. <a href="#/seance">Ouvrir dans l’onglet Séance</a></p>}
        <SessionHeader session={s} mode="edit" />
        <p class="muted">Volume de la séance : <strong>{fmtKg(vol, 0)}</strong>. Touche une série pour la corriger.</p>
        <SessionBody session={s} mode="edit" />
        <button class="btn ghost danger-text full" onClick={remove}><Icon name="trash" /> Supprimer la séance</button>
      </main>
    </>
  )
}
