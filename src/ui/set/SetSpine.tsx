import { useState } from 'react'
import { arcPoints, type ArcPoint } from '../../engine/set/arc'
import { trackFacts } from '../../engine/set/profile'
import { readingName, readingWords } from '../../engine/set/readings'
import {
  MAX_ALTERNATIVES,
  transitions,
  unused,
  type SetPlan,
  type TransitionStatus,
} from '../../engine/set/spine'
import { useT } from '../../i18n/react'
import { Layer, Shape } from './Bits'
import { HearIdea } from './Idea'
import type { SetStore } from './store'

// The set spine (#91): the tracks in order with a transition between each pair. Each
// transition opens in the Lab, the Transition Builder, with the two real tracks. Above
// it, the reading's energy arc against what each track measures (#92).

/** The status of a transition as data, and its key in the dictionary. */
const STATUS_KEY: Record<TransitionStatus, string> = {
  'not tried': 'status.notTried',
  tried: 'status.tried',
  'versions to choose between': 'status.versions',
  'agreed by both': 'status.agreed',
}

/** The arc as a line and each track's drive as a dot, both as order over the set. */
function ArcChart({ plan, points }: { plan: SetPlan; points: ArcPoint[] }) {
  const t = useT()
  const n = points.length
  const w = 300
  const x = (k: number) => (n === 1 ? w / 2 : 8 + (k * (w - 16)) / (n - 1))
  const y = (v: number) => 82 - 74 * v
  return (
    <figure className="card set-arc">
      <div className="set-card-head">
        <strong>{t('set.arc')}</strong>
        <Layer layer={plan.arcEdited ? 'yours' : 'interpretation'} />
      </div>
      <svg viewBox={`0 0 ${w} 90`} role="img" aria-label={t('set.arcAria')}>
        <polyline
          className="set-arc-line"
          points={points.map((p, k) => `${x(k)},${y(p.arc)}`).join(' ')}
        />
        {points.map((p, k) => (
          <circle
            key={p.trackId}
            className={`set-arc-dot ${p.note ? 'set-arc-off' : ''}`}
            cx={x(k)}
            cy={y(p.measured)}
            r={4}
          />
        ))}
      </svg>
      <figcaption className="muted">
        {t(plan.arcEdited ? 'set.arcCaptionYours' : 'set.arcCaptionReading')}
      </figcaption>
    </figure>
  )
}

/** Candidates waiting beside a slot's track, to swap in with one action (#93). */
function Alternatives({
  store,
  plan,
  index,
  free,
}: {
  store: SetStore
  plan: SetPlan
  index: number
  free: string[]
}) {
  const t = useT()
  const [adding, setAdding] = useState('')
  const alts = plan.alternatives[index] ?? []
  const nameOf = (id: string) => store.profile(id)?.name ?? id
  return (
    <div className="set-alternatives" data-testid="alternatives">
      {alts.length > 0 && <span className="muted">{t('set.waiting')}</span>}
      {alts.map((id) => (
        <span key={id} className="set-alternative">
          <strong>{nameOf(id)}</strong>{' '}
          <button className="btn btn-small" onClick={() => store.swapIn(index, id)}>
            {t('set.swapIn')}
          </button>
          <button
            className="btn btn-small set-icon"
            aria-label={t('set.stopConsidering', { name: nameOf(id), n: index + 1 })}
            onClick={() => store.removeAlternative(index, id)}
          >
            ✕
          </button>
        </span>
      ))}
      {alts.length < MAX_ALTERNATIVES && free.length > 0 && (
        <>
          <select
            value={adding}
            aria-label={t('set.altFor', { n: index + 1 })}
            onChange={(e) => setAdding(e.target.value)}
          >
            <option value="">{t('set.altPlaceholder')}</option>
            {free.map((id) => (
              <option key={id} value={id}>
                {nameOf(id)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-small"
            disabled={!adding}
            onClick={() => {
              store.addAlternative(index, adding)
              setAdding('')
            }}
          >
            {t('set.putBeside')}
          </button>
        </>
      )}
    </div>
  )
}

export function SetSpine({ store }: { store: SetStore }) {
  const t = useT()
  const plan = store.plan
  const [adding, setAdding] = useState('')
  if (!plan) return null
  const profiles = store.profiles
  const steps = transitions(plan, profiles)
  const free = unused(
    plan,
    profiles.map((p) => p.id),
  )
  const rest = profiles.filter((p) => free.includes(p.id))
  const opening = store.lab
  const points = arcPoints(plan, profiles)
  const pointOf = (id: string) => points.find((p) => p.trackId === id)
  const reading = store.reading
  return (
    <div className="set-screen">
      <header className="set-screen-head">
        <h2>{reading ? readingName(reading, t) : t('set.title')}</h2>
        {reading && <p className="set-words">{readingWords(reading, t).join(' · ')}</p>}
        <p className="muted">{t('set.lead')}</p>
        <div className="set-actions">
          <button className="btn btn-small" onClick={() => store.go('concepts')}>
            {t('set.change')}
          </button>
          <HearIdea store={store} id="set" plan={plan} />
        </div>
      </header>
      {points.length > 1 && <ArcChart plan={plan} points={points} />}
      {store.labError && (
        <p className="poc-error" role="alert">
          {t('set.labError', { error: store.labError })}
        </p>
      )}
      <ol className="set-spine" aria-label={t('set.aria')}>
        {plan.order.map((id, k) => {
          const p = store.profile(id)
          const role = plan.roles[k]
          const step = steps[k]
          const name = p?.name ?? id
          return (
            <li key={`${id}-${k}`} className="set-slot">
              <article className="card set-card" data-testid="set-track" aria-label={name}>
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
                      aria-label={t('set.moveEarlier', { name })}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-small set-icon"
                      onClick={() => store.move(k, 1)}
                      disabled={k === plan.order.length - 1}
                      aria-label={t('set.moveLater', { name })}
                    >
                      ↓
                    </button>
                    <button
                      className="btn btn-small set-icon"
                      onClick={() => store.remove(k)}
                      aria-label={t('set.remove', { name })}
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
                      {trackFacts(p, t)} <Layer layer={p.tempo === 'likely' ? 'likely' : 'yours'} />
                    </p>
                    <Shape profile={p} />
                    <div className="set-row-fields">
                      <label className="poc-field">
                        {t('set.arcLabel')}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={plan.arc[k] ?? 0.5}
                          aria-label={t('set.arcAt', { n: k + 1 })}
                          onChange={(e) => store.setArc(k, Number(e.target.value))}
                        />
                      </label>
                      {pointOf(id)?.note && (
                        <span className="set-arc-note" data-testid="arc-note">
                          {t(pointOf(id)!.note === 'above' ? 'set.above' : 'set.below')}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="muted">{t('set.removedTrack')}</p>
                )}
                <Alternatives store={store} plan={plan} index={k} free={rest.map((r) => r.id)} />
              </article>
              {step && (
                <div className="set-transition" data-testid="transition" data-status={step.status}>
                  <span className="set-transition-line" aria-hidden="true" />
                  <span>
                    {t('set.transition', { n: k + 1 })} ·{' '}
                    <strong>{t(STATUS_KEY[step.status])}</strong> ·{' '}
                    {t('set.bringsIn', { name: store.djName(step.mixedBy) })}
                  </span>
                  <button
                    className="btn btn-small"
                    disabled={opening !== null}
                    onClick={() => void store.openLab(k)}
                  >
                    {opening?.index === k ? t('set.opening') : t('set.openLab')}
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
            {t('set.addFrom')}
            <select value={adding} onChange={(e) => setAdding(e.target.value)}>
              <option value="">{t('set.choose')}</option>
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
            {t('set.addEnd')}
          </button>
        </div>
      )}
    </div>
  )
}
