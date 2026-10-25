import { useState } from 'react'
import { DJ_IDS, formatDuration, type DjId } from '../../engine/set/profile'
import { parseSet } from '../../engine/set/setFile'
import { CommitField, Layer, NotMeasured, Shape } from './Bits'
import type { CollectionTrack, SetStore } from './store'

// "Your music" (#88): the shared collection of a set, one column per DJ.

function TrackRow({ store, track }: { store: SetStore; track: CollectionTrack }) {
  const [sections, setSections] = useState(false)
  const p = track.profile
  return (
    <li className="set-row" data-testid="collection-track" data-status={track.status}>
      <div className="set-row-head">
        <span className="set-row-name">{track.fileName}</span>
        {track.status === 'waiting' && <span className="muted">Waiting…</span>}
        {track.status === 'analysing' && <span className="muted">Analysing…</span>}
        {track.status === 'missing' && (
          <label
            className="btn btn-small"
            title="Its analysis is kept; the file is needed to listen"
          >
            Select its file
            <input
              type="file"
              accept="audio/*,.aif,.aiff,.aifc"
              hidden
              data-testid={`file-${track.id}`}
              onChange={(e) => {
                store.addFiles(track.owner, Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
          </label>
        )}
        {track.matchedBy && (
          <span className="muted" title="The file selected again is this track">
            matched by {track.matchedBy}
          </span>
        )}
        {p && <span className="muted">{formatDuration(p.durationSec)}</span>}
        <button
          className="btn btn-small set-icon"
          onClick={() => store.removeFromCollection(track.id)}
          aria-label={`Remove ${track.fileName}`}
          title="Remove from the collection"
        >
          ✕
        </button>
      </div>
      {track.error && <p className="poc-error">{track.error}</p>}
      {p && (
        <>
          <div className="set-row-fields">
            <label className="poc-field">
              BPM
              <CommitField
                label="BPM"
                inputMode="decimal"
                className="set-bpm"
                value={p.grid.bpm.toFixed(2)}
                onCommit={(v) => store.setBpm(track.id, Number(v))}
              />
            </label>
            <Layer layer={p.tempo === 'likely' ? 'likely' : 'yours'} />
            {p.tempo === 'likely' && (
              <button
                className="btn btn-small"
                onClick={() => store.confirmTempo(track.id)}
                title="The estimate sounds right: keep it as yours"
              >
                Confirm
              </button>
            )}
            <label className="poc-field">
              Key
              <CommitField
                label="Key"
                placeholder="—"
                className="set-key"
                value={p.key ?? ''}
                onCommit={(v) => store.setKey(track.id, v)}
              />
            </label>
            <button
              className="btn btn-small"
              aria-expanded={sections}
              onClick={() => setSections(!sections)}
            >
              Sections
            </button>
          </div>
          <Shape profile={p} />
          {sections && (
            <ol className="set-sections">
              {p.structure.sections.map((s) => (
                <li key={s.fromBar} title={s.reasons.join(', ')}>
                  <strong>{s.term}</strong> bars {s.fromBar}–{s.toBar}
                  <span className="muted"> · {s.reasons.join(', ')}</span>
                </li>
              ))}
              <li className="muted">Likely sections: listen and correct them in the Lab.</li>
            </ol>
          )}
        </>
      )}
    </li>
  )
}

function DjColumn({ store, dj }: { store: SetStore; dj: DjId }) {
  const tracks = store.tracks.filter((t) => t.owner === dj)
  const placeholder = dj === 'dj1' ? 'DJ 1' : 'DJ 2'
  return (
    <section className="card set-dj" aria-label={`${store.djName(dj)}'s tracks`}>
      <div className="set-dj-head">
        <label className="poc-field">
          <span className="sr-only">{placeholder} name</span>
          <CommitField
            label={`${placeholder} name`}
            placeholder={`${placeholder}: type a name`}
            className="set-dj-name"
            value={store.djs[dj].name}
            onCommit={(v) => store.setDjName(dj, v)}
          />
        </label>
        <span className="muted">
          {tracks.length} track{tracks.length === 1 ? '' : 's'}
        </span>
        <label className="btn btn-small">
          Add tracks
          <input
            type="file"
            accept="audio/*,.aif,.aiff,.aifc"
            multiple
            hidden
            data-testid={`add-${dj}`}
            onChange={(e) => {
              store.addFiles(dj, Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </label>
      </div>
      {tracks.length === 0 ? (
        <p className="muted">No tracks yet. Add local audio files: they stay on this device.</p>
      ) : (
        <ul className="set-rows">
          {tracks.map((t) => (
            <TrackRow key={t.id} store={store} track={t} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Save, reload and pass the set as a file, without audio (#96). */
function KeepAndPass({ store }: { store: SetStore }) {
  const [sure, setSure] = useState(false)
  const missing = store.tracks.filter((t) => t.status === 'missing').length
  const pass = () => {
    const text = JSON.stringify(store.toSaved())
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    const names = `${store.djName('dj1')} and ${store.djName('dj2')}`.replace(/[^\w -]+/g, '')
    a.download = `${names || 'our'} set.djset.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const open = async (file: File | undefined) => {
    if (!file) return
    const set = parseSet(await file.text())
    if ('error' in set) store.say(set.error)
    else {
      store.restore(set)
      store.say(null)
    }
  }
  return (
    <section className="card set-keep" aria-label="Keep and pass the set">
      <strong>Keep and pass the set</strong>
      <p className="muted">
        The set is kept in this browser as you work: tracks, tempos and keys, the reading, the
        order, versions, comments and picks. No audio: after a reload, or on the other DJ’s
        computer, select the files again and they are matched to their tracks.
        {missing > 0 && ` ${missing} track${missing === 1 ? '' : 's'} need their file to listen.`}
      </p>
      <div className="set-actions">
        <button className="btn btn-small" onClick={pass} disabled={store.tracks.length === 0}>
          Pass the set (file)
        </button>
        <label className="btn btn-small">
          Open a set file
          <input
            type="file"
            accept=".json,application/json"
            hidden
            data-testid="open-set"
            onChange={(e) => {
              void open(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
        {!sure ? (
          <button
            className="btn btn-small"
            onClick={() => setSure(true)}
            disabled={store.tracks.length === 0}
          >
            Start a new set
          </button>
        ) : (
          <>
            <span className="muted">This clears the set kept in this browser.</span>
            <button
              className="btn btn-small"
              onClick={() => {
                store.clear()
                setSure(false)
              }}
            >
              Clear it
            </button>
            <button className="btn btn-small" onClick={() => setSure(false)}>
              Keep it
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export function YourMusic({ store }: { store: SetStore }) {
  const ready = store.profiles.length
  return (
    <div className="set-screen">
      <header className="set-screen-head">
        <h2>Your music</h2>
        <p className="muted">
          The shared collection for your set, from both of you. Files are decoded and analysed in
          this browser; nothing leaves this device. Tempos are a first estimate: confirm them or
          type your own.
        </p>
      </header>
      <NotMeasured />
      <KeepAndPass store={store} />
      <div className="set-djs">
        {DJ_IDS.map((dj) => (
          <DjColumn key={dj} store={store} dj={dj} />
        ))}
      </div>
      <div className="set-actions">
        <button
          className="btn btn-primary"
          disabled={ready < 2 || store.busy}
          onClick={() => store.go('concepts')}
        >
          Explore my tracks
        </button>
        <span className="muted">
          {store.busy
            ? 'Analysing…'
            : ready < 2
              ? 'Add at least two tracks to explore them.'
              : `${ready} tracks ready.`}
        </span>
      </div>
    </div>
  )
}
