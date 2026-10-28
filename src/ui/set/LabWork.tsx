import { useState } from 'react'
import type { DjId } from '../../engine/set/profile'
import { agreed, describeState, unheard, type Choice } from '../../engine/set/versions'
import { useT } from '../../i18n/react'
import { ConfirmButton } from './Bits'
import type { SetStore } from './store'

// Versions of a transition and the decision on them, beside the Transition Builder (#93,
// #94): save what plays as a version, compare two on one playhead, pin comments to bars,
// and pick. Both DJs picking the same marks the transition agreed; the app never picks.

function Compare({ store }: { store: SetStore }) {
  const t = useT()
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
    <div className="set-compare" aria-label={t('work.compareAria')} role="group">
      <strong>{t('work.compare')}</strong>
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
          title={t('work.hearHint')}
        >
          {t('work.hear', { n })}
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
        {t('work.blind')}
      </label>
      {hide && (
        <button className="btn btn-small" onClick={() => setRevealed(true)}>
          {t('work.reveal')}
        </button>
      )}
    </div>
  )
}

function Decide({ store }: { store: SetStore }) {
  const t = useT()
  const work = store.labWork
  const mine = work.picks[store.me]
  const [choice, setChoice] = useState<Choice | ''>(mine?.choice ?? '')
  const [reason, setReason] = useState(mine?.reason ?? '')
  const nameOf = (c: Choice) =>
    c === 'both' ? t('work.bothShort') : (work.versions.find((v) => v.id === c)?.name ?? c)
  const both = agreed(work)
  const me = store.djName(store.me)
  return (
    <div className="set-decide" role="group" aria-label={t('work.decide')}>
      <strong>{t('work.decide')}</strong>
      <p className="muted">{t('work.decideLead')}</p>
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
              <span className="muted">{t('work.notPicked')}</span>
            )}
          </p>
        )
      })}
      {both !== null && (
        <p className="set-agreed" role="status">
          {t('work.agreed', { name: nameOf(both) })}
        </p>
      )}
      <div className="set-actions">
        <label className="poc-field">
          {t('work.picks', { name: me })}
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            aria-label={t('work.pickAria', { name: me })}
          >
            <option value="">{t('work.choose')}</option>
            {work.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
            <option value="both">{t('work.both')}</option>
          </select>
        </label>
        <input
          className="poc-input set-reason"
          aria-label={t('work.reason')}
          placeholder={t('work.why')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className="btn btn-small"
          disabled={!choice}
          onClick={() => choice && store.pick({ choice, reason: reason.trim() })}
        >
          {t('work.pick')}
        </button>
        {mine && (
          <button className="btn btn-small" onClick={() => store.pick(null)}>
            {t('work.takeBack')}
          </button>
        )}
      </div>
    </div>
  )
}

export function LabWork({ store }: { store: SetStore }) {
  const t = useT()
  const work = store.labWork
  const toHear = new Set(unheard(work, store.me).map((v) => v.id))
  const [name, setName] = useState('')
  const [comment, setComment] = useState('')
  return (
    <section className="card set-work" aria-label={t('work.aria')}>
      <div className="set-actions">
        <input
          className="poc-input set-version-name"
          aria-label={t('work.versionName')}
          placeholder={t('work.versionPlaceholder', { name: store.djName(store.me) })}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="btn btn-small"
          onClick={() => {
            store.saveVersion(name)
            setName('')
          }}
          title={t('work.saveHint')}
        >
          {t('work.save')}
        </button>
      </div>
      {work.versions.length > 0 && (
        <ul className="set-versions" aria-label={t('work.versions')}>
          {work.versions.map((v) => (
            <li key={v.id} data-testid="version">
              <strong>{v.name}</strong>{' '}
              <span className={`set-owner set-owner-${v.author}`}>{store.djName(v.author)}</span>
              <span className="muted"> · {describeState(v.state, t)}</span>{' '}
              {toHear.has(v.id) && (
                <span className="chip set-unheard" data-testid="unheard">
                  {t('work.unheard')}
                </span>
              )}{' '}
              <button className="btn btn-small" onClick={() => store.loadVersion(v.id)}>
                {t('work.load')}
              </button>{' '}
              <ConfirmButton
                label={t('work.removeVersion', { name: v.name })}
                onConfirm={() => store.removeVersion(v.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {work.versions.length >= 2 && <Compare key={work.versions.length} store={store} />}
      <div className="set-comments">
        <strong>{t('work.comments')}</strong>
        {work.comments.length === 0 && <span className="muted"> {t('work.none')}</span>}
        <ul>
          {work.comments.map((c) => (
            <li key={c.id} data-testid="comment">
              <span className="chip">{t('work.bar', { bar: c.bar })}</span>{' '}
              <span className={`set-owner set-owner-${c.author}`}>{store.djName(c.author)}</span>{' '}
              {c.text}
            </li>
          ))}
        </ul>
        <div className="set-actions">
          <input
            className="poc-input set-comment"
            aria-label={t('work.comment')}
            placeholder={t('work.commentPlaceholder')}
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
            {t('work.pin')}
          </button>
        </div>
      </div>
      {work.versions.length > 0 && <Decide key={store.me} store={store} />}
    </section>
  )
}
