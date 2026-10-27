import { DJ_IDS, formatDuration, type DjId } from '../../engine/set/profile'
import { useT } from '../../i18n/react'
import { CommitField, ConfirmButton, Layer, NotMeasured, Shape } from './Bits'
import type { CollectionTrack, SetStore } from './store'

// "Your music" (#88): the shared collection of a set, one column per DJ. Each track is a
// line: its name, one state while it is not ready (analysing, file needed, could not
// decode), its length, then its shape and the tempo with how sure the estimate is. The
// sections stay folded; the step's action sits in the heading.

function TrackState({ track }: { track: CollectionTrack }) {
  const t = useT()
  const text = {
    waiting: t('music.waiting'),
    analysing: t('music.analysing'),
    missing: t('music.state.missing'),
    failed: t('music.state.failed'),
    ready: '',
  }[track.status]
  if (!text) return null
  return (
    <span className="chip set-state" data-state={track.status}>
      {text}
    </span>
  )
}

function TrackRow({ store, track }: { store: SetStore; track: CollectionTrack }) {
  const t = useT()
  const p = track.profile
  return (
    <li
      className="set-row"
      data-testid="collection-track"
      data-status={track.status}
      data-owner={track.owner}
    >
      <div className="set-row-head">
        <span className="set-row-name">{track.fileName}</span>
        <TrackState track={track} />
        {track.status === 'missing' && (
          <label className="btn btn-small" title={t('music.selectFileHint')}>
            {t('music.selectFile')}
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
          <span className="muted">
            {t('music.matched', {
              by: t(
                track.matchedBy === 'fingerprint' ? 'music.by.fingerprint' : 'music.by.nameLength',
              ),
            })}
          </span>
        )}
        {p && <span className="muted set-row-length">{formatDuration(p.durationSec)}</span>}
        <ConfirmButton
          label={t('music.remove', { name: track.fileName })}
          title={t('music.removeHint')}
          onConfirm={() => store.removeFromCollection(track.id)}
        />
      </div>
      {track.error && <p className="poc-error">{track.error}</p>}
      {p && (
        <>
          <Shape profile={p} />
          <div className="set-row-fields">
            <label className="poc-field">
              {t('music.bpm')}
              <CommitField
                label={t('music.bpm')}
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
                title={t('music.confirmHint')}
              >
                {t('music.confirm')}
              </button>
            )}
            <label className="poc-field">
              {t('music.key')}
              <CommitField
                label={t('music.key')}
                placeholder="—"
                className="set-key"
                value={p.key ?? ''}
                onCommit={(v) => store.setKey(track.id, v)}
              />
            </label>
            <details className="set-fold">
              <summary>{t('music.sections')}</summary>
              <ol className="set-sections">
                {p.structure.sections.map((s) => (
                  <li key={s.fromBar} title={s.reasons.join(', ')}>
                    <strong>{s.term}</strong>{' '}
                    {t('music.sectionBars', { from: s.fromBar, to: s.toBar })}
                    <span className="muted"> · {s.reasons.join(', ')}</span>
                  </li>
                ))}
                <li className="muted">{t('music.sectionsNote')}</li>
              </ol>
            </details>
          </div>
        </>
      )}
    </li>
  )
}

function DjColumn({ store, dj }: { store: SetStore; dj: DjId }) {
  const t = useT()
  const tracks = store.tracks.filter((x) => x.owner === dj)
  const placeholder = t(dj === 'dj1' ? 'dj.1' : 'dj.2')
  return (
    <section className="card set-dj" aria-label={t('music.djTracks', { name: store.djName(dj) })}>
      <div className="set-dj-head">
        <label className="poc-field">
          <span className="sr-only">{t('music.djName', { dj: placeholder })}</span>
          <CommitField
            label={t('music.djName', { dj: placeholder })}
            placeholder={t('music.djNamePlaceholder', { dj: placeholder })}
            className={`set-dj-name set-owner-${dj}`}
            value={store.djs[dj].name}
            onCommit={(v) => store.setDjName(dj, v)}
          />
        </label>
        <span className="muted">{t('music.count', { n: tracks.length })}</span>
        <label className="btn btn-small">
          {t('music.add')}
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
        <p className="muted">{t('music.empty')}</p>
      ) : (
        <ul className="set-rows">
          {tracks.map((x) => (
            <TrackRow key={x.id} store={store} track={x} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function YourMusic({ store }: { store: SetStore }) {
  const t = useT()
  const ready = store.profiles.length
  return (
    <div className="set-screen">
      <header className="set-screen-head set-screen-head-row">
        <div>
          <h2>{t('music.title')}</h2>
          <p className="muted">{t('music.lead')}</p>
          <NotMeasured compact />
        </div>
        <div className="set-screen-action">
          <button
            className="btn btn-primary"
            disabled={ready < 2 || store.busy}
            onClick={() => store.go('concepts')}
          >
            {t('music.explore')}
          </button>
          <span className="muted">
            {store.busy
              ? t('music.analysing')
              : ready < 2
                ? t('music.needTwo')
                : t('music.ready', { n: ready })}
          </span>
        </div>
      </header>
      <div className="set-djs">
        {DJ_IDS.map((dj) => (
          <DjColumn key={dj} store={store} dj={dj} />
        ))}
      </div>
    </div>
  )
}
