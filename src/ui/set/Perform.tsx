import { useState } from 'react'
import { trackFacts } from '../../engine/set/profile'
import { rekordboxXml } from '../../engine/set/rekordbox'
import { setSheet } from '../../engine/set/sheet'
import type { SetStore } from './store'

// Prepare to perform (#95): who plays when, each transition as steps on the controller
// (DDJ-400 names) at bars of the outgoing track, printable, and a rekordbox XML with
// the playlist, the cues and the notes.

export function Perform({ store }: { store: SetStore }) {
  const plan = store.plan
  const [folder, setFolder] = useState('')
  if (!plan) return null
  const sheet = setSheet(plan, store.profiles)
  const name = (id: string) => store.profile(id)?.name ?? id
  const title = store.reading?.name ?? 'Our set'

  const download = () => {
    const tracks = plan.order.flatMap((id) => {
      const t = store.tracks.find((x) => x.id === id)
      return t?.profile ? [{ profile: t.profile, fileName: t.fileName }] : []
    })
    const xml = rekordboxXml({
      playlist: `${title} (${store.djName('dj1')} & ${store.djName('dj2')})`,
      folder,
      tracks,
      sheet,
    })
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w -]+/g, '').trim() || 'set'}.xml`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="set-screen set-sheet">
      <header className="set-screen-head">
        <h2>Prepare to perform</h2>
        <p className="muted">
          {title}: the set sheet for the night, from the versions you saved. Bars are counted on the
          track playing out. Nothing here is new: it is your plan, written for the controller
          (Pioneer DDJ-400 names).
        </p>
        <div className="set-actions set-no-print">
          <button className="btn btn-small" onClick={() => window.print()}>
            Print the sheet
          </button>
        </div>
      </header>

      <section className="card set-perform" aria-label="Who plays when">
        <h3>Who plays when</h3>
        <ol className="set-who">
          {sheet.slots.map((s) => {
            const p = store.profile(s.trackId)
            return (
              <li key={s.trackId} data-testid="sheet-slot">
                <span className="chip">Deck {s.deck}</span>{' '}
                <span className={`set-owner set-owner-${s.player}`}>{store.djName(s.player)}</span>{' '}
                <strong>{name(s.trackId)}</strong>
                {p && <span className="muted"> · {trackFacts(p)}</span>}
              </li>
            )
          })}
        </ol>
      </section>

      {sheet.transitions.map((t) => (
        <section
          key={`${t.from}-${t.to}`}
          className="card set-perform"
          aria-label={`Transition ${t.index + 1}`}
          data-testid="sheet-transition"
        >
          <h3>
            {t.index + 1}. {name(t.from)} → {name(t.to)}
          </h3>
          <p className="muted">
            Deck {t.outDeck} → deck {t.inDeck} · {store.djName(t.mixedBy)} brings it in ·{' '}
            {t.version ? `${t.version.name} by ${store.djName(t.version.author)}. ` : ''}
            {t.note}
          </p>
          {t.cue && (
            <p>
              <strong>Cue</strong> deck {t.inDeck} at its bar {t.cue.inAt}; press{' '}
              <strong>PLAY</strong> on deck {t.inDeck} at bar {t.cue.playAt} of deck {t.outDeck}.
            </p>
          )}
          {t.steps.length > 0 && (
            <table className="set-steps">
              <thead>
                <tr>
                  <th>Bar</th>
                  <th>Move</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {t.steps.map((s, k) => (
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

      <section className="card set-perform set-no-print" aria-label="rekordbox export">
        <h3>rekordbox</h3>
        <p className="muted">
          A playlist in set order with each track’s grid, a memory cue where the next track is
          started, a hot cue A where a track is cued when it comes in, and these notes in its
          comment. rekordbox finds tracks by where the files are on your computer, which this
          browser does not know: type the folder they are in.
        </p>
        <p className="set-not-measured" role="note">
          Not checked yet with your rekordbox: whether importing these cues leaves your own cues on
          the same tracks alone. Import into a new playlist and look before you play from it.
        </p>
        <div className="set-actions">
          <label className="poc-field">
            Folder of the tracks
            <input
              className="poc-input set-folder"
              placeholder="/Users/you/Music/Set"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            />
          </label>
          <button className="btn btn-small" disabled={!folder.trim()} onClick={download}>
            Download rekordbox XML
          </button>
        </div>
      </section>
    </div>
  )
}
