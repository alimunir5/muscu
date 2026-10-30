// Coquille de l'application : routes, navigation basse.
import { DialogHost, ToastHost } from './dialogs'
import { Icon } from './components/common'
import { ExercisePickerHost } from './components/ExercisePicker'
import { RestTimer } from './components/RestTimer'
import { match, route } from './router'
import { activeSession, demo, phase, saveError } from './store'
import { Body } from './screens/Body'
import { ExerciseDetail } from './screens/ExerciseDetail'
import { HistoryList, SessionDetail } from './screens/History'
import { Home } from './screens/Home'
import { ImportScreen } from './screens/Import'
import { MigrateScreen } from './screens/Lock'
import {
  BackupSettings, DataSettings, ExerciseEdit, InputSettings, Library, ProgramSettings, RpeScale, SettingsHome,
  TemplateEdit, TemplatesList, TrackedSettings,
} from './screens/Settings'
import { Workout } from './screens/Workout'

const TABS = [
  { path: '/', label: 'Accueil', icon: 'home' },
  { path: '/seance', label: 'Séance', icon: 'dumbbell' },
  { path: '/historique', label: 'Historique', icon: 'list' },
  { path: '/corps', label: 'Corps', icon: 'body' },
  { path: '/reglages', label: 'Réglages', icon: 'gear' },
]

function Screen() {
  const r = route.value
  let m: Record<string, string> | null
  if (r === '/seance') return <Workout />
  if (r === '/historique') return <HistoryList />
  if ((m = match('/historique/:id'))) return <SessionDetail id={m.id} />
  if ((m = match('/exercice/:id'))) return <ExerciseDetail id={m.id} />
  if (r === '/corps') return <Body />
  if (r === '/reglages') return <SettingsHome />
  if (r === '/reglages/programme') return <ProgramSettings />
  if (r === '/reglages/modeles') return <TemplatesList />
  if ((m = match('/reglages/modeles/:id'))) return <TemplateEdit id={m.id} />
  if (r === '/reglages/bibliotheque') return <Library />
  if ((m = match('/reglages/exercice/:id'))) return <ExerciseEdit id={m.id} />
  if (r === '/reglages/suivis') return <TrackedSettings />
  if (r === '/reglages/saisie') return <InputSettings />
  if (r === '/reglages/rpe') return <RpeScale />
  if (r === '/reglages/sauvegarde') return <BackupSettings />
  if (r === '/reglages/import') return <ImportScreen />
  if (r === '/reglages/donnees') return <DataSettings />
  return <Home />
}

export function App() {
  if (phase.value === 'loading') return <div class="splash" aria-busy="true" />
  if (phase.value === 'migrate') return <><MigrateScreen /><DialogHost /></>

  const r = route.value
  const tabActive = (p: string) => (p === '/' ? r === '/' : r === p || r.startsWith(`${p}/`)
    || (p === '/historique' && r.startsWith('/exercice/')))
  return (
    <div class={`app ${activeSession.value?.restEndsAt ? 'has-rest' : ''}`}>
      {demo.value && <div class="demo-banner" role="status">MODE DÉMO · données fictives non enregistrées</div>}
      {saveError.value && <div class="demo-banner bad" role="alert">{saveError.value}</div>}
      <Screen key={r} />
      <div class="bottom">
        <RestTimer />
        <nav class="tabs" aria-label="Navigation principale">
          {TABS.map((t) => (
            <a key={t.path} href={`#${t.path}`} class={`tab ${tabActive(t.path) ? 'on' : ''}`} aria-current={tabActive(t.path) ? 'page' : undefined}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
              {t.path === '/seance' && activeSession.value && <span class="dot" aria-label="séance en cours" />}
            </a>
          ))}
        </nav>
      </div>
      <ExercisePickerHost />
      <DialogHost />
      <ToastHost />
    </div>
  )
}
