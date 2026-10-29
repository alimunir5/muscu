// Graphique Chart.js chargé à la demande (hors du bundle initial).
// Palette catégorielle validée (ordre fixe, jamais cyclé), 1 seul axe Y,
// lignes de 2 px, marqueurs de 8 px, légende dès 2 séries, info-bulle au survol.
import { useEffect, useRef, useState } from 'preact/hooks'
import type { Chart as ChartType } from 'chart.js'
import { fmtNum } from '../../domain/format'

export interface Series { label: string; data: (number | null)[] }

const SLOTS = 8
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

let loader: Promise<typeof import('chart.js')> | null = null
function loadChart() {
  return (loader ??= import('chart.js').then((m) => {
    m.Chart.register(m.BarController, m.LineController, m.BarElement, m.LineElement, m.PointElement,
      m.CategoryScale, m.LinearScale, m.Tooltip, m.Legend)
    return m
  }))
}

/** Suit le thème système pour redessiner avec les bonnes couleurs. */
function useScheme() {
  const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: dark)') : null
  const [dark, setDark] = useState(mq?.matches ?? false)
  useEffect(() => {
    const on = () => setDark(!!mq?.matches)
    mq?.addEventListener('change', on)
    return () => mq?.removeEventListener('change', on)
  }, [])
  return dark
}

export function Chart({ type, labels, series, unit = 'kg', title, height = 220 }: {
  type: 'bar' | 'line'; labels: string[]; series: Series[]; unit?: string; title: string; height?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const chart = useRef<ChartType | null>(null)
  const dark = useScheme()

  useEffect(() => {
    let cancelled = false
    void loadChart().then(({ Chart }) => {
      if (cancelled || !canvas.current) return
      chart.current?.destroy()
      const text = css('--text-2'), grid = css('--grid'), surface = css('--surface')
      chart.current = new Chart(canvas.current, {
        type,
        data: {
          labels,
          datasets: series.map((s, i) => {
            const color = css(`--series-${(i % SLOTS) + 1}`)
            return {
              label: s.label, data: s.data, backgroundColor: color, borderColor: color,
              borderWidth: type === 'line' ? 2 : 0, borderRadius: type === 'bar' ? 4 : 0, borderSkipped: 'start',
              pointRadius: 4, pointHoverRadius: 6, pointBorderColor: surface, pointBorderWidth: 2,
              spanGaps: true, maxBarThickness: 28, categoryPercentage: 0.8, barPercentage: 0.9,
            }
          }),
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: series.length > 1, position: 'bottom', labels: { color: text, boxWidth: 12, boxHeight: 12, usePointStyle: true } },
            tooltip: {
              callbacks: {
                label: (ctx) => ctx.parsed.y === null ? '' : `${ctx.dataset.label} : ${fmtNum(ctx.parsed.y)} ${unit}`,
              },
            },
          },
          scales: {
            x: { ticks: { color: text, maxRotation: 0, autoSkip: true }, grid: { display: false }, border: { color: grid } },
            y: { beginAtZero: type === 'bar', ticks: { color: text, callback: (v) => fmtNum(Number(v), 0) }, grid: { color: grid }, border: { display: false } },
          },
        },
      })
    })
    return () => { cancelled = true }
  }, [type, labels.join('|'), JSON.stringify(series), dark])

  useEffect(() => () => chart.current?.destroy(), [])

  return (
    <div class="chart" style={{ height: `${height}px` }}>
      <canvas ref={canvas} role="img" aria-label={`${title}. ${describe(labels, series, unit)}`} />
    </div>
  )
}

/** Résumé textuel pour les lecteurs d'écran. */
function describe(labels: string[], series: Series[], unit: string): string {
  return series.map((s) => {
    const pts = s.data.map((v, i) => (v === null ? null : `${labels[i]} ${fmtNum(v)} ${unit}`)).filter(Boolean)
    return `${s.label} : ${pts.length ? pts.slice(-6).join(', ') : 'aucune donnée'}`
  }).join('. ')
}
