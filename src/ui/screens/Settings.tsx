// Réglages : programme, modèles, bibliothèque, saisie, sauvegarde, sécurité.
import { useState } from 'preact/hooks'
import { RPE_SCALE } from '../../domain/calc'
import { cleanName, fmtDate, fmtDuration, isValidISO, nameKey, uid } from '../../domain/format'
import type { Equipment, Exercise, Template, TemplateItem, VolumeMode } from '../../domain/types'
import { bodyCsv, buildExport, journalCsv, libraryCsv, sessionsCsv } from '../../db/backup'
import { WrongPasswordError } from '../../db/vault'
import { Empty, Icon, NumField, Toggle, TopBar } from '../components/common'
import { pickExercise } from '../components/ExercisePicker'
import { confirmDialog, promptDialog, toast } from '../dialogs'
import { saveFile, stamp } from '../download'
import { back, go } from '../router'
import { D, demo, lock, mutate, vault } from '../store'

const EQUIPMENTS: Equipment[] = ['barre', 'haltères', 'machine', 'poulie', 'poids de corps', 'autre']
const VOLUME_MODES: { v: VolumeMode; label: string }[] = [
  { v: 'charge', label: 'Reps × charge (lest)' },
  { v: 'pdc', label: 'Reps × (poids de corps + lest)' },
  { v: 'aucun', label: 'Pas de volume' },
]

const sub = (title: string) => <TopBar title={title} backTo={() => back('/reglages')} />

export function SettingsHome() {
  const items: [string, string, string][] = [
    ['/reglages/programme', 'Programme', 'Séances par semaine, date de début, objectif, deload'],
    ['/reglages/modeles', 'Modèles de séance', 'Haut A, Bas A… exercices, séries, reps, repos'],
    ['/reglages/bibliotheque', 'Bibliothèque d’exercices', 'Groupes musculaires et exercices'],
    ['/reglages/suivis', 'Mouvements suivis', 'Exercices affichés dans le tableau de bord'],
    ['/reglages/saisie', 'Saisie et minuteur', 'Pas des charges, son, vibration, notification'],
    ['/reglages/rpe', 'Échelle RPE', 'Repères RPE / reps en réserve'],
    ['/reglages/sauvegarde', 'Sauvegarde et import', 'Export JSON / CSV, restauration, import Excel'],
    ['/reglages/securite', 'Sécurité', 'Mot de passe, verrouillage, limites'],
  ]
  return (
    <>
      <TopBar title="Réglages" />
      <main class="page">
        {demo.value && (
          <section class="card notice">
            <p><strong>Mode démo.</strong> Données fictives, rien n’est enregistré. Tes vraies données ne sont jamais touchées.</p>
            <button class="btn small" onClick={() => void lock()}>Quitter le mode démo</button>
          </section>
        )}
        <ul class="list cards">
          {items.map(([href, title, desc]) => (
            <li key={href}>
              <a class="card session-link" href={`#${href}`}>
                <span class="grow"><strong>{title}</strong><span class="muted small block">{desc}</span></span>
                <Icon name="chevron" />
              </a>
            </li>
          ))}
        </ul>
        <p class="muted small center">Muscu · données chiffrées sur cet appareil uniquement</p>
      </main>
    </>
  )
}

// ---------- Programme ----------

export function ProgramSettings() {
  const s = D().settings
  const upd = (label: string, fn: (x: typeof s) => void) => mutate(label, (d) => fn(d.settings))
  return (
    <>
      {sub('Programme')}
      <main class="page">
        <section class="card">
          <NumField label="Séances prévues par semaine" integer min={1} max={14} value={s.sessionsPerWeek}
            onChange={(v) => v !== null && upd('Séances par semaine', (x) => { x.sessionsPerWeek = v })} />
          <NumField label="Objectif de volume hebdomadaire" unit="kg, optionnel" value={s.weeklyVolumeGoal}
            onChange={(v) => upd('Objectif de volume', (x) => { x.weeklyVolumeGoal = v && v > 0 ? v : null })} />
          <label class="field">
            <span>Date de début du programme</span>
            <input type="date" value={s.programStart} onChange={(e) => {
              const v = e.currentTarget.value
              if (isValidISO(v)) upd('Date de début', (x) => { x.programStart = v })
              else toast('Date invalide', { kind: 'error' })
            }} />
            <small class="muted">Semaine 1 = la semaine (lundi → dimanche) qui contient le {fmtDate(s.programStart)}. Le numéro reste corrigeable sur chaque séance.</small>
          </label>
          <NumField label="Proposer un deload toutes les" unit="semaines" integer min={3} max={16} value={s.deloadEvery}
            onChange={(v) => v !== null && upd('Fréquence du deload', (x) => { x.deloadEvery = v })} />
          {s.deloadWeeks.length > 0 && (
            <p class="muted small">Semaines de deload : {s.deloadWeeks.join(', ')}{' '}
              <button class="link-btn small" onClick={() => upd('Réinitialiser les deloads', (x) => { x.deloadWeeks = []; x.deloadDismissedWeek = null })}>réinitialiser</button></p>
          )}
        </section>
        <p class="muted small">Ordre et liste des séances du programme : voir <a href="#/reglages/modeles">Modèles de séance</a>.</p>
      </main>
    </>
  )
}

// ---------- Modèles ----------

export function TemplatesList() {
  const data = D()
  const order = data.settings.templateOrder.map((id) => data.templates.find((t) => t.id === id)).filter((t): t is Template => !!t)
  const move = (i: number, dir: -1 | 1) => mutate('Réordonner les séances', (d) => {
    const o = d.settings.templateOrder, j = i + dir
    if (j < 0 || j >= o.length) return
    ;[o[i], o[j]] = [o[j], o[i]]
  })
  const add = async () => {
    const name = await promptDialog('Nouvelle séance', 'Nom', '', { validate: (v) => (v.trim() ? null : 'Nom requis') })
    if (!name) return
    const id = uid()
    mutate('Nouvelle séance', (d) => { d.templates.push({ id, name: cleanName(name), items: [] }); d.settings.templateOrder.push(id) })
    go(`/reglages/modeles/${id}`)
  }
  return (
    <>
      {sub('Modèles de séance')}
      <main class="page">
        {order.length === 0 && <Empty title="Aucun modèle" text="Crée ta première séance type." />}
        <ul class="list cards">
          {order.map((t, i) => (
            <li key={t.id} class="card row gap">
              <a class="grow" href={`#/reglages/modeles/${t.id}`}><strong>{t.name}</strong><span class="muted small block">{t.items.length} exercices</span></a>
              <button class="icon-btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter ${t.name}`}><Icon name="up" /></button>
              <button class="icon-btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre ${t.name}`}><Icon name="down" /></button>
            </li>
          ))}
        </ul>
        <button class="btn full" onClick={add}><Icon name="plus" /> Nouvelle séance</button>
      </main>
    </>
  )
}

export function TemplateEdit({ id }: { id: string }) {
  const data = D()
  const t = data.templates.find((x) => x.id === id)
  if (!t) return (<>{sub('Modèle')}<main class="page"><Empty title="Modèle introuvable" /></main></>)
  const name = (exId?: string) => data.exercises.find((e) => e.id === exId)?.name ?? '?'
  const edit = (label: string, fn: (t: Template) => void) => mutate(label, (d) => { const x = d.templates.find((y) => y.id === id); if (x) fn(x) })
  const editItem = (itemId: string, label: string, fn: (it: TemplateItem) => void) =>
    edit(label, (x) => { const it = x.items.find((y) => y.id === itemId); if (it) fn(it) })

  const addItem = async () => {
    const exId = await pickExercise('Ajouter au modèle')
    if (exId) edit('Ajouter un exercice au modèle', (x) => { x.items.push({ id: uid(), exerciseId: exId, sets: 3, repMin: 8, repMax: 12, restSec: 90 }) })
  }
  const remove = async () => {
    if (!(await confirmDialog(`Supprimer le modèle « ${t.name} » ?`, 'Les séances déjà réalisées restent dans l’historique.', { confirm: 'Supprimer', danger: true }))) return
    mutate('Supprimer un modèle', (d) => {
      d.templates = d.templates.filter((x) => x.id !== id)
      d.settings.templateOrder = d.settings.templateOrder.filter((x) => x !== id)
    })
    go('/reglages/modeles')
  }

  return (
    <>
      <TopBar title={t.name} backTo={() => go('/reglages/modeles')} actions={
        <button class="icon-btn" aria-label="Renommer" onClick={async () => {
          const n = await promptDialog('Renommer la séance', 'Nom', t.name, { validate: (v) => (v.trim() ? null : 'Nom requis') })
          if (n) edit('Renommer le modèle', (x) => { x.name = cleanName(n) })
        }}><Icon name="note" /></button>
      } />
      <main class="page">
        {t.items.length === 0 && <Empty title="Modèle vide" text="Ajoute les exercices de cette séance." />}
        {t.items.map((it, i) => (
          <article key={it.id} class={`card ${it.superset ? 'superset' : ''}`}>
            <div class="row between gap">
              <button class="link-btn grow left" onClick={async () => {
                const exId = await pickExercise('Remplacer par…')
                if (exId) editItem(it.id, 'Remplacer un exercice', (x) => { x.exerciseId = exId })
              }}><strong>{i + 1}. {name(it.exerciseId)}</strong></button>
              <button class="icon-btn" disabled={i === 0} aria-label="Monter" onClick={() => edit('Réordonner', (x) => { [x.items[i - 1], x.items[i]] = [x.items[i], x.items[i - 1]] })}><Icon name="up" /></button>
              <button class="icon-btn" disabled={i === t.items.length - 1} aria-label="Descendre" onClick={() => edit('Réordonner', (x) => { [x.items[i + 1], x.items[i]] = [x.items[i], x.items[i + 1]] })}><Icon name="down" /></button>
              <button class="icon-btn danger-text" aria-label={`Retirer ${name(it.exerciseId)}`} onClick={async () => {
                if (await confirmDialog(`Retirer « ${name(it.exerciseId)} » du modèle ?`, undefined, { confirm: 'Retirer', danger: true })) {
                  edit('Retirer un exercice du modèle', (x) => { x.items = x.items.filter((y) => y.id !== it.id) })
                }
              }}><Icon name="trash" /></button>
            </div>
            <div class="grid4">
              <NumField label="Séries" integer min={1} max={20} value={it.sets} onChange={(v) => v && editItem(it.id, 'Séries', (x) => { x.sets = v })} />
              <NumField label="Reps min" integer min={1} max={100} value={it.repMin} onChange={(v) => v && editItem(it.id, 'Reps min', (x) => { x.repMin = v; if (x.repMax < v) x.repMax = v })} />
              <NumField label="Reps max" integer min={1} max={100} value={it.repMax} onChange={(v) => v && editItem(it.id, 'Reps max', (x) => { x.repMax = Math.max(v, x.repMin) })} />
              <NumField label="Repos (s)" integer min={0} max={900} value={it.restSec} onChange={(v) => v !== null && editItem(it.id, 'Repos', (x) => { x.restSec = v })} />
            </div>
            <p class="muted small">Repos {fmtDuration(it.restSec)}{it.altExerciseId && ` · variante : ${name(it.altExerciseId)}`}</p>
            <label class="field"><span>Note</span>
              <input value={it.note ?? ''} onChange={(e) => { const v = e.currentTarget.value; editItem(it.id, 'Note', (x) => { x.note = v || undefined }) }} /></label>
            {i > 0 && (
              <Toggle label="En superset avec l’exercice précédent" checked={!!it.superset && it.superset === t.items[i - 1].superset}
                onChange={(on) => edit('Superset', (x) => {
                  const prev = x.items[i - 1], cur = x.items[i]
                  if (on) { prev.superset ??= uid(); cur.superset = prev.superset } else delete cur.superset
                })} />
            )}
            <div class="row gap wrap">
              <button class="btn small ghost" onClick={async () => {
                const exId = await pickExercise('Variante proposée')
                if (exId) editItem(it.id, 'Variante', (x) => { x.altExerciseId = exId })
              }}>{it.altExerciseId ? 'Changer la variante' : 'Ajouter une variante'}</button>
              {it.altExerciseId && <button class="btn small ghost" onClick={() => editItem(it.id, 'Retirer la variante', (x) => { delete x.altExerciseId })}>Retirer la variante</button>}
            </div>
          </article>
        ))}
        <button class="btn full" onClick={addItem}><Icon name="plus" /> Ajouter un exercice</button>
        <button class="btn ghost danger-text full" onClick={remove}><Icon name="trash" /> Supprimer ce modèle</button>
      </main>
    </>
  )
}

// ---------- Bibliothèque ----------

function validName(v: string, existing: string[], current?: string): string | null {
  const k = nameKey(v)
  if (!k) return 'Nom requis'
  if (existing.some((n) => nameKey(n) === k && nameKey(n) !== nameKey(current ?? ''))) return 'Ce nom existe déjà'
  return null
}

export function Library() {
  const data = D()
  const [showArchived, setShowArchived] = useState(false)
  const groups = data.groups.filter((g) => showArchived || !g.archived)

  const addGroup = async () => {
    const n = await promptDialog('Nouveau groupe musculaire', 'Nom', '', { validate: (v) => validName(v, data.groups.map((g) => g.name)) })
    if (n) mutate('Nouveau groupe', (d) => { d.groups.push({ id: uid(), name: cleanName(n), archived: false }) })
  }
  const addExercise = async (groupId: string) => {
    const n = await promptDialog('Nouvel exercice', 'Nom', '', { validate: (v) => validName(v, data.exercises.map((e) => e.name)) })
    if (!n) return
    const id = uid()
    mutate('Nouvel exercice', (d) => {
      d.exercises.push({ id, name: cleanName(n), groupId, equipment: 'haltères', compound: false, kind: 'sets', volumeMode: 'charge', unilateral: false, archived: false })
    })
    go(`/reglages/exercice/${id}`)
  }
  const groupMenu = async (gid: string) => {
    const g = data.groups.find((x) => x.id === gid)!
    const n = await promptDialog(`Renommer « ${g.name} »`, 'Nom', g.name, { validate: (v) => validName(v, data.groups.map((x) => x.name), g.name) })
    if (n) mutate('Renommer le groupe', (d) => { d.groups.find((x) => x.id === gid)!.name = cleanName(n) })
  }
  const deleteGroup = async (gid: string) => {
    const g = data.groups.find((x) => x.id === gid)!
    if (data.exercises.some((e) => e.groupId === gid)) return toast('Ce groupe contient des exercices : déplace-les ou archive le groupe.', { kind: 'error' })
    if (await confirmDialog(`Supprimer le groupe « ${g.name} » ?`, undefined, { confirm: 'Supprimer', danger: true })) {
      mutate('Supprimer le groupe', (d) => { d.groups = d.groups.filter((x) => x.id !== gid) })
    }
  }

  return (
    <>
      {sub('Bibliothèque')}
      <main class="page">
        <Toggle label="Afficher les éléments archivés" checked={showArchived} onChange={setShowArchived} />
        {groups.map((g) => {
          const list = data.exercises.filter((e) => e.groupId === g.id && (showArchived || !e.archived)).sort((a, b) => a.name.localeCompare(b.name))
          return (
            <section key={g.id} class="card">
              <div class="row between gap">
                <h2 class="grow">{g.name}{g.archived && <span class="pill">archivé</span>}</h2>
                <button class="icon-btn" aria-label={`Renommer ${g.name}`} onClick={() => groupMenu(g.id)}><Icon name="note" /></button>
                <button class="icon-btn" aria-label={g.archived ? `Désarchiver ${g.name}` : `Archiver ${g.name}`}
                  onClick={() => mutate(g.archived ? 'Désarchiver le groupe' : 'Archiver le groupe', (d) => { const x = d.groups.find((y) => y.id === g.id)!; x.archived = !x.archived })}>
                  <Icon name={g.archived ? 'up' : 'down'} /></button>
                <button class="icon-btn danger-text" aria-label={`Supprimer ${g.name}`} onClick={() => deleteGroup(g.id)}><Icon name="trash" /></button>
              </div>
              <ul class="list">
                {list.map((e) => (
                  <li key={e.id}><a class="list-btn" href={`#/reglages/exercice/${e.id}`}>
                    <span class="grow">{e.name}{e.archived && <span class="pill">archivé</span>}
                      <span class="muted small block">{e.equipment}{e.kind === 'check' ? ' · à cocher' : ''}{e.unilateral ? ' · unilatéral' : ''}{e.volumeMode === 'aucun' ? ' · sans volume' : e.volumeMode === 'pdc' ? ' · PDC + lest' : ''}</span></span>
                    <Icon name="chevron" /></a></li>
                ))}
              </ul>
              <button class="btn small ghost" onClick={() => addExercise(g.id)}><Icon name="plus" size={18} /> Exercice</button>
            </section>
          )
        })}
        <button class="btn full" onClick={addGroup}><Icon name="plus" /> Nouveau groupe musculaire</button>
      </main>
    </>
  )
}

export function ExerciseEdit({ id }: { id: string }) {
  const data = D()
  const ex = data.exercises.find((e) => e.id === id)
  if (!ex) return (<>{sub('Exercice')}<main class="page"><Empty title="Exercice introuvable" /></main></>)
  const upd = (label: string, patch: Partial<Exercise>) => mutate(label, (d) => { Object.assign(d.exercises.find((e) => e.id === id)!, patch) })
  const usedSets = data.sessions.reduce((n, s) => n + s.entries.filter((e) => e.exerciseId === id).reduce((m, e) => m + Math.max(1, e.sets.length), 0), 0)
  const inTemplates = data.templates.filter((t) => t.items.some((i) => i.exerciseId === id || i.altExerciseId === id))

  const remove = async () => {
    if (usedSets > 0) return toast(`Utilisé dans ${usedSets} série(s) de l’historique : archive-le plutôt.`, { kind: 'error', ms: 6000 })
    const extra = inTemplates.length ? `Il sera aussi retiré des modèles : ${inTemplates.map((t) => t.name).join(', ')}.` : undefined
    if (!(await confirmDialog(`Supprimer « ${ex.name} » ?`, extra, { confirm: 'Supprimer', danger: true }))) return
    mutate('Supprimer un exercice', (d) => {
      d.exercises = d.exercises.filter((e) => e.id !== id)
      for (const t of d.templates) {
        t.items = t.items.filter((i) => i.exerciseId !== id)
        for (const i of t.items) if (i.altExerciseId === id) delete i.altExerciseId
      }
      d.settings.trackedExerciseIds = d.settings.trackedExerciseIds.filter((x) => x !== id)
    })
    go('/reglages/bibliotheque')
  }

  return (
    <>
      <TopBar title={ex.name} backTo={() => back('/reglages/bibliotheque')} />
      <main class="page">
        <section class="card">
          <label class="field"><span>Nom</span>
            <input value={ex.name} onChange={(e) => {
              const v = e.currentTarget.value
              const err = validName(v, data.exercises.map((x) => x.name), ex.name)
              if (err) { toast(err, { kind: 'error' }); e.currentTarget.value = ex.name } else upd('Renommer l’exercice', { name: cleanName(v) })
            }} /></label>
          <label class="field"><span>Groupe musculaire</span>
            <select value={ex.groupId} onChange={(e) => upd('Changer de groupe', { groupId: e.currentTarget.value })}>
              {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select></label>
          <label class="field"><span>Matériel <small class="muted">(détermine le pas des boutons +/- et la suggestion de progression)</small></span>
            <select value={ex.equipment} onChange={(e) => {
              const eq = e.currentTarget.value as Equipment
              upd('Changer le matériel', eq === 'poids de corps' && ex.volumeMode === 'charge' ? { equipment: eq, volumeMode: 'pdc' } : { equipment: eq })
            }}>
              {EQUIPMENTS.map((x) => <option key={x}>{x}</option>)}
            </select></label>
          <label class="field"><span>Type de saisie</span>
            <select value={ex.kind} onChange={(e) => upd('Type de saisie', { kind: e.currentTarget.value as Exercise['kind'] })}>
              <option value="sets">Séries chiffrées</option>
              <option value="check">Bloc à cocher (ex. circuit)</option>
            </select></label>
          <label class="field"><span>Calcul du volume</span>
            <select value={ex.volumeMode} onChange={(e) => upd('Calcul du volume', { volumeMode: e.currentTarget.value as VolumeMode })}>
              {VOLUME_MODES.map((m) => <option key={m.v} value={m.v}>{m.label}</option>)}
            </select>
            {ex.volumeMode === 'pdc' && <small class="muted">Utilise ton poids le plus récent de l’onglet Corps à la date de la séance.</small>}
          </label>
          <Toggle label="Polyarticulaire" hint="Cible RPE 8-9 ; sinon RPE 9-10 sur la dernière série" checked={ex.compound} onChange={(v) => upd('Polyarticulaire', { compound: v })} />
          <Toggle label="Unilatéral (reps par côté)" hint="Le volume est compté ×2" checked={ex.unilateral} onChange={(v) => upd('Unilatéral', { unilateral: v })} />
          <Toggle label="Archivé" hint="Masqué des listes, historique conservé" checked={ex.archived} onChange={(v) => upd(v ? 'Archiver' : 'Désarchiver', { archived: v })} />
        </section>
        <a class="btn full" href={`#/exercice/${id}`}>Voir la fiche et les records</a>
        <button class="btn ghost danger-text full" onClick={remove}><Icon name="trash" /> Supprimer l’exercice</button>
      </main>
    </>
  )
}

// ---------- Mouvements suivis ----------

export function TrackedSettings() {
  const data = D()
  const tracked = data.settings.trackedExerciseIds
  const toggle = (id: string, on: boolean) => mutate('Mouvements suivis', (d) => {
    const t = d.settings.trackedExerciseIds
    d.settings.trackedExerciseIds = on ? [...t.filter((x) => x !== id), id] : t.filter((x) => x !== id)
  })
  const list = data.exercises.filter((e) => !e.archived && e.kind === 'sets' && e.volumeMode !== 'aucun')
  return (
    <>
      {sub('Mouvements suivis')}
      <main class="page">
        <p class="muted">Ces exercices apparaissent dans les records et la courbe de 1RM du tableau de bord (jusqu’à 8 pour rester lisible).</p>
        {data.groups.map((g) => {
          const ex = list.filter((e) => e.groupId === g.id)
          if (!ex.length) return null
          return (
            <section class="card" key={g.id}>
              <h2>{g.name}</h2>
              {ex.map((e) => (
                <label class="check" key={e.id}>
                  <input type="checkbox" checked={tracked.includes(e.id)} disabled={!tracked.includes(e.id) && tracked.length >= 8}
                    onChange={(ev) => toggle(e.id, ev.currentTarget.checked)} />
                  <span>{e.name}</span>
                </label>
              ))}
            </section>
          )
        })}
      </main>
    </>
  )
}

// ---------- Saisie et minuteur ----------

export function InputSettings() {
  const s = D().settings
  const upd = (label: string, fn: (x: typeof s) => void) => mutate(label, (d) => fn(d.settings))
  const askNotif = async (on: boolean) => {
    if (on && 'Notification' in window && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission()
      if (p !== 'granted') return toast('Notifications refusées dans les réglages du téléphone.', { kind: 'error' })
    }
    upd('Notifications', (x) => { x.notify = on })
  }
  return (
    <>
      {sub('Saisie et minuteur')}
      <main class="page">
        <section class="card">
          <h2>Pas par défaut des boutons +/−</h2>
          <p class="muted small">Tu peux toujours changer le pas (0,5 / 1 / 2,5) pendant la saisie ou taper la charge exacte au clavier.</p>
          <div class="grid2">
            {EQUIPMENTS.map((eq) => (
              <NumField key={eq} label={eq} unit="kg" min={0.25} max={20} value={s.loadSteps[eq]}
                onChange={(v) => v && upd('Pas de charge', (x) => { x.loadSteps[eq] = v })} />
            ))}
          </div>
        </section>
        <section class="card">
          <h2>Fin du repos</h2>
          <Toggle label="Son" checked={s.sound} onChange={(v) => upd('Son', (x) => { x.sound = v })} hint="Joué si l’app est à l’écran (mode silencieux de l’iPhone respecté)" />
          <Toggle label="Vibration" checked={s.vibrate} onChange={(v) => upd('Vibration', (x) => { x.vibrate = v })} hint="Android uniquement : Safari iOS ne permet pas la vibration" />
          {'Notification' in window && (
            <Toggle label="Notification" checked={s.notify} onChange={askNotif} hint="Si l’app est en arrière-plan et encore active ; iOS suspend souvent les apps web en arrière-plan" />
          )}
          <p class="muted small">La durée de repos se règle par exercice dans les modèles, ou pendant la séance (menu ⋮ de l’exercice).</p>
        </section>
      </main>
    </>
  )
}

export function RpeScale() {
  return (
    <>
      {sub('Échelle RPE')}
      <main class="page">
        <table class="table card">
          <thead><tr><th scope="col">RPE</th><th scope="col">Signification</th></tr></thead>
          <tbody>{RPE_SCALE.map((r) => <tr key={r.rpe}><th scope="row">{r.rpe}</th><td>{r.label}</td></tr>)}</tbody>
        </table>
        <section class="card">
          <h2>Intensité cible</h2>
          <p>Polyarticulaires : <strong>RPE 8-9</strong> (1 à 2 reps en réserve).</p>
          <p>Isolation : <strong>RPE 9-10</strong> sur la dernière série.</p>
          <p class="muted small">Les demi-points (8,5) sont acceptés à l’import.</p>
        </section>
      </main>
    </>
  )
}

// ---------- Sauvegarde ----------

export function BackupSettings() {
  const data = D()
  const [busy, setBusy] = useState(false)
  const markExported = () => { if (!demo.value) mutate('Export', (d) => { d.settings.lastExportAt = Date.now() }, { undoable: false }) }

  const exportJson = async (encrypted: boolean) => {
    let pw: string | undefined
    if (encrypted) {
      const p = await promptDialog('Export chiffré', 'Mot de passe de la sauvegarde', '', {
        type: 'password', message: 'Choisis un mot de passe pour ce fichier (il peut être différent de celui de l’app). Sans lui, le fichier est illisible.',
        validate: (v) => (v.length >= 8 ? null : 'Au moins 8 caractères'),
      })
      if (!p) return
      const p2 = await promptDialog('Export chiffré', 'Confirme le mot de passe', '', { type: 'password', validate: (v) => (v === p ? null : 'Les mots de passe diffèrent') })
      if (!p2) return
      pw = p
    }
    setBusy(true)
    try {
      const content = await buildExport(data, pw)
      if (await saveFile(`muscu-sauvegarde-${stamp()}${pw ? '-chiffree' : ''}.json`, content, 'application/json')) {
        markExported()
        toast('Sauvegarde exportée')
      }
    } finally { setBusy(false) }
  }
  const exportCsv = async (name: string, content: string) => {
    if (await saveFile(`muscu-${name}-${stamp()}.csv`, content, 'text/csv')) toast('CSV exporté')
  }

  return (
    <>
      {sub('Sauvegarde et import')}
      <main class="page">
        <section class="card">
          <h2>Sauvegarde complète</h2>
          <p class="muted small">{data.settings.lastExportAt ? `Dernier export : ${fmtDate(new Date(data.settings.lastExportAt).toISOString().slice(0, 10))}` : 'Jamais exportée.'} Enregistre le fichier dans Fichiers / iCloud Drive.</p>
          <button class="btn primary full" disabled={busy} onClick={() => exportJson(true)}>Exporter (JSON chiffré) — recommandé</button>
          <button class="btn full" disabled={busy} onClick={() => exportJson(false)}>Exporter (JSON non chiffré)</button>
        </section>
        <section class="card">
          <h2>Export CSV (Excel)</h2>
          <p class="muted small">Séparateur « ; » et virgule décimale : s’ouvre directement dans Excel. Non chiffré.</p>
          <div class="grid2">
            <button class="btn" onClick={() => exportCsv('journal', journalCsv(data))}>Journal des séries</button>
            <button class="btn" onClick={() => exportCsv('seances', sessionsCsv(data))}>Séances</button>
            <button class="btn" onClick={() => exportCsv('mensurations', bodyCsv(data))}>Mensurations</button>
            <button class="btn" onClick={() => exportCsv('bibliotheque', libraryCsv(data))}>Bibliothèque</button>
          </div>
        </section>
        <section class="card">
          <h2>Import et restauration</h2>
          <p class="muted small">Restaurer une sauvegarde JSON, ou importer ton historique Excel (CSV) avec aperçu et correction.</p>
          <button class="btn full" onClick={() => go('/reglages/import')}>Importer un fichier…</button>
        </section>
      </main>
    </>
  )
}

// ---------- Sécurité ----------

export function SecuritySettings() {
  const change = async () => {
    if (demo.value) return toast('Indisponible en mode démo')
    const old = await promptDialog('Changer le mot de passe', 'Mot de passe actuel', '', { type: 'password', validate: (v) => (v ? null : 'Requis') })
    if (!old) return
    const n1 = await promptDialog('Changer le mot de passe', 'Nouveau mot de passe', '', { type: 'password', validate: (v) => (v.length >= 8 ? null : 'Au moins 8 caractères') })
    if (!n1) return
    const n2 = await promptDialog('Changer le mot de passe', 'Confirme le nouveau mot de passe', '', { type: 'password', validate: (v) => (v === n1 ? null : 'Les mots de passe diffèrent') })
    if (!n2) return
    try {
      await vault.changePassword(old, n1)
      toast('Mot de passe changé')
    } catch (e) {
      toast(e instanceof WrongPasswordError ? 'Mot de passe actuel incorrect' : (e as Error).message, { kind: 'error' })
    }
  }
  return (
    <>
      {sub('Sécurité')}
      <main class="page">
        <section class="card">
          <button class="btn full" onClick={() => void lock()}><Icon name="lock" /> Verrouiller maintenant</button>
          <button class="btn full" onClick={change}>Changer le mot de passe</button>
        </section>
        <section class="card prose">
          <h2>Ce que protège le chiffrement</h2>
          <ul>
            <li>Tes données sont chiffrées sur l’appareil (AES-GCM 256, clé dérivée du mot de passe par PBKDF2-SHA256, 600 000 itérations, sel aléatoire). Le mot de passe n’est stocké nulle part.</li>
            <li>Le dépôt GitHub ne contient que le code : aucune donnée, aucun mot de passe, aucune clé.</li>
          </ul>
          <h2>Les limites</h2>
          <ul>
            <li><strong>Mot de passe oublié = données perdues.</strong> Personne ne peut les récupérer. Fais des exports réguliers.</li>
            <li><strong>Pas de synchronisation</strong> : les données restent sur cet appareil. Pour changer de téléphone : export puis import.</li>
            <li>iOS peut effacer les données d’un site web non utilisé pendant plusieurs semaines si l’app n’est <em>pas</em> installée sur l’écran d’accueil. Installée, elle est protégée de ce nettoyage, mais garde des exports.</li>
            <li>Une fois déverrouillée, l’app est lisible par qui tient le téléphone : verrouille-la si besoin.</li>
            <li>Le délai après échecs ne protège que l’interface : quelqu’un qui copierait le stockage pourrait tester des mots de passe hors de l’app. Un mot de passe long (phrase de 4-5 mots) est la vraie protection.</li>
          </ul>
        </section>
      </main>
    </>
  )
}
