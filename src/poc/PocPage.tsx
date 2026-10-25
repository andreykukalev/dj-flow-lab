import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { TransportState } from '../audio/transport'
import { TakeOver } from '../ui/controller/takeover'
import type { MixerRenderer } from '../ui/mixer/renderer'
import { Mixer } from '../ui/mixer/Mixer'
import { Overview } from './Overview'
import { deckPosition, type PocSession } from './session'
import { TakesBar } from './TakesBar'
import { Timeline } from './Timeline'
import { Tracks } from './Tracks'
import './poc.css'

// Proof-of-concept page, laid out like the Try screen (mockup iPad 4) without the
// "Why it moves" column: the ruler with both decks, the mixer, and the transport.
// Any control can be grabbed while it plays; the moves become "Your take" (#68).

const BAR = 4
const PHRASE = 32
const HINT_MS = 3000

const SOURCE_NAMES: Record<string, string> = {
  outputTimestamp: 'output timestamp',
  'outputTimestamp+latency': 'timestamp + latency',
  outputLatency: 'output latency',
  baseLatency: 'base latency',
  none: 'no estimate',
}

function useTransportState(session: PocSession): TransportState {
  const { transport } = session
  return useSyncExternalStore(
    useCallback((cb) => transport.subscribe(cb), [transport]),
    () => transport.state,
  )
}

/** `bar.beat` counted from `from`, bar 1 beat 1 there. */
function barFrom(beat: number, from: number): string {
  const whole = Math.floor(beat - from)
  const bar = Math.floor(whole / BAR) + 1
  return `${bar}.${whole - (bar - 1) * BAR + 1}`
}

/** Where the cursor is relative to the transition area. */
function positionText(session: PocSession, beat: number): string {
  const { from, to } = session.areaBeats
  if (beat < from) {
    const bars = Math.ceil((from - beat) / BAR)
    return `${bars} bar${bars === 1 ? '' : 's'} to the blend`
  }
  if (beat >= to) return 'After the blend'
  return `Blend bar ${barFrom(beat, from)} of ${(to - from) / BAR}`
}

export function PocPage({ session }: { session: PocSession }) {
  const { transport, loop, ctx } = session
  const state = useTransportState(session)
  const version = useSyncExternalStore(session.subscribe, () => session.version)
  const { tempoChange } = session
  const position = useRef<HTMLSpanElement>(null)
  const decks = useRef<HTMLSpanElement>(null)
  const output = useRef<HTMLSpanElement>(null)
  const flash = useRef<HTMLDivElement>(null)
  const [calibrationMs, setCalibrationMs] = useState(loop.options.calibrationMs)
  const [flashOn, setFlashOn] = useState(false)

  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const showHint = useCallback((text: string) => {
    clearTimeout(hintTimer.current)
    setHint(text)
    hintTimer.current = setTimeout(() => setHint(null), HINT_MS)
  }, [])
  useEffect(() => () => clearTimeout(hintTimer.current), [])

  const takeOver = useRef<TakeOver | null>(null)
  const onRenderer = useCallback(
    (r: MixerRenderer | null) => {
      loop.setRenderer(r)
      takeOver.current?.dispose()
      takeOver.current = r
        ? new TakeOver(r.root, transport, loop, {
            onTake: (take) => session.addTake(take),
            onIdleGrab: () => showHint('Press play, then grab a knob or fader while it plays.'),
          })
        : null
    },
    [loop, transport, session, showHint],
  )

  useEffect(() => {
    loop.start()
    return () => loop.stop()
  }, [loop])

  useEffect(() => {
    loop.setCalibration(calibrationMs)
  }, [loop, calibrationMs])

  // Position, output and flash are written from the frame loop, not through React.
  useEffect(() => {
    let lastBeat = Number.NaN
    let lastOutput = 0
    return loop.onFrame(({ beat, heard, frameMs, transport: t }) => {
      if (position.current) position.current.textContent = positionText(session, beat)
      if (decks.current) {
        const a = deckPosition(session.timing, 'A', beat)
        const b = deckPosition(session.timing, 'B', beat)
        decks.current.textContent = `A ${a.bar}.${a.beat} · B ${b.bar >= 1 ? `${b.bar}.${b.beat}` : '–'}`
      }
      if (output.current && frameMs - lastOutput > 250) {
        lastOutput = frameMs
        output.current.textContent = `${SOURCE_NAMES[heard.source]} · ${(heard.latencySec * 1000).toFixed(0)} ms`
      }
      const whole = Math.floor(beat)
      if (flash.current && t.kind === 'playing' && whole !== lastBeat && !Number.isNaN(lastBeat)) {
        flash.current.classList.remove('on')
        void flash.current.offsetWidth // restart the fade
        flash.current.classList.add('on')
      }
      lastBeat = whole
    })
  }, [loop, session])

  const startAt = useCallback(
    async (beat: number) => {
      if (ctx.state !== 'running') await ctx.resume()
      transport.startAt(beat)
    },
    [ctx, transport],
  )

  // The beat on screen, for the step buttons and keys.
  const shownBeat = useRef(session.compiled.span.startBeat)
  useEffect(() => loop.onFrame(({ beat }) => (shownBeat.current = beat)), [loop])
  const currentBeat = useCallback(() => shownBeat.current, [])

  // Replay starts where the plan does: the pre-roll before the transition area.
  const replay = useCallback(() => startAt(session.compiled.span.startBeat), [session, startAt])

  const playPause = useCallback(async () => {
    const s = transport.state
    if (s.kind === 'playing') transport.pause()
    else if (s.kind === 'paused') await startAt(s.beat)
    else await replay()
  }, [transport, startAt, replay])

  /** Moves the cursor anywhere in track A or the plan; it keeps playing if it was. */
  const seek = useCallback(
    (beat: number) => {
      const { from, to } = session.seekRange
      const target = Math.max(from, Math.min(to, beat))
      if (transport.state.kind === 'playing') void startAt(target)
      else transport.cue(target)
    },
    [session, transport, startAt],
  )

  const step = useCallback(
    (beats: number) => {
      const beat = currentBeat()
      const base = beats > 0 ? Math.floor(beat / beats) * beats : Math.ceil(beat / -beats) * -beats
      seek(base + beats)
    },
    [currentBeat, seek],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.ctrlKey || e.metaKey) {
        const redo = e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)
        if (redo) session.redo()
        else if (e.code === 'KeyZ') session.undo()
        else return
        e.preventDefault()
        return
      }
      // A focused button handles Space itself.
      if (e.code === 'Space' && e.target instanceof HTMLButtonElement) return
      if (e.code === 'Space') void playPause()
      else if (e.code === 'ArrowRight') step(e.shiftKey ? PHRASE : BAR)
      else if (e.code === 'ArrowLeft') step(e.shiftKey ? -PHRASE : -BAR)
      else if (e.code === 'KeyR') void replay()
      else if (e.code === 'KeyB') session.setBlendStartAtCursor()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playPause, step, replay, session])

  const sign = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2)

  return (
    <div className="poc">
      <header className="poc-header">
        <div>
          <div className="poc-title">
            <span className="deck-a">{session.decks.A.name}</span> <span className="muted">→</span>{' '}
            <span className="deck-b">{session.decks.B.name}</span>
          </div>
          <div className="muted">
            Long blend with bass swap
            {session.loopRequest && ` · loop on ${session.loopRequest.deck}`} · proof of concept
          </div>
        </div>
        <div className="poc-flash" ref={flash} aria-hidden="true" hidden={!flashOn} />
      </header>

      <main className="poc-main">
        <Tracks session={session} />
        <Overview session={session} onSeek={seek} />
        <Timeline key={version} session={session} onSeek={seek} />
        <TakesBar session={session} hint={hint} />
        <Mixer onRenderer={onRenderer} note="The crossfader stays in the middle in this plan." />
      </main>

      <footer className="poc-transport" aria-label="Transport">
        <div className="poc-buttons">
          <button className="btn" onClick={() => void replay()} aria-label="Replay">
            ⟲
          </button>
          <button className="btn" onClick={() => step(-PHRASE)} aria-label="Phrase back">
            ⏪
          </button>
          <button
            className="btn btn-primary btn-play"
            onClick={() => void playPause()}
            aria-label={state.kind === 'playing' ? 'Pause' : 'Play'}
            data-testid="play"
          >
            {state.kind === 'playing' ? '❚❚' : '▶'}
          </button>
          <button className="btn" onClick={() => step(PHRASE)} aria-label="Phrase forward">
            ⏩
          </button>
        </div>
        <div className="poc-position">
          <span className="poc-bar" ref={position} data-testid="position" />
          <span className="poc-decks" ref={decks} />
          <span className="muted" data-testid="transport-state">
            {state.kind}
          </span>
        </div>
        <div className="poc-output">
          <span className="chip">
            B {sign(tempoChange.percent)} % · {sign(tempoChange.semitones)} st
          </span>
          <span className="chip" ref={output} data-testid="output" />
          <label className="poc-field">
            Offset
            <input
              type="number"
              step={5}
              min={-500}
              max={500}
              value={calibrationMs}
              onChange={(e) => setCalibrationMs(Number(e.target.value) || 0)}
              aria-label="Calibration offset in milliseconds"
            />
            ms
          </label>
          <label className="poc-field">
            <input
              type="checkbox"
              checked={flashOn}
              onChange={(e) => setFlashOn(e.target.checked)}
            />
            Flash on beat
          </label>
        </div>
      </footer>
    </div>
  )
}
