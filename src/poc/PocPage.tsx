import { useSyncExternalStore } from 'react'
import { useT } from '../i18n/react'
import { Mixer } from '../ui/mixer/Mixer'
import { Overview } from './Overview'
import type { PocSession } from './session'
import { TakesBar } from './TakesBar'
import { Timeline } from './Timeline'
import { Tracks } from './Tracks'
import { PHRASE, sign, useTransport } from './useTransport'
import './poc.css'

// Proof-of-concept page, laid out like the Try screen (mockup iPad 4) without the
// "Why it moves" column: the ruler with both decks, the mixer, and the transport.
// Any control can be grabbed while it plays; the moves become "Your take" (#68).

export function PocPage({ session }: { session: PocSession }) {
  const t = useT()
  const version = useSyncExternalStore(session.subscribe, () => session.version)
  const { tempoChange } = session
  const tr = useTransport(session, t)
  const { state } = tr
  const { position, decks, output, flash } = tr.targets

  return (
    <div className="poc">
      <header className="poc-header">
        <div>
          <div className="poc-title">
            <span className="deck-a">{session.decks.A.name}</span> <span className="muted">→</span>{' '}
            <span className="deck-b">{session.decks.B.name}</span>
          </div>
          <div className="muted">
            {t('poc.strategy')}
            {session.loopRequest &&
              ` · ${t('poc.loopOn', { deck: session.loopRequest.deck })}`} · {t('poc.proof')}
          </div>
        </div>
        <div className="poc-flash" ref={flash} aria-hidden="true" hidden={!tr.flashOn} />
      </header>

      <main className="poc-main">
        <Tracks session={session} />
        <Overview session={session} onSeek={tr.seek} />
        <Timeline key={version} session={session} onSeek={tr.seek} />
        <TakesBar session={session} hint={tr.hint} />
        <Mixer onRenderer={tr.onRenderer} note={t('poc.mixerNote')} />
      </main>

      <footer className="poc-transport" aria-label={t('poc.transport')}>
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
        <div className="poc-output">
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
      </footer>
    </div>
  )
}
