import { useState } from 'react'
import { transitions } from '../../engine/set/spine'
import { trackFacts } from '../../engine/set/profile'
import { Layer, Shape } from './Bits'
import type { SetStore } from './store'

// The set spine (#91): the tracks in order with a transition between each pair. Each
// transition opens in the Lab, the Transition Builder, with the two real tracks.

export function SetSpine({ store }: { store: SetStore }) {
  const plan = store.plan
  const [adding, setAdding] = useState('')
  if (!plan) return null
  const profiles = store.profiles
  const steps = transitions(plan, profiles)
  const rest = profiles.filter((p) => !plan.order.includes(p.id))
  const opening = store.lab
  return (
    <div className="set-screen">
      <header className="set-screen-head">
        <h2>{store.reading ? store.reading.name : 'Your set'}</h2>
        {store.reading && <p className="set-words">{store.reading.words.join(' · ')}</p>}
        <p className="muted">
          The reading’s order, to listen to and change. The function of each slot is the reading’s;
          it stays with the slot when tracks move. Each transition is mixed by the DJ bringing the
          next track in.
        </p>
        <button className="btn btn-small" onClick={() => store.go('concepts')}>
          Change the concept
        </button>
      </header>
      {store.labError && (
        <p className="poc-error" role="alert">
          The Lab could not open: {store.labError}
        </p>
      )}
      <ol className="set-spine" aria-label="Set">
        {plan.order.map((id, k) => {
          const p = store.profile(id)
          const role = plan.roles[k]
          const step = steps[k]
          return (
            <li key={`${id}-${k}`} className="set-slot">
              <article className="card set-card" data-testid="set-track" aria-label={p?.name ?? id}>
                <div className="set-card-head">
                  <span className="set-slot-number">{k + 1}</span>
                  {role && (
                    <span className="set-role">
                      <span className="chip set-function">{role}</span>
                      <Layer layer="interpretation" />
                    </span>
                  )}
                  <span className="set-card-tools">
                    <button
                      className="btn btn-small set-icon"
                      onClick={() => store.move(k, -1)}
                      disabled={k === 0}
                      aria-label={`Move ${p?.name ?? id} earlier`}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-small set-icon"
                      onClick={() => store.move(k, 1)}
                      disabled={k === plan.order.length - 1}
                      aria-label={`Move ${p?.name ?? id} later`}
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-small set-icon"
                      onClick={() => store.remove(k)}
                      aria-label={`Remove ${p?.name ?? id} from the set`}
                    >
                      ✕
                    </button>
                  </span>
                </div>
                {p ? (
                  <>
                    <p>
                      <strong>{p.name}</strong>{' '}
                      <span className={`set-owner set-owner-${p.owner}`}>
                        {store.djName(p.owner)}
                      </span>
                    </p>
                    <p className="muted">
                      {trackFacts(p)} <Layer layer={p.tempo === 'likely' ? 'likely' : 'yours'} />
                    </p>
                    <Shape profile={p} />
                  </>
                ) : (
                  <p className="muted">This track was removed from the collection.</p>
                )}
              </article>
              {step && (
                <div className="set-transition" data-testid="transition" data-status={step.status}>
                  <span className="set-transition-line" aria-hidden="true" />
                  <span>
                    Transition {k + 1} · <strong>{step.status}</strong> ·{' '}
                    {store.djName(step.mixedBy)} brings it in
                  </span>
                  <button
                    className="btn btn-small"
                    disabled={opening !== null}
                    onClick={() => void store.openLab(k)}
                  >
                    {opening?.index === k ? 'Opening…' : 'Open in the Lab'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {rest.length > 0 && (
        <div className="set-actions">
          <label className="poc-field">
            Add from the collection
            <select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">Choose a track</option>
              {rest.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({store.djName(p.owner)})
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-small"
            disabled={!adding}
            onClick={() => {
              store.add(adding)
              setAdding('')
            }}
          >
            Add at the end
          </button>
        </div>
      )}
    </div>
  )
}
