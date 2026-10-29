// Routeur minimal basé sur le hash (compatible GitHub Pages, sans config serveur).
import { signal } from '@preact/signals'

const read = () => (location.hash.replace(/^#/, '') || '/').split('?')[0]
export const route = signal(read())
window.addEventListener('hashchange', () => {
  route.value = read()
  window.scrollTo(0, 0)
})

export const go = (path: string) => { location.hash = `#${path}` }
export const back = (fallback = '/') => (history.length > 1 ? history.back() : go(fallback))

/** « /historique/:id » → { id } si la route correspond. */
export function match(pattern: string, path = route.value): Record<string, string> | null {
  const p = pattern.split('/'), a = path.split('/')
  if (p.length !== a.length) return null
  const out: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) out[p[i].slice(1)] = decodeURIComponent(a[i])
    else if (p[i] !== a[i]) return null
  }
  return out
}
