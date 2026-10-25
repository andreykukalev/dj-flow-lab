import { useState } from 'react'
import type { DjId } from '../../engine/set/profile'
import { agreed, describeState, type Choice } from '../../engine/set/versions'
import type { SetStore } from './store'

// Versions of a transition and the decision on them, beside the Transition Builder (#93,
// #94): save what plays as a version, compare two on one playhead, pin comments to bars,
// and pick. Both DJs picking the same marks the transition agreed; the app never picks.

function Compare({ store }: { store: SetStore }) {
  const versions = store.labWork.versions
  const [first, setFirst] = useState(versions[0]!.id)
  const [second, setSecond] = useState(versions[1]!.id)
  const [blind, setBlind] = useState(false)
  // In blind mode the two are dealt in an order the DJs do not see.
  const [flipped] = useState(() => Math.random() < 0.5)
  const [revealed, setRevealed] = useState(false)
  const [hearing, setHearing] = useState<1 | 2 | null>(null)
  const ids = blind && flipped ? [second, first] : [first, second]
  const hide = blind && !revealed
  const nameOf = (id: string) => versions.find((v) => v.id === id)?.name ?? id
  const hear = (n: 1 | 2) => {
    store.loadVersion(ids[n - 1]!)
    setHearing(n)
  }
  const options = versions.map((v) => (
    <option key={v.id} value={v.id}>
      {v.name}
    </option>
  ))
  return (
    <div className="set-compare" aria-label="Compare two versions" role="group">
      <strong>Compare</strong>
      {!blind && (
        <>
          <label className="poc-field">
            1
            <select value={first} onChange={(e) => setFirst(e.target.value)}>
              {options}
            </select>
          </label>
          <label className="poc-field">
            2
            <select value={second} onChange={(e) => setSecond(e.target.value)}>
              {options}
            </select>
          </label>
        </>
      )}
      {([1, 2] as const).map((n) => (
        <button
          key={n}
          className="btn btn-small"
          aria-pressed={hearing === n}
          onClick={() => hear(n)}
          title="Switches at the same beat of the transition"
        >
          Hear {n}
          {!hide && blind ? `: ${nameOf(ids[n - 1]!)}` : ''}
        </button>
      ))}
      <label className="poc-field">
        <input
          type="checkbox"
          checked={blind}
          onChange={(e) => {
            setBlind(e.target.checked)
            setRevealed(false)
          }}
        />
        Blind
      </label>
      {hide && (
        <button className="btn btn-small" onClick={() => setRevealed(true)}>
          Reveal which is which
        </button>
      )}
    </div>
  )
}

function Decide({ store }: { store: SetStore }) {
  const work = store.labWork
  const mine = work.picks[store.me]
  const [choice, setChoice] = useState<Choice | ''>(mine?.choice ?? '')
  const [reason, setReason] = useState(mine?.reason ?? '')
  const nameOf = (c: Choice) =>
    c === 'both'
      ? 'keep both, choose on the night'
      : (work.versions.find((v) => v.id === c)?.name ?? c)
  const both = agreed(work)
  return (
    <div className="set-decide" role="group" aria-label="Decide">
      <strong>Decide</strong>
      <p className="muted">
        Each of you picks, with a reason. It is agreed when you both pick the same; the app never
        picks.
      </p>
      {(['dj1', 'dj2'] as DjId[]).map((dj) => {
        const p = work.picks[dj]
        return (
          <p key={dj} data-testid={`pick-${dj}`}>
            <span className={`set-owner set-owner-${dj}`}>{store.djName(dj)}</span>:{' '}
            {p ? (
              <>
                {nameOf(p.choice)}
                {p.reason && <span className="muted"> · “{p.reason}”</span>}
              </>
            ) : (
              <span className="muted">not picked yet</span>
            )}
          </p>
        )
      })}
      {both !== null && (
        <p className="set-agreed" role="status">
          Agreed by both: {nameOf(both)}
        </p>
      )}
      <div className="set-actions">
        <label className="poc-field">
          {store.djName(store.me)} picks
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label={`${store.djName(store.me)}'s pick`}
          >
            <option value="">Choose…</option>
            {work.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            <option value="both">Keep both, choose on the night</option>
          </select>
        </label>
        <input
          className="poc-input set-reason"
          aria-label="Reason"
          placeholder="Why"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="btn btn-small"
          disabled={!choice}
          onClick={() => choice && store.pick({ choice, reason: reason.trim() })}
        >
          Pick
        </button>
        {mine && (
          <button className="btn btn-small" onClick={() => store.pick(null)}>
            Take my pick back
          </button>
        )}
      </div>
    </div>
  )
}

export function LabWork({ store }: { store: SetStore }) {
  const work = store.labWork
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  return (
    <section className="card set-work" aria-label="Versions and decision">
      <div className="set-actions">
        <input
          className="poc-input set-version-name"
          aria-label="Version name"
          placeholder={`${store.djName(store.me)}’s version`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn btn-small"
          onClick={() => {
            store.saveVersion(name)
            setName('')
          }}
          title="Keeps the blend start, area, loop and takes of what plays"
        >
          Save as a version
        </button>
      </div>
      {work.versions.length > 0 && (
        <ul className="set-versions" aria-label="Versions">
          {work.versions.map((v) => (
            <li key={v.id} data-testid="version">
              <strong>{v.name}</strong>{' '}
              <span className={`set-owner set-owner-${v.author}`}>{store.djName(v.author)}</span>
              <span className="muted"> · {describeState(v.state)}</span>{' '}
              <button className="btn btn-small" onClick={() => store.loadVersion(v.id)}>
                Load
              </button>{' '}
              <button
                className="btn btn-small set-icon"
                aria-label={`Remove ${v.name}`}
                onClick={() => store.removeVersion(v.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {work.versions.length >= 2 && <Compare key={work.versions.length} store={store} />}
      <div className="set-comments">
        <strong>Comments</strong>
        {work.comments.length === 0 && <span className="muted"> none yet</span>}
        <ul>
          {work.comments.map((c) => (
            <li key={c.id} data-testid="comment">
              <span className="chip">bar {c.bar}</span>{' '}
              <span className={`set-owner set-owner-${c.author}`}>{store.djName(c.author)}</span>{' '}
              {c.text}
            </li>
          ))}
        </ul>
        <div className="set-actions">
          <input
            className="poc-input set-comment"
            aria-label="Comment"
            placeholder="A note on the bar at the cursor"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                store.comment(comment)
                setComment('')
              }
            }}
          />
          <button
            className="btn btn-small"
            disabled={!comment.trim()}
            onClick={() => {
              store.comment(comment)
              setComment('')
            }}
          >
            Pin to the bar at the cursor
          </button>
        </div>
      </div>
      {work.versions.length > 0 && <Decide key={store.me} store={store} />}
    </section>
  )
}
