import { useSyncExternalStore } from 'react'
import type { SetPlan } from '../../engine/set/spine'
import { transitions } from '../../engine/set/spine'
import { useT } from '../../i18n/react'
import { AutoPanel } from '../../poc/AutoPanel'
import { DeckOverview, gridFitsBadly, OverviewHow } from '../../poc/Overview'
import { TakesBar } from '../../poc/TakesBar'
import { Timeline } from '../../poc/Timeline'
import { BlendControls, DeckPanel, SessionErrors } from '../../poc/Tracks'
import { PHRASE, sign, useTransport } from '../../poc/useTransport'
import { Mixer } from '../mixer/Mixer'
import { LabWork } from '../set/LabWork'
import { STATUS_KEY } from '../set/status'
import type { LabOpen, SetStore } from '../set/store'
import '../../poc/poc.css'
import './lab.css'

// The Lab, the core of the app: one transition of the set with the two decks mixing in
// front of the DJs. The mixing line and the mixer come first and move while it plays; the
// transport stays at the bottom of the window; the moment (blend start, area, what each
// deck plays) and the work on it (versions, comments, the decision) sit below. The grid
// fields and the sync settings are folded away, since they are rarely touched. The pieces
// are the proof of concept's own, so /poc/ and the Lab stay one Transition Builder.

export function LabPage({ store, lab, plan }: { store: SetStore; lab: LabOpen; plan: SetPlan }) {
  const t = useT()
  const session = store.audio
  const version = useSyncExternalStore(session.subscribe, () => session.version)
  const tr = useTransport(session, t)
  const { state } = tr
  const { position, decks, output, flash } = tr.targets
  const { tempoChange } = session
  const total = plan.order.length - 1
  const step = transitions(plan, store.profiles)[lab.index]
  const work = store.labWork
  const marks = work.comments.map((c) => ({
    bar: c.bar,
    label: t('lab.mark', { name: store.djName(c.author), text: c.text }),
  }))
  const gridOpen = gridFitsBadly(session.structure('A')) || gridFitsBadly(session.structure('B'))

  return (
    <div className="lab" data-testid="lab">
      <div className="lab-strip">
        <button className="btn btn-small" onClick={() => store.go('set')}>
          {t('lab.back')}
        </button>
        <div className="lab-strip-main">
          <div className="poc-title">
            <span className="deck-a">{session.decks.A.name}</span> <span className="muted">→</span>{' '}
            <span className="deck-b">{session.decks.B.name}</span>
          </div>
          <div className="muted">
            {t('lab.transition', { n: lab.index + 1, total })}
            {step && (
              <>
                {' · '}
                {t('set.bringsIn', { name: store.djName(step.mixedBy) })}
                {' · '}
                <span data-testid="lab-status">{t(STATUS_KEY[step.status])}</span>
              </>
            )}
            {' · '}
            {t('poc.strategy')}
            {session.loopRequest && ` · ${t('poc.loopOn', { deck: session.loopRequest.deck })}`}
          </div>
        </div>
        <div className="lab-strip-nav" role="group" aria-label={t('app.steps')}>
          <button
            className="btn btn-small"
            onClick={() => void store.goToTransition(lab.index - 1)}
            disabled={lab.index === 0 || store.labLoading}
            aria-label={t('lab.prev')}
            title={t('lab.prev')}
          >
            ‹
          </button>
          <button
            className="btn btn-small"
            onClick={() => void store.goToTransition(lab.index + 1)}
            disabled={lab.index >= total - 1 || store.labLoading}
            aria-label={t('lab.next')}
            title={t('lab.next')}
          >
            ›
          </button>
        </div>
        <div className="poc-flash" ref={flash} aria-hidden="true" hidden={!tr.flashOn} />
      </div>

      <div className="lab-hero">
        <Timeline key={version} session={session} onSeek={tr.seek} marks={marks} />
        <div className="lab-desk">
          <Mixer onRenderer={tr.onRenderer} note={t('poc.mixerNote')} />
          <TakesBar session={session} hint={tr.hint} />
        </div>
      </div>

      <div className="lab-columns">
        <section className="card lab-moment" aria-label={t('lab.moment')}>
          <div className="lab-moment-head">
            <h3>{t('lab.moment')}</h3>
            <p className="muted">{t('lab.momentLead')}</p>
            <OverviewHow />
          </div>
          <DeckOverview session={session} deck="A" onSeek={tr.seek} />
          <DeckOverview session={session} deck="B" onSeek={tr.seek} />
          <BlendControls session={session} />
          <AutoPanel session={session} />
          <SessionErrors session={session} />
          <details className="lab-grid" open={gridOpen}>
            <summary>
              <strong>{t('lab.grid')}</strong> <span className="muted">{t('lab.gridHint')}</span>
            </summary>
            <DeckPanel session={session} deck="A" />
            <DeckPanel session={session} deck="B" />
          </details>
        </section>
        <LabWork store={store} />
      </div>

      <footer className="poc-transport lab-transport" aria-label={t('poc.transport')}>
        <div className="poc-buttons">
          <button className="btn" onClick={() => void tr.replay()} aria-label={t('poc.replay')}>
            ⟲
          </button>
          <button className="btn" onClick={() => tr.step(-PHRASE)} aria-label={t('poc.phraseBack')}>
            ⏪
          </button>
          <button
            className="btn btn-primary btn-play"
            onClick={() => void tr.playPause()}
            aria-label={t(state.kind === 'playing' ? 'poc.pause' : 'poc.play')}
            data-testid="play"
          >
            {state.kind === 'playing' ? '❚❚' : '▶'}
          </button>
          <button
            className="btn"
            onClick={() => tr.step(PHRASE)}
            aria-label={t('poc.phraseForward')}
          >
            ⏩
          </button>
        </div>
        <div className="poc-position">
          <span className="poc-bar" ref={position} data-testid="position" />
          <span className="poc-decks" ref={decks} />
          <span className="muted" data-testid="transport-state">
            {t(`poc.state.${state.kind}`)}
          </span>
        </div>
        <details className="lab-sync">
          <summary className="btn btn-small">{t('lab.sync')}</summary>
          <div className="poc-output lab-sync-body">
            <span className="chip">
              B {sign(tempoChange.percent)} % · {sign(tempoChange.semitones)} st
            </span>
            <span className="chip" ref={output} data-testid="output" />
            <label className="poc-field">
              {t('poc.offset')}
              <input
                type="number"
                step={5}
                min={-500}
                max={500}
                value={tr.calibrationMs}
                onChange={(e) => tr.setCalibrationMs(Number(e.target.value) || 0)}
                aria-label={t('poc.offsetAria')}
              />
              ms
            </label>
            <label className="poc-field">
              <input
                type="checkbox"
                checked={tr.flashOn}
                onChange={(e) => tr.setFlashOn(e.target.checked)}
              />
              {t('poc.flash')}
            </label>
          </div>
        </details>
      </footer>
    </div>
  )
}
