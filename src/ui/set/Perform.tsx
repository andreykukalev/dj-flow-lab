import { useState } from 'react'
import { trackFacts } from '../../engine/set/profile'
import { readingName } from '../../engine/set/readings'
import { rekordboxXml } from '../../engine/set/rekordbox'
import { setSheet } from '../../engine/set/sheet'
import { useT } from '../../i18n/react'
import type { SetStore } from './store'

// Prepare to perform (#95): who plays when, each transition as steps on the controller
// (DDJ-400 names) at bars of the outgoing track, printable, and a rekordbox XML with
// the playlist, the cues and the notes.

export function Perform({ store }: { store: SetStore }) {
  const t = useT()
  const plan = store.plan
  const [folder, setFolder] = useState('')
  if (!plan) return null
  const sheet = setSheet(plan, store.profiles, t)
  const name = (id: string) => store.profile(id)?.name ?? id
  const title = store.reading ? readingName(store.reading, t) : t('perform.ourSet')

  const download = () => {
    const tracks = plan.order.flatMap((id) => {
      const x = store.tracks.find((y) => y.id === id)
      return x?.profile ? [{ profile: x.profile, fileName: x.fileName }] : []
    })
    const xml = rekordboxXml({
      playlist: t('perform.playlist', { title, a: store.djName('dj1'), b: store.djName('dj2') }),
      folder,
      tracks,
      sheet,
    })
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'set'}.xml`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="set-screen set-sheet">
      <header className="set-screen-head">
        <h2>{t('perform.title')}</h2>
        <p className="muted">{t('perform.lead', { title })}</p>
        <div className="set-actions set-no-print">
          <button className="btn btn-small" onClick={() => window.print()}>
            {t('perform.print')}
          </button>
        </div>
      </header>

      <section className="card set-perform" aria-label={t('perform.who')}>
        <h3>{t('perform.who')}</h3>
        <ol className="set-who">
          {sheet.slots.map((s) => {
            const p = store.profile(s.trackId)
            return (
              <li key={s.trackId} data-testid="sheet-slot">
                <span className="chip">{t('perform.deck', { n: s.deck })}</span>{' '}
                <span className={`set-owner set-owner-${s.player}`}>{store.djName(s.player)}</span>{' '}
                <strong>{name(s.trackId)}</strong>
                {p && <span className="muted"> · {trackFacts(p, t)}</span>}
              </li>
            )
          })}
        </ol>
      </section>

      {sheet.transitions.map((tr) => (
        <section
          key={`${tr.from}-${tr.to}`}
          className="card set-perform"
          aria-label={t('perform.transitionAria', { n: tr.index + 1 })}
          data-testid="sheet-transition"
        >
          <h3>
            {tr.index + 1}. {name(tr.from)} → {name(tr.to)}
          </h3>
          <p className="muted">
            {t('perform.deckArrow', { out: tr.outDeck, in: tr.inDeck })} ·{' '}
            {t('set.bringsIn', { name: store.djName(tr.mixedBy) })} ·{' '}
            {tr.version
              ? `${t('perform.versionBy', { version: tr.version.name, author: store.djName(tr.version.author) })} `
              : ''}
            {tr.note}
          </p>
          {tr.cue && (
            <p>
              <strong>{t('perform.cueLabel')}</strong>{' '}
              {t('perform.cueText', {
                in: tr.inDeck,
                out: tr.outDeck,
                inAt: tr.cue.inAt,
                playAt: tr.cue.playAt,
              })}
            </p>
          )}
          {tr.steps.length > 0 && (
            <table className="set-steps">
              <thead>
                <tr>
                  <th>{t('perform.bar')}</th>
                  <th>{t('perform.move')}</th>
                  <th>{t('perform.why')}</th>
                </tr>
              </thead>
              <tbody>
                {tr.steps.map((s, k) => (
                  <tr key={k}>
                    <td>{s.at}</td>
                    <td>{s.action}</td>
                    <td className="muted">{s.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <section className="card set-perform set-no-print" aria-label={t('perform.rekordbox')}>
        <h3>{t('perform.rekordbox')}</h3>
        <p className="muted">{t('perform.rbLead')}</p>
        <p className="set-not-measured" role="note">
          {t('perform.rbUnverified')}
        </p>
        <div className="set-actions">
          <label className="poc-field">
            {t('perform.folder')}
            <input
              className="poc-input set-folder"
              placeholder="/Users/you/Music/Set"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
          </label>
          <button className="btn btn-small" disabled={!folder.trim()} onClick={download}>
            {t('perform.download')}
          </button>
        </div>
      </section>
    </div>
  )
}
