import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './ui/App'
import { toast } from './ui/dialogs'
import { boot, saveNow } from './ui/store'
import './styles.css'

// Mise à jour proposée (jamais forcée) pour ne pas recharger en pleine séance.
const updateSW = registerSW({
  onNeedRefresh() {
    toast('Nouvelle version disponible', {
      ms: 30_000,
      action: { label: 'Mettre à jour', run: () => void saveNow().then(() => updateSW(true)) },
    })
  },
})
void boot()
render(<App />, document.getElementById('app')!)
