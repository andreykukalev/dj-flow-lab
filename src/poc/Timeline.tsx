import { useEffect, useRef } from 'react'
import type { ControlKey, DeckControl } from '../engine/mixer'
import type { DeckId } from '../engine/model'
import { valueAt, type CompiledPlan, type Segment } from '../engine/plan/compile'
import {
  areaPath,
  curvePoints,
  direction,
  formatValue,
  laneY,
  linePath,
  movesOf,
  neutralOf,
  sameCurve,
  type Move,
} from './lanes'
import { loopSchedule, transitionBeatToDeckBeat } from '../engine/time'
import type { PocSession } from './session'
import { deckPosition } from './session'

// The proof of concept's bar ruler: both decks on one ruler in transition beats, each
// deck's fader lane drawn as level, with a lane under it for each EQ band and the filter
// (trim and crossfader join only when a version moves them). Every lane is drawn from the
// compiled plan the audio plays, each move is shaded while it happens and labelled with
// its direction and the value it reaches, and a control that never moves is shown flat
// and dimmed. While there is a take, the version not playing is drawn dashed on every
// lane where it differs. The transition area is shaded (#75), the blend start is marked
// and the handoff dashed, and the playhead and the readouts next to each lane are moved
// by the controller loop. A loop (#81) gets a row next to its deck, one box per pass;
// the deck's ruler numbers follow it. #20 builds the full timeline.

const MARKERS: { id: string; label: string }[] = [
  { id: 'bring-in', label: 'B in, no bass' },
  { id: 'thin-out', label: 'A thins out' },
  { id: 'bass-swap', label: 'Bass swap' },
  { id: 'fade-out', label: 'A fades' },
]

const LANES: { control: DeckControl; label: string; name: string; always: boolean }[] = [
  { control: 'eqHigh', label: 'High', name: 'high EQ', always: true },
  { control: 'eqMid', label: 'Mid', name: 'mid EQ', always: true },
  { control: 'eqLow', label: 'Low', name: 'low EQ', always: true },
  { control: 'filter', label: 'Filter', name: 'filter', always: true },
  { control: 'trim', label: 'Trim', name: 'trim', always: false },
]

const FADER_HEIGHT = 64
const LANE_HEIGHT = 32
/** Value labels closer than this share of the span to the previous one are left out. */
const LABEL_GAP = 0.07

interface LaneLabel {
  beat: number
  text: string
  /** Where the label sits: away from the curve. */
  side: 'top' | 'bottom'
}

/** Which controls change, and whether the version not playing differs, for one lane. */
function laneInfo(key: ControlKey, compiled: CompiledPlan, compared: CompiledPlan | null) {
  const segments = compiled.controls[key]
  const moves = movesOf(segments)
  const other = compared?.controls[key]
  const differs = other !== undefined && !sameCurve(segments, other)
  return { segments, moves, other: differs ? other : undefined, differs }
}

export function Timeline({
  session,
  onSeek,
}: {
  session: PocSession
  onSeek: (beat: number) => void
}) {
  const { compiled, compared, timing, plan, loop, listening } = session
  const { startBeat, endBeat } = compiled.span
  const span = endBeat - startBeat
  const sampleRate = session.ctx.sampleRate
  const pct = (beat: number) => `${(((beat - startBeat) / span) * 100).toFixed(3)}%`
  const playhead = useRef<HTMLDivElement>(null)
  const readouts = useRef(new Map<ControlKey, HTMLElement>())

  useEffect(
    () =>
      loop.onFrame(({ beat, state }) => {
        const u = Math.min(1, Math.max(0, (beat - startBeat) / span))
        playhead.current?.style.setProperty('left', `${(u * 100).toFixed(3)}%`)
        for (const [key, el] of readouts.current) {
          const text = formatValue(key, state[key], sampleRate)
          if (el.textContent !== text) el.textContent = text
        }
      }),
    [loop, startBeat, span, sampleRate],
  )

  const readout = (key: ControlKey) => (el: HTMLElement | null) => {
    if (el) readouts.current.set(key, el)
    else readouts.current.delete(key)
  }

  const barOf = (beat: number) => deckPosition(timing, 'A', beat).bar
  const versions = { take: 'Your take', original: 'Original' }
  const playingName = versions[listening]
  const comparedName = versions[listening === 'take' ? 'original' : 'take']

  /** "down to kill at A bar 25; ...", for the lane's title. */
  const describe = (key: ControlKey, moves: Move[]) =>
    moves.length === 0
      ? `stays at ${formatValue(key, valueAt(compiled.controls[key], startBeat), sampleRate)}`
      : moves
          .map((m) => {
            const verb = ['down to', 'back to', 'up to'][direction(m) + 1]
            const when =
              m.b1 > m.b0
                ? `over A bars ${barOf(m.b0)}–${barOf(m.b1 - 1e-6)}`
                : `at A bar ${barOf(m.b0)}`
            return `${verb} ${formatValue(key, m.to, sampleRate)} ${when}`
          })
          .join('; ')

  /** The value each move reaches, at its end, and the starting value when it is not neutral. */
  const labelsOf = (key: ControlKey, segments: readonly Segment[], moves: Move[]): LaneLabel[] => {
    const neutral = neutralOf(key)
    const side = (v: number): LaneLabel['side'] => (v < neutral - 1e-6 ? 'top' : 'bottom')
    const all: LaneLabel[] = []
    const first = valueAt(segments, startBeat)
    if (Math.abs(first - neutral) > 1e-6 && !key.endsWith('.fader'))
      all.push({ beat: startBeat, text: formatValue(key, first, sampleRate), side: side(first) })
    for (const m of moves) {
      const glyph = ['▼ ', '◆ ', '▲ '][direction(m) + 1]
      all.push({
        beat: m.b1,
        text: `${glyph}${formatValue(key, m.to, sampleRate)}`,
        side: side(m.to),
      })
    }
    const kept: LaneLabel[] = []
    for (const l of all) {
      const last = kept.at(-1)
      if (last && l.beat - last.beat < LABEL_GAP * span) kept[kept.length - 1] = l
      else kept.push(l)
    }
    return kept
  }

  const valueLabels = (labels: LaneLabel[], fader = false) =>
    labels.map((l) => (
      <span
        key={`${l.beat}-${l.text}`}
        className="timeline-value"
        data-side={fader ? 'top' : l.side}
        data-anchor={(l.beat - startBeat) / span > 0.88 ? 'end' : 'start'}
        style={{ left: pct(l.beat) }}
      >
        {l.text}
      </span>
    ))

  const ghostLegend = compared !== null && (
    <span className="timeline-legend-ghost">
      Solid: {playingName} · dashed: {comparedName} · <span className="timeline-diff-dot" /> differs
    </span>
  )

  const faderLane = (deck: DeckId) => {
    const key: ControlKey = `${deck}.fader`
    const { segments, moves, other, differs } = laneInfo(key, compiled, compared)
    const half = (v: number) => Math.max(0.5, v * 30)
    const otherPoints = other && curvePoints(other, startBeat, endBeat)
    return (
      <div
        className={`timeline-row timeline-fader deck-${deck.toLowerCase()}`}
        data-lane={key}
        data-changed={moves.length > 0}
        data-differs={differs}
        title={`Deck ${deck} fader: ${describe(key, moves)}`}
      >
        <div className="timeline-label timeline-deck">
          <strong>
            {deck}
            {differs && <span className="timeline-diff-dot" />}
          </strong>
          <span>{(deck === 'A' ? timing.gridA : timing.gridB).bpm.toFixed(2)} BPM</span>
          <span className="timeline-readout" ref={readout(key)} />
        </div>
        <svg
          className={`timeline-lane lane-${deck.toLowerCase()}`}
          viewBox={`0 0 ${span} ${FADER_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: span }, (_, i) => {
            const b = startBeat + i
            const level = valueAt(segments, b + 0.5)
            const h = Math.max(1, level * 60)
            return (
              <rect
                key={b}
                x={i + 0.15}
                y={(FADER_HEIGHT - h) / 2}
                width={0.7}
                height={h}
                opacity={level > 0 ? 0.9 : 0.3}
              />
            )
          })}
          {otherPoints && (
            <path
              className="timeline-ghost"
              d={
                linePath(otherPoints, startBeat, (v) => FADER_HEIGHT / 2 - half(v)) +
                linePath(otherPoints, startBeat, (v) => FADER_HEIGHT / 2 + half(v))
              }
            />
          )}
        </svg>
        {valueLabels(labelsOf(key, segments, moves), true)}
      </div>
    )
  }

  const controlLane = (key: ControlKey, label: string, title: string, deck: string) => {
    const { segments, moves, other, differs } = laneInfo(key, compiled, compared)
    const y = (v: number) => laneY(key, v, LANE_HEIGHT)
    const mid = LANE_HEIGHT / 2
    const points = curvePoints(segments, startBeat, endBeat)
    const changed = moves.length > 0
    return (
      <div
        key={key}
        className={`timeline-row timeline-control deck-${deck}`}
        data-lane={key}
        data-changed={changed}
        data-differs={differs}
        title={`${title}: ${describe(key, moves)}`}
      >
        <div className="timeline-label">
          <span className="timeline-label-name">
            {label}
            {differs && <span className="timeline-diff-dot" />}
          </span>
          <span className="timeline-readout" ref={readout(key)} />
        </div>
        <svg
          className="timeline-curve"
          viewBox={`0 0 ${span} ${changed || differs ? LANE_HEIGHT : 12}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {changed || differs ? (
            <>
              {moves
                .filter((m) => m.b1 > m.b0)
                .map((m) => (
                  <rect
                    key={m.b0}
                    className="timeline-move"
                    x={m.b0 - startBeat}
                    width={m.b1 - m.b0}
                    y={0}
                    height={LANE_HEIGHT}
                  />
                ))}
              <line className="timeline-neutral" x1={0} x2={span} y1={mid} y2={mid} />
              <path className="timeline-area" d={areaPath(points, startBeat, y, mid)} />
              {other && (
                <path
                  className="timeline-ghost"
                  d={linePath(curvePoints(other, startBeat, endBeat), startBeat, y)}
                />
              )}
              <path className="timeline-line" d={linePath(points, startBeat, y)} />
            </>
          ) : (
            <line className="timeline-line" x1={0} x2={span} y1={6} y2={6} />
          )}
        </svg>
        {changed || differs ? (
          valueLabels(labelsOf(key, segments, moves))
        ) : (
          <span className="timeline-static">no change</span>
        )}
      </div>
    )
  }

  /** A deck's EQ and filter lanes; trim only when a version moves it. */
  const controlLanes = (deck: DeckId) =>
    LANES.map(({ control, label, name, always }) => {
      const key: ControlKey = `${deck}.${control}`
      const { moves, differs } = laneInfo(key, compiled, compared)
      if (!always && moves.length === 0 && !differs) return null
      return controlLane(key, label, `Deck ${deck} ${name}`, deck.toLowerCase())
    })

  const crossfader = laneInfo('mixer.crossfader', compiled, compared)

  const deckLoop = loopSchedule(timing)
  /** The loop's passes on the deck it plays on, clipped to the plan. */
  const loopRow = (deck: DeckId) => {
    if (!deckLoop || deckLoop.deck !== deck) return null
    const firstBar = deckLoop.startBeat / 4 + 1
    const lastBar = firstBar + deckLoop.lengthBeats / 4 - 1
    return (
      <div
        className={`timeline-row timeline-loop deck-${deck.toLowerCase()}`}
        data-testid="timeline-loop"
        title={`Deck ${deck} loops bars ${firstBar}–${lastBar}, ${deckLoop.passes} passes`}
      >
        <div className="timeline-label">
          <span className="timeline-label-name">Loop</span>
        </div>
        {Array.from({ length: deckLoop.passes }, (_, k) => {
          const b0 = Math.max(startBeat, deckLoop.from + k * deckLoop.lengthBeats)
          const b1 = Math.min(endBeat, deckLoop.from + (k + 1) * deckLoop.lengthBeats)
          if (b1 <= b0) return null
          return (
            <span
              key={k}
              className="timeline-loop-pass"
              style={{ left: pct(b0), width: `${((b1 - b0) / span) * 100}%` }}
            >
              {k === 0 ? `${deck} ${firstBar}–${lastBar}` : `×${k + 1}`}
            </span>
          )
        })}
      </div>
    )
  }

  // A's phrase lines, in transition beats: they stay on A's bars when the blend start is
  // off a phrase line or off the downbeat.
  const startA = transitionBeatToDeckBeat(timing, 'A', 0)
  const lineOffset = timing.gridA.phraseOffsetBars * 4 - startA - startBeat
  const phrases: number[] = []
  for (let b = startBeat + (((lineOffset % 32) + 32) % 32); b < endBeat; b += 32) phrases.push(b)
  const area = session.areaBeats
  const handoff = plan.annotations.find((a) => a.id === 'bass-swap')?.atBeat

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const beat = startBeat + ((e.clientX - rect.left) / rect.width) * span
    onSeek(Math.max(startBeat, Math.min(endBeat - 4, Math.floor(beat / 4) * 4)))
  }

  return (
    <section className="card timeline" aria-label="Transition timeline">
      <div className="timeline-legend" aria-hidden="true">
        <span>
          <span className="timeline-legend-swatch" /> moving · ▲ up ▼ down, to the value shown
        </span>
        {ghostLegend}
      </div>
      <div className="timeline-body" onClick={seek} data-testid="timeline">
        <div className="timeline-ruler">
          {phrases.map((b) => (
            <span key={b} style={{ left: pct(b) }}>
              {b === startBeat ? 'A ' : ''}
              {deckPosition(timing, 'A', b).bar}
            </span>
          ))}
        </div>
        <div className="timeline-track">
          <div
            className="timeline-overlap"
            style={{ left: pct(area.from), width: `${((area.to - area.from) / span) * 100}%` }}
            data-testid="timeline-area"
          />
          {phrases.map((b) => (
            <div key={b} className="timeline-phrase-line" style={{ left: pct(b) }} />
          ))}
          {faderLane('A')}
          {loopRow('A')}
          {controlLanes('A')}
          <div className="timeline-markers">
            {MARKERS.map((m) => {
              const a = plan.annotations.find((n) => n.id === m.id)
              return (
                a && (
                  <span key={m.id} className="timeline-marker" style={{ left: pct(a.atBeat) }}>
                    {m.label}
                  </span>
                )
              )
            })}
          </div>
          {(crossfader.moves.length > 0 || crossfader.differs) &&
            controlLane('mixer.crossfader', 'X-fader', 'Crossfader', 'x')}
          {controlLanes('B')}
          {loopRow('B')}
          {faderLane('B')}
          {handoff !== undefined && (
            <div className="timeline-handoff" style={{ left: pct(handoff) }} />
          )}
          <div className="timeline-blendstart" style={{ left: pct(0) }} title="Blend start" />
          <div className="timeline-playhead" ref={playhead} />
        </div>
        <div className="timeline-ruler">
          {phrases
            .filter((b) => deckPosition(timing, 'B', b).bar >= 1)
            .map((b) => (
              <span key={b} style={{ left: pct(b) }}>
                {deckPosition(timing, 'B', b).bar === 1 ? 'B ' : ''}
                {deckPosition(timing, 'B', b).bar}
              </span>
            ))}
        </div>
      </div>
    </section>
  )
}
