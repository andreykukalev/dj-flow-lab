import type { Observation } from '../../engine/set/observations'
import type { Reading } from '../../engine/set/readings'
import { useState } from 'react'
import { Layer, NotMeasured, TrackLine } from './Bits'
import { HearIdea } from './Idea'
import { HEAR_BARS, type SetStore } from './store'

// The Concept Explorer (#89, #90): what the analysis noticed in the collection, each
// observation with bars to hear, then a few readings of the same tracks. None is marked
// as best: the DJs listen, pick one to explore, and can come back for another.

function ObservationCard({ store, o }: { store: SetStore; o: Observation }) {
  return (
    <li className="card set-observation" id={`obs-${o.id}`} data-testid="observation">
      <div className="set-card-head">
        <strong>{o.title}</strong>
        <Layer layer={o.layer} />
      </div>
      <p>{o.detail}</p>
      <p className="set-tracks">
        {o.trackIds.map((id, k) => (
          <span key={id}>
            {k > 0 && ', '}
            <TrackLine store={store} id={id} />
          </span>
        ))}
      </p>
      <div className="set-hear">
        {o.hear.map((h) => {
          const playing = store.isHearing(`${h.trackId}@${h.bar}`)
          return (
            <button
              key={`${h.trackId}-${h.bar}`}
              className="btn btn-small"
              onClick={() => void store.hear(h.trackId, h.bar)}
              aria-pressed={playing}
              title={`Play ${HEAR_BARS} bars from bar ${h.bar}`}
            >
              {playing ? '■ Stop' : '▶ Hear it'}: {h.label}
            </button>
          )
        })}
      </div>
    </li>
  )
}

function ReadingCard({
  store,
  r,
  observations,
}: {
  store: SetStore
  r: Reading
  observations: Observation[]
}) {
  const [checking, setChecking] = useState(false)
  const find = (id: string) => observations.find((o) => o.id === id)
  const title = (id: string) => find(id)?.title ?? id
  return (
    <li className="card set-reading" data-testid="reading" aria-label={r.name}>
      <div className="set-card-head">
        <h3>{r.name}</h3>
        <Layer layer="interpretation" />
      </div>
      <p className="set-words">{r.words.join(' · ')}</p>
      <p>{r.idea}</p>
      <p className="set-functions" aria-label="Musical functions in order">
        {r.functions.map((f, k) => (
          <span key={k}>
            {k > 0 && <span className="muted"> → </span>}
            <span className="chip set-function">{f}</span>
          </span>
        ))}
      </p>
      {r.why.length > 0 ? (
        <>
          <p className="set-label">Why it might work</p>
          <ul className="set-why">
            {r.why.map((w) => (
              <li key={w.observationId}>
                {w.text} <a href={`#obs-${w.observationId}`}>{title(w.observationId)}</a>
              </li>
            ))}
          </ul>
          <button
            className="btn btn-small"
            aria-expanded={checking}
            onClick={() => setChecking(!checking)}
          >
            Check it by ear
          </button>
          {checking && (
            <ul className="set-checks" aria-label={`Claims of ${r.name}`}>
              {r.why.map((w) => {
                const o = find(w.observationId)
                if (!o) return null
                return (
                  <li key={w.observationId} data-testid="claim">
                    <p>{w.text}</p>
                    <div className="set-hear">
                      {o.hear.map((h) => {
                        const playing = store.isHearing(`${h.trackId}@${h.bar}`)
                        return (
                          <button
                            key={`${h.trackId}-${h.bar}`}
                            className="btn btn-small"
                            aria-pressed={playing}
                            onClick={() => void store.hear(h.trackId, h.bar)}
                          >
                            {playing ? '■ Stop' : '▶ Hear it'}: {h.label}
                          </button>
                        )
                      })}
                      <button className="btn btn-small" onClick={() => store.dismiss(o.id)}>
                        Doesn’t sound like that
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      ) : (
        <p className="muted">Offered for any collection: it rests only on tempo and fullness.</p>
      )}
      <HearIdea store={store} id={r.id} plan={r} />
      <p className="set-label">To explore</p>
      <p>{r.question}</p>
      <p className="muted">
        Uses {r.uses.dj1} of {store.djName('dj1')}’s and {r.uses.dj2} of {store.djName('dj2')}’s
        tracks, ordered by {r.orderedBy}.
      </p>
      <button className="btn btn-primary" onClick={() => store.choose(r)}>
        Explore the concept
      </button>
    </li>
  )
}

export function ConceptExplorer({ store }: { store: SetStore }) {
  const { observations, readings } = store.explored
  const count = store.profiles.length
  return (
    <div className="set-screen">
      <header className="set-screen-head">
        <h2>What story could this music tell?</h2>
        <p className="muted">
          A few readings of the same tracks, none of them the answer. Hear what they rest on, then
          explore one; you can come back and try another.
        </p>
      </header>
      <section aria-label="Observations">
        <h3>What we noticed in your {count} tracks</h3>
        {store.dismissed.size > 0 && (
          <p className="muted">
            {store.dismissed.size} hidden because you said they don’t sound like that.{' '}
            <button className="btn btn-small" onClick={() => store.restoreDismissed()}>
              Show them again
            </button>
          </p>
        )}
        <ul className="set-observations">
          {observations.map((o) => (
            <ObservationCard key={o.id} store={store} o={o} />
          ))}
          <li className="card set-observation">
            <NotMeasured />
          </li>
        </ul>
      </section>
      <section aria-label="Readings">
        <h3>Readings</h3>
        <ul className="set-readings">
          {readings.map((r) => (
            <ReadingCard key={r.id} store={store} r={r} observations={observations} />
          ))}
        </ul>
      </section>
    </div>
  )
}
