// Données de démonstration : 10 semaines fictives de programme Upper / Lower.
// Uniquement en mémoire, jamais enregistrées ni mélangées aux vraies données.
import { addDaysISO, mondayOf, todayISO, uid } from '../domain/format'
import type { AppData, Session } from '../domain/types'
import { initialData } from './initial'

const START_LOAD: Record<string, number> = {
  'Développé couché barre': 60, 'Rowing barre': 50, 'Développé militaire barre': 35, 'Tractions supination': 0,
  'Pushdown triceps': 22.5, 'Curl biceps barre': 25, 'Squat barre': 70, 'Soulevé de terre roumain': 60,
  'Fentes bulgares': 12, 'Leg curl': 35, 'Mollets debout': 60, 'Relevé de jambes suspendu': 0,
  'Développé incliné haltères': 20, 'Tirage vertical': 50, 'Dips lestés': 5, 'Tirage horizontal': 45,
  'Élévations latérales': 8, 'Curl marteau': 12, 'Extension triceps poulie overhead': 18, 'Soulevé de terre': 90,
  'Hip thrust': 70, 'Presse à cuisses': 120, 'Leg curl assis': 35, 'Mollets assis': 40, 'Ab wheel': 0,
}

export function buildDemoData(): AppData {
  const d = initialData()
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const weeks = 10
  // Le programme démo commence 9 semaines avant la semaine courante.
  const mondayToday = new Date(mondayOf(todayISO()) * 86_400_000).toISOString().slice(0, 10)
  const start = addDaysISO(mondayToday, -7 * (weeks - 1))
  d.settings.programStart = start
  d.settings.weeklyVolumeGoal = 25000
  d.settings.lastExportAt = Date.now()
  d.settings.deloadWeeks = []
  const exName = new Map(d.exercises.map((e) => [e.id, e.name]))
  const offsets = [0, 1, 3, 4] // lundi, mardi, jeudi, vendredi

  for (let w = 0; w < weeks; w++) {
    d.settings.templateOrder.forEach((tid, i) => {
      const date = addDaysISO(start, w * 7 + offsets[i])
      if (date > todayISO()) return
      if (w === 4 && i === 3) return // une séance manquée
      const t = d.templates.find((x) => x.id === tid)!
      const s: Session = { id: uid(), date, name: t.name, templateId: t.id, status: 'done', note: '', entries: [] }
      for (const item of t.items) {
        const name = exName.get(item.exerciseId)!
        const base = START_LOAD[name] ?? 20
        const load = base === 0 ? 0 : Math.round((base * (1 + w * 0.02)) / 2.5) * 2.5
        s.entries.push({
          id: uid(), exerciseId: item.exerciseId, repMin: item.repMin, repMax: item.repMax, restSec: item.restSec,
          superset: item.superset, note: '',
          sets: Array.from({ length: item.sets }, (_, k) => {
            const reps = Math.max(item.repMin - 1, Math.min(item.repMax, item.repMin + Math.floor(rnd() * 3) + (w % 3) - k))
            return {
              id: uid(), index: k + 1, planned: `${item.repMin}-${item.repMax}`, reps, load,
              rpe: Math.min(10, 7 + k * 0.5 + Math.round(rnd() * 2) / 2), done: true, note: '',
            }
          }),
        })
      }
      if (w === 6 && i === 1) {
        s.note = 'Douleur dans le bas du dos, j’arrête les jambes'
        const last = s.entries.at(-2)!
        last.sets.forEach((x) => { x.reps = 0; x.done = false; x.abandoned = true })
      }
      d.sessions.push(s)
    })
  }
  for (let m = 0; m < 3; m++) {
    d.body.push({
      id: uid(), date: addDaysISO(start, m * 28), weight: 76.5 + m * 0.9, waist: 83 + m * 0.4,
      arm: 33.5 + m * 0.3, thigh: 57 + m * 0.5, chest: 100 + m * 0.6, note: m === 0 ? 'Début du programme' : '',
    })
  }
  return d
}
