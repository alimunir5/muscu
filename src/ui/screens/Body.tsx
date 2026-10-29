// Poids et mensurations : saisie, courbes, variation entre deux dates.
import { useState } from 'preact/hooks'
import { fmtDate, fmtNum, isValidISO, todayISO, uid } from '../../domain/format'
import type { BodyEntry } from '../../domain/types'
import { Chart } from '../components/Chart'
import { Empty, Icon, NumField, TopBar } from '../components/common'
import { confirmDialog, toast } from '../dialogs'
import { D, mutate } from '../store'

type Measure = 'weight' | 'waist' | 'arm' | 'thigh' | 'chest'
const MEASURES: { key: Measure; label: string; unit: string }[] = [
  { key: 'weight', label: 'Poids', unit: 'kg' },
  { key: 'waist', label: 'Tour de taille', unit: 'cm' },
  { key: 'arm', label: 'Tour de bras', unit: 'cm' },
  { key: 'thigh', label: 'Tour de cuisse', unit: 'cm' },
  { key: 'chest', label: 'Tour de poitrine', unit: 'cm' },
]

const blank = (): BodyEntry => ({ id: uid(), date: todayISO(), weight: null, waist: null, arm: null, thigh: null, chest: null, note: '' })

export function Body() {
  const data = D()
  const list = [...data.body].sort((a, b) => b.date.localeCompare(a.date))
  const [editing, setEditing] = useState<BodyEntry | null>(null)
  const [a, setA] = useState('')
  const [b, setB] = useState('')

  if (editing) return <BodyForm entry={editing} onClose={() => setEditing(null)} />

  const chrono = [...list].reverse()
  const ea = data.body.find((x) => x.id === a) ?? chrono[0]
  const eb = data.body.find((x) => x.id === b) ?? chrono.at(-1)

  return (
    <>
      <TopBar title="Corps" />
      <main class="page">
        <button class="btn primary big full" onClick={() => setEditing(blank())}><Icon name="plus" /> Nouvelle mesure</button>
        {list.length === 0 ? (
          <Empty title="Aucune mesure" text="Ajoute ton poids et tes mensurations chaque mois pour suivre ton évolution. Ton dernier poids sert aussi au calcul du volume des exercices au poids de corps." />
        ) : (
          <>
            {chrono.length >= 2 && ea && eb && (
              <section class="card">
                <h2>Variation</h2>
                <div class="grid2">
                  <label class="field"><span>Du</span>
                    <select value={ea.id} onChange={(e) => setA(e.currentTarget.value)}>
                      {chrono.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.date)}</option>)}
                    </select></label>
                  <label class="field"><span>Au</span>
                    <select value={eb.id} onChange={(e) => setB(e.currentTarget.value)}>
                      {chrono.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.date)}</option>)}
                    </select></label>
                </div>
                <table class="table">
                  <thead><tr><th scope="col">Mesure</th><th scope="col" class="num">{fmtDate(ea.date).slice(0, 5)}</th><th scope="col" class="num">{fmtDate(eb.date).slice(0, 5)}</th><th scope="col" class="num">Écart</th></tr></thead>
                  <tbody>
                    {MEASURES.map((m) => {
                      const va = ea[m.key], vb = eb[m.key]
                      const diff = va !== null && vb !== null ? vb - va : null
                      return (
                        <tr key={m.key}>
                          <th scope="row">{m.label}</th>
                          <td class="num">{fmtNum(va)}</td><td class="num">{fmtNum(vb)}</td>
                          <td class="num"><strong>{diff === null ? '—' : `${diff > 0 ? '+' : ''}${fmtNum(diff)} ${m.unit}`}</strong></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </section>
            )}

            {chrono.length >= 2 && MEASURES.map((m) => chrono.some((x) => x[m.key] !== null) && (
              <section class="card" key={m.key}>
                <h2>{m.label} <span class="muted small">({m.unit})</span></h2>
                <Chart type="line" title={m.label} unit={m.unit} height={160}
                  labels={chrono.map((x) => fmtDate(x.date).slice(0, 5))}
                  series={[{ label: m.label, data: chrono.map((x) => x[m.key]) }]} />
              </section>
            ))}

            <section class="card">
              <h2>Mesures</h2>
              <ul class="list">
                {list.map((x) => (
                  <li key={x.id}>
                    <button class="list-btn" onClick={() => setEditing(structuredClone(x))}>
                      <span class="grow">
                        <strong>{fmtDate(x.date)}</strong>{x.weight !== null && ` · ${fmtNum(x.weight)} kg`}
                        <span class="muted small block">
                          {MEASURES.slice(1).filter((m) => x[m.key] !== null).map((m) => `${m.label.replace('Tour de ', '')} ${fmtNum(x[m.key])}`).join(' · ')}
                        </span>
                        {x.note && <span class="muted small block">« {x.note} »</span>}
                      </span>
                      <Icon name="chevron" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  )
}

function BodyForm({ entry, onClose }: { entry: BodyEntry; onClose: () => void }) {
  const data = D()
  const [e, setE] = useState(entry)
  const exists = data.body.some((x) => x.id === entry.id)
  const set = (patch: Partial<BodyEntry>) => setE({ ...e, ...patch })

  const save = () => {
    if (!isValidISO(e.date)) return toast('Date invalide', { kind: 'error' })
    if (MEASURES.every((m) => e[m.key] === null) && !e.note.trim()) return toast('Saisis au moins une mesure', { kind: 'error' })
    mutate(exists ? 'Modifier une mesure' : 'Ajouter une mesure', (d) => {
      d.body = [...d.body.filter((x) => x.id !== e.id), e]
    })
    onClose()
  }
  const remove = async () => {
    if (!(await confirmDialog('Supprimer cette mesure ?', `Mesure du ${fmtDate(e.date)}.`, { confirm: 'Supprimer', danger: true }))) return
    mutate('Supprimer une mesure', (d) => { d.body = d.body.filter((x) => x.id !== e.id) })
    onClose()
  }

  return (
    <>
      <TopBar title={exists ? 'Modifier la mesure' : 'Nouvelle mesure'} backTo={onClose} />
      <main class="page">
        <section class="card">
          <label class="field"><span>Date</span>
            <input type="date" value={e.date} onChange={(ev) => set({ date: ev.currentTarget.value })} /></label>
          {MEASURES.map((m) => (
            <NumField key={m.key} label={m.label} unit={m.unit} value={e[m.key]} max={500} onChange={(v) => set({ [m.key]: v })} />
          ))}
          <label class="field"><span>Notes</span>
            <textarea rows={2} value={e.note} onInput={(ev) => set({ note: ev.currentTarget.value })} /></label>
        </section>
        <button class="btn primary big full" onClick={save}><Icon name="check" /> Enregistrer</button>
        {exists && <button class="btn ghost danger-text full" onClick={remove}><Icon name="trash" /> Supprimer</button>}
      </main>
    </>
  )
}
