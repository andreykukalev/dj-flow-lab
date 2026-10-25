import { useEffect, useState, useSyncExternalStore } from 'react'
import { ConceptExplorer } from './ConceptExplorer'
import { LabScreen } from './LabScreen'
import { Perform } from './Perform'
import { keep } from './persist'
import { SetSpine } from './SetSpine'
import { SetStore, type Screen } from './store'
import { YourMusic } from './YourMusic'
import './set.css'

// Set planning together (#87): Your music → Concepts → the set (and its Lab) → Perform.

const STEPS: { screen: Exclude<Screen, 'lab'>; label: string }[] = [
  { screen: 'music', label: 'Your music' },
  { screen: 'concepts', label: 'Concepts' },
  { screen: 'set', label: 'The set' },
  { screen: 'perform', label: 'Perform' },
]

export function SetApp({ store: given }: { store?: SetStore }) {
  const [store] = useState(() => given ?? new SetStore())
  useSyncExternalStore(store.subscribe, () => store.version)
  useEffect(() => keep(store, (message) => store.say(message)), [store])
  const enabled = (s: Exclude<Screen, 'lab'>) =>
    s === 'music' ||
    (s === 'concepts' && store.profiles.length >= 2) ||
    ((s === 'set' || s === 'perform') && store.plan !== null)
  return (
    <div className="set-app" data-ready={store.ready ? 'true' : undefined}>
      <header className="set-header">
        <h1>DJ Flow Lab</h1>
        <nav aria-label="Steps">
          {STEPS.map((s) => (
            <button
              key={s.screen}
              className={`btn btn-small set-step ${store.screen === s.screen ? 'set-step-on' : ''}`}
              aria-current={store.screen === s.screen ? 'page' : undefined}
              disabled={!enabled(s.screen)}
              onClick={() => store.go(s.screen)}
            >
              {s.label}
            </button>
          ))}
          {store.screen === 'lab' && (
            <span className="btn btn-small set-step set-step-on" aria-current="page">
              Lab
            </span>
          )}
        </nav>
        <div className="set-me" role="group" aria-label="Who is at the screen">
          <span className="muted">You are</span>
          {(['dj1', 'dj2'] as const).map((dj) => (
            <button
              key={dj}
              className={`btn btn-small set-step ${store.me === dj ? 'set-step-on' : ''}`}
              aria-pressed={store.me === dj}
              onClick={() => store.setMe(dj)}
            >
              {store.djName(dj)}
            </button>
          ))}
        </div>
      </header>
      {store.notice && (
        <p className="set-notice" role="alert">
          {store.notice}{' '}
          <button className="btn btn-small" onClick={() => store.say(null)}>
            OK
          </button>
        </p>
      )}
      {store.screen === 'music' && <YourMusic store={store} />}
      {store.screen === 'concepts' && <ConceptExplorer store={store} />}
      {store.screen === 'set' && <SetSpine store={store} />}
      {store.screen === 'perform' && <Perform store={store} />}
      {store.screen === 'lab' && <LabScreen store={store} />}
    </div>
  )
}
