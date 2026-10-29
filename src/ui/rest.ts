// Fin du minuteur de repos : son, vibration, notification.
// Le son est « débloqué » au moment où l'on valide une série (geste utilisateur),
// condition imposée par iOS pour jouer de l'audio.

let ctx: AudioContext | null = null

export function primeAudio() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* audio indisponible */ }
}

function beep() {
  if (!ctx) return
  const t = ctx.currentTime
  for (const [i, f] of [880, 880, 1175].entries()) {
    const o = ctx.createOscillator(), g = ctx.createGain()
    o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t + i * 0.25)
    g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.25 + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.25 + 0.2)
    o.connect(g).connect(ctx.destination)
    o.start(t + i * 0.25)
    o.stop(t + i * 0.25 + 0.22)
  }
}

export async function restFinished(opts: { sound: boolean; vibrate: boolean; notify: boolean }) {
  if (opts.sound) beep()
  if (opts.vibrate && 'vibrate' in navigator) navigator.vibrate([200, 100, 200]) // sans effet sur iPhone
  if (opts.notify && document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
    const reg = await navigator.serviceWorker?.getRegistration()
    const title = 'Repos terminé'
    const body = 'C’est reparti pour la série suivante.'
    if (reg) void reg.showNotification(title, { body, tag: 'rest', icon: `${import.meta.env.BASE_URL}pwa-192x192.png` })
    else new Notification(title, { body })
  }
}

/** Garde l'écran allumé pendant la séance (Wake Lock API). */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null
  let wanted = false
  const acquire = async () => {
    if (!wanted || sentinel || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => { sentinel = null })
    } catch { /* refusé (batterie faible…) */ }
  }
  const onVis = () => void acquire()
  return {
    enable() { wanted = true; document.addEventListener('visibilitychange', onVis); void acquire() },
    disable() { wanted = false; document.removeEventListener('visibilitychange', onVis); void sentinel?.release(); sentinel = null },
  }
}
