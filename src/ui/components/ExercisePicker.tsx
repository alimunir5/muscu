// Sélecteur d'exercice plein écran, avec recherche, groupé par muscle.
import { signal } from '@preact/signals'
import { useEffect, useRef, useState } from 'preact/hooks'
import { nameKey } from '../../domain/format'
import type { ID } from '../../domain/types'
import { D } from '../store'
import { Icon } from './common'

const state = signal<{ title: string; resolve: (id: ID | null) => void } | null>(null)

export function pickExercise(title = 'Choisir un exercice'): Promise<ID | null> {
  return new Promise((resolve) => { state.value = { title, resolve } })
}

export function ExercisePickerHost() {
  const st = state.value
  const [q, setQ] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (st) { setQ(''); setTimeout(() => input.current?.focus(), 0) } }, [st])
  if (!st) return null
  const data = D()
  const close = (id: ID | null) => { state.value = null; st.resolve(id) }
  const k = nameKey(q)
  const groups = data.groups.filter((g) => !g.archived).map((g) => ({
    g, list: data.exercises.filter((e) => e.groupId === g.id && !e.archived && (!k || nameKey(e.name).includes(k))),
  })).filter((x) => x.list.length)

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label={st.title} onKeyDown={(e) => e.key === 'Escape' && close(null)}>
      <div class="sheet-head">
        <h2>{st.title}</h2>
        <button class="icon-btn" onClick={() => close(null)} aria-label="Fermer"><Icon name="x" /></button>
      </div>
      <input ref={input} class="search" type="search" placeholder="Rechercher…" value={q}
        onInput={(e) => setQ(e.currentTarget.value)} aria-label="Rechercher un exercice" />
      <div class="sheet-body">
        {groups.length === 0 && <p class="muted center">Aucun exercice trouvé. Ajoute-le dans Réglages → Bibliothèque.</p>}
        {groups.map(({ g, list }) => (
          <section key={g.id}>
            <h3 class="group-title">{g.name}</h3>
            <ul class="list">
              {list.map((e) => (
                <li key={e.id}><button class="list-btn" onClick={() => close(e.id)}>{e.name}</button></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
