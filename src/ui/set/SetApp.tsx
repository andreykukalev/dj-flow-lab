import { useState, useSyncExternalStore } from 'react'
import { ConceptExplorer } from './ConceptExplorer'
import { LabScreen } from './LabScreen'
import { SetSpine } from './SetSpine'
import { SetStore, type Screen } from './store'
import { YourMusic } from './YourMusic'
import './set.css'

// Set planning together (#87): Your music → Concepts → the set → the Lab.

const STEPS: { screen: Exclude<Screen, 'lab'>; label: string }[] = [
  { screen: 'music', label: 'Your music' },
  { screen: 'concepts', label: 'Concepts' },
  { screen: 'set', label: 'The set' },
]

export function SetApp({ store: given }: { store?: SetStore }) {
  const [store] = useState(() => given ?? new SetStore())
  useSyncExternalStore(store.subscribe, () => store.version)
  const enabled = (s: Exclude<Screen, 'lab'>) =>
    s === 'music' ||
    (s === 'concepts' && store.profiles.length >= 2) ||
    (s === 'set' && store.plan !== null)
  return (
    <div className="set-app">
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
      </header>
      {store.screen === 'music' && <YourMusic store={store} />}
      {store.screen === 'concepts' && <ConceptExplorer store={store} />}
      {store.screen === 'set' && <SetSpine store={store} />}
      {store.screen === 'lab' && <LabScreen store={store} />}
    </div>
  )
}
