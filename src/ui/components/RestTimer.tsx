// Minuteur de repos flottant : n'empêche pas la saisie.
import { useEffect, useRef, useState } from 'preact/hooks'
import { fmtDuration } from '../../domain/format'
import { restFinished } from '../rest'
import { activeSession, D, mutate } from '../store'
import { Icon } from './common'

export function RestTimer() {
  const s = activeSession.value
  const endsAt = s?.restEndsAt
  const [now, setNow] = useState(Date.now())
  const fired = useRef<number | null>(null)

  useEffect(() => {
    if (!endsAt) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [endsAt])

  const remaining = endsAt ? Math.ceil((endsAt - now) / 1000) : 0
  useEffect(() => {
    if (!endsAt || remaining > 0 || fired.current === endsAt) return
    fired.current = endsAt
    // Ne sonne que si la fin vient d'arriver (pas au retour après une longue absence).
    if (now - endsAt < 5_000) void restFinished(D().settings)
    const id = s!.id
    setTimeout(() => mutate('Fin du repos', (d) => {
      const x = d.sessions.find((y) => y.id === id)
      if (x && x.restEndsAt === endsAt) delete x.restEndsAt
    }, { undoable: false }), 1500)
  }, [remaining, endsAt])

  if (!s || !endsAt) return null
  const adjust = (sec: number) => mutate('Repos', (d) => {
    const x = d.sessions.find((y) => y.id === s.id)
    if (x?.restEndsAt) x.restEndsAt = Math.max(Date.now() + 1000, x.restEndsAt + sec * 1000)
  }, { undoable: false })
  const stop = () => mutate('Repos', (d) => { delete d.sessions.find((y) => y.id === s.id)!.restEndsAt }, { undoable: false })

  return (
    <div class={`rest ${remaining <= 0 ? 'rest-done' : ''}`} role="timer" aria-live="off">
      <Icon name="timer" />
      <span class="rest-time" aria-label={`Repos restant ${remaining} secondes`}>{remaining > 0 ? fmtDuration(remaining) : 'Go !'}</span>
      <button class="btn small ghost" onClick={() => adjust(-15)} aria-label="Retirer 15 secondes">−15 s</button>
      <button class="btn small ghost" onClick={() => adjust(15)} aria-label="Ajouter 15 secondes">+15 s</button>
      <button class="icon-btn" onClick={stop} aria-label="Arrêter le minuteur"><Icon name="x" /></button>
    </div>
  )
}
