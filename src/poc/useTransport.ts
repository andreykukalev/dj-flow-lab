import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { TransportState } from '../audio/transport'
import type { Translate } from '../i18n'
import { TakeOver } from '../ui/controller/takeover'
import type { MixerRenderer } from '../ui/mixer/renderer'
import { deckPosition, type PocSession } from './session'

// The transport of a session, shared by the proof-of-concept page and the Lab: play,
// pause, replay, phrase steps and seeking, the keys for them, the frame-loop readouts
// (position, both decks' bars, the output estimate, the beat flash), the mixer renderer
// with its take-over, and the calibration offset.

export const BAR = 4
export const PHRASE = 32
const HINT_MS = 3000

const SOURCE_KEYS: Record<string, string> = {
  outputTimestamp: 'poc.source.outputTimestamp',
  'outputTimestamp+latency': 'poc.source.timestampLatency',
  outputLatency: 'poc.source.outputLatency',
  baseLatency: 'poc.source.baseLatency',
  none: 'poc.source.none',
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
export function positionText(session: PocSession, beat: number, t: Translate): string {
  const { from, to } = session.areaBeats
  if (beat < from) return t('poc.toBlend', { n: Math.ceil((from - beat) / BAR) })
  if (beat >= to) return t('poc.afterBlend')
  return t('poc.blendBar', { bar: barFrom(beat, from), total: (to - from) / BAR })
}

export function useTransport(session: PocSession, t: Translate) {
  const { transport, loop, ctx } = session
  const state = useTransportState(session)
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
            onIdleGrab: () => showHint(t('poc.hint.idle')),
          })
        : null
    },
    [loop, transport, session, showHint, t],
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
    return loop.onFrame(({ beat, heard, frameMs, transport: tr }) => {
      if (position.current) position.current.textContent = positionText(session, beat, t)
      if (decks.current) {
        const a = deckPosition(session.timing, 'A', beat)
        const b = deckPosition(session.timing, 'B', beat)
        decks.current.textContent = `A ${a.bar}.${a.beat} · B ${b.bar >= 1 ? `${b.bar}.${b.beat}` : '–'}`
      }
      if (output.current && frameMs - lastOutput > 250) {
        lastOutput = frameMs
        output.current.textContent = `${t(SOURCE_KEYS[heard.source] ?? 'poc.source.none')} · ${(heard.latencySec * 1000).toFixed(0)} ms`
      }
      const whole = Math.floor(beat)
      if (flash.current && tr.kind === 'playing' && whole !== lastBeat && !Number.isNaN(lastBeat)) {
        flash.current.classList.remove('on')
        void flash.current.offsetWidth // restart the fade
        flash.current.classList.add('on')
      }
      lastBeat = whole
    })
  }, [loop, session, t])

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

  return {
    state,
    targets: { position, decks, output, flash },
    calibrationMs,
    setCalibrationMs,
    flashOn,
    setFlashOn,
    hint,
    onRenderer,
    replay,
    playPause,
    seek,
    step,
  }
}

export type Transport = ReturnType<typeof useTransport>

/** "+0.81" or "−0.14", for the tempo change chip. */
export const sign = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2)
