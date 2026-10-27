import type { Observation } from '../../engine/set/observations'
import { readingName, readingWords, type Reading } from '../../engine/set/readings'
import { useT } from '../../i18n/react'
import { Layer, NotMeasured, TrackLine } from './Bits'
import { HearIdea } from './Idea'
import { HEAR_BARS, type SetStore } from './store'

// The Concept Explorer (#89, #90): what the analysis noticed in the collection, each
// observation with bars to hear, then a few readings of the same tracks. None is marked
// as best: the DJs listen, pick one to explore, and can come back for another. A reading
// has three fixed layers so the cards compare: the idea, why it might work (each claim
// with the layer it rests on and its bars to hear, and a way to say it does not sound
// like that), and what to explore.

function HearButton({
  store,
  h,
  compact = false,
}: {
  store: SetStore
  h: Observation['hear'][number]
  compact?: boolean
}) {
  const t = useT()
  const playing = store.isHearing(`${h.trackId}@${h.bar}`)
  const verb = t(playing ? 'concepts.stop' : 'concepts.hear')
  return (
    <button
      className="btn btn-small"
      onClick={() => void store.hear(h.trackId, h.bar)}
      aria-pressed={playing}
      aria-label={compact ? `${verb}: ${h.label}` : undefined}
      title={t('concepts.hearHint', { n: HEAR_BARS, bar: h.bar })}
    >
      {compact ? `${verb.slice(0, 1)} ${h.label}` : `${verb}: ${h.label}`}
    </button>
  )
}

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
        {o.hear.map((h) => (
          <HearButton key={`${h.trackId}-${h.bar}`} store={store} h={h} />
        ))}
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
  const t = useT()
  const find = (id: string) => observations.find((o) => o.id === id)
  const name = readingName(r, t)
  const chosen = store.reading?.id === r.id && store.plan !== null
  return (
    <li
      className={`card set-reading ${chosen ? 'set-reading-chosen' : ''}`}
      data-testid="reading"
      aria-label={name}
    >
      <div className="set-card-head">
        <h3>{name}</h3>
        <Layer layer="interpretation" />
      </div>

      <div className="set-block">
        <p className="set-label">{t('concepts.idea')}</p>
        <p className="set-words">{readingWords(r, t).join(' · ')}</p>
        <p>{r.idea}</p>
        <p className="set-functions" aria-label={t('concepts.functions')}>
          {r.functions.map((f, k) => (
            <span key={k}>
              {k > 0 && <span className="muted"> → </span>}
              <span className="chip set-function">{f}</span>
            </span>
          ))}
        </p>
      </div>

      <div className="set-block">
        <p className="set-label">{t('concepts.why')}</p>
        {r.why.length > 0 ? (
          <ul className="set-why">
            {r.why.map((w) => {
              const o = find(w.observationId)
              return (
                <li key={w.observationId} data-testid="claim">
                  <p>
                    {w.text}
                    {o && (
                      <>
                        {' '}
                        <Layer layer={o.layer} />
                      </>
                    )}
                  </p>
                  {o && (
                    <div className="set-hear">
                      {o.hear.map((h) => (
                        <HearButton key={`${h.trackId}-${h.bar}`} store={store} h={h} compact />
                      ))}
                      <button
                        className="btn btn-small set-dismiss"
                        onClick={() => store.dismiss(o.id)}
                        title={o.title}
                      >
                        {t('concepts.notLikeThat')}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted">{t('concepts.fallback')}</p>
        )}
        <HearIdea store={store} id={r.id} plan={r} />
      </div>

      <div className="set-block">
        <p className="set-label">{t('concepts.toExplore')}</p>
        <p>{r.question}</p>
        <p className="muted">
          {t('concepts.uses', {
            a: r.uses.dj1,
            dj1: store.djName('dj1'),
            b: r.uses.dj2,
            dj2: store.djName('dj2'),
            by: r.orderedBy,
          })}
        </p>
      </div>

      {chosen ? (
        <div className="set-actions">
          <span className="set-chosen" role="status">
            {t('concepts.chosen')}
          </span>
          <button className="btn btn-small" onClick={() => store.go('set')}>
            {t('concepts.backToSet')}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => store.choose(r)}>
          {t('concepts.explore')}
        </button>
      )}
    </li>
  )
}

export function ConceptExplorer({ store }: { store: SetStore }) {
  const t = useT()
  const { observations, readings } = store.explored
  const count = store.profiles.length
  return (
    <div className="set-screen">
      <header className="set-screen-head">
        <h2>{t('concepts.title')}</h2>
        <p className="muted">{t('concepts.lead')}</p>
      </header>
      <section aria-label={t('concepts.observations')}>
        <div className="set-section-head">
          <h3>{t('concepts.noticed', { n: count })}</h3>
          <NotMeasured compact />
        </div>
        {store.dismissed.size > 0 && (
          <p className="muted">
            {t('concepts.hidden', { n: store.dismissed.size })}{' '}
            <button className="btn btn-small" onClick={() => store.restoreDismissed()}>
              {t('concepts.showAgain')}
            </button>
          </p>
        )}
        <ul className="set-observations">
          {observations.map((o) => (
            <ObservationCard key={o.id} store={store} o={o} />
          ))}
        </ul>
      </section>
      <section aria-label={t('concepts.readings')}>
        <h3>{t('concepts.readings')}</h3>
        <ul className="set-readings">
          {readings.map((r) => (
            <ReadingCard key={r.id} store={store} r={r} observations={observations} />
          ))}
        </ul>
      </section>
    </div>
  )
}
