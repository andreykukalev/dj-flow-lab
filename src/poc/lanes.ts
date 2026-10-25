import {
  controlSpec,
  eqGain,
  faderGain,
  filterCutoffs,
  FILTER_DEAD_ZONE,
  gainToDb,
  type ControlKey,
} from '../engine/mixer'
import { segmentValue, type Segment } from '../engine/plan/compile'

// The mixing line's lanes: each control's curve taken from the compiled plan's segments,
// the same ones the scheduler plays, so the line shows the values that are heard. Moves
// are found in those segments, and values are shown in the units a DJ reads off the
// mixer: dB, kill, the filter's cutoff.

/** A point of a control's curve: transition beat and control position. */
export type LanePoint = readonly [beat: number, value: number]

/** One move of a control: a ramp, a jump, or a run of them with no hold in between. */
export interface Move {
  b0: number
  b1: number
  from: number
  to: number
}

const EPS = 1e-9

/** Smooth ramps are drawn as straight pieces this long, in beats. */
const SMOOTH_STEP_BEATS = 0.25

/**
 * The exact curve of one control from `startBeat` to `endBeat`: holds and linear ramps
 * by their ends, smooth ramps sampled, and a jump as two points on the same beat.
 */
export function curvePoints(
  segments: readonly Segment[],
  startBeat: number,
  endBeat: number,
): LanePoint[] {
  const points: LanePoint[] = []
  const push = (beat: number, value: number) => {
    const last = points.at(-1)
    if (last && Math.abs(last[0] - beat) < EPS && Math.abs(last[1] - value) < EPS) return
    points.push([beat, value])
  }
  for (const s of segments) {
    const b0 = Math.max(startBeat, s.b0)
    const b1 = Math.min(endBeat, s.b1)
    if (b1 < b0) continue
    push(b0, segmentValue(s, b0))
    if (s.curve === 'smooth') {
      for (let b = b0 + SMOOTH_STEP_BEATS; b < b1; b += SMOOTH_STEP_BEATS)
        push(b, segmentValue(s, b))
    }
    push(b1, b1 >= s.b1 ? s.v1 : segmentValue(s, b1))
  }
  return points
}

/**
 * The moves of one control, in beat order. Ramps that follow each other in the same
 * direction make one move; a turn (down, then back up) starts a new one, so the value
 * at the turn is shown too.
 */
export function movesOf(segments: readonly Segment[]): Move[] {
  const moves: Move[] = []
  let previous: Segment | undefined
  for (const s of segments) {
    const jump = previous !== undefined && Math.abs(s.v0 - previous.v1) > EPS
    const ramp = s.b1 > s.b0 && Math.abs(s.v1 - s.v0) > EPS
    if (jump || ramp) {
      const piece: Move = {
        b0: s.b0,
        b1: ramp ? s.b1 : s.b0,
        from: jump ? previous!.v1 : s.v0,
        to: ramp ? s.v1 : s.v0,
      }
      const last = moves.at(-1)
      if (last && s.b0 <= last.b1 + EPS && direction(piece) * direction(last) >= 0) {
        last.b1 = piece.b1
        last.to = piece.to
      } else {
        moves.push(piece)
      }
    }
    previous = s
  }
  return moves
}

/** Whether two versions of a control play the same curve. */
export function sameCurve(a: readonly Segment[], b: readonly Segment[]): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < EPS
  const pa = curvePoints(a, -Infinity, Infinity)
  const pb = curvePoints(b, -Infinity, Infinity)
  return (
    pa.length === pb.length && pa.every((p, i) => close(p[0], pb[i]![0]) && close(p[1], pb[i]![1]))
  )
}

/** −1 when a move turns the control down (or the filter towards low-pass), +1 up, 0 back where it was. */
export function direction(move: Move): -1 | 0 | 1 {
  const d = move.to - move.from
  return Math.abs(d) < 1e-6 ? 0 : d > 0 ? 1 : -1
}

/**
 * The control's neutral position: unity for EQ and trim, off for the filter, centre for
 * the crossfader. Faders have their own lane, drawn as level.
 */
export function neutralOf(key: ControlKey): number {
  return controlSpec(key).default
}

/**
 * Vertical position in a lane `height` high: the neutral position in the middle, the
 * control's end stops `pad` from the edges. Up is the knob turned right.
 */
export function laneY(key: ControlKey, value: number, height: number, pad = 2): number {
  const { min, max } = controlSpec(key)
  const neutral = neutralOf(key)
  const half = Math.max(max - neutral, neutral - min)
  const mid = height / 2
  return mid - ((value - neutral) / half) * (mid - pad)
}

const n = (x: number) => Number(x.toFixed(3))

/** SVG path through the points, with x in beats from `startBeat`. */
export function linePath(
  points: readonly LanePoint[],
  startBeat: number,
  y: (v: number) => number,
) {
  return points.map(([b, v], i) => `${i === 0 ? 'M' : 'L'}${n(b - startBeat)} ${n(y(v))}`).join('')
}

/** The area between the curve and the horizontal line at `baseY`. */
export function areaPath(
  points: readonly LanePoint[],
  startBeat: number,
  y: (v: number) => number,
  baseY: number,
): string {
  if (points.length === 0) return ''
  const first = n(points[0]![0] - startBeat)
  const last = n(points.at(-1)![0] - startBeat)
  return `M${first} ${n(baseY)}${linePath(points, startBeat, y).replace(/^M/, 'L')}L${last} ${n(baseY)}Z`
}

function formatDb(db: number): string {
  const r = Math.round(db)
  if (r === 0) return '0 dB'
  return `${r > 0 ? '+' : '−'}${Math.abs(r)} dB`
}

function formatHz(hz: number): string {
  return hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz / 1000).toFixed(1)} kHz`
}

/** A control position as the mixer means it: dB, kill, off, or the filter's cutoff. */
export function formatValue(key: ControlKey, value: number, sampleRate: number): string {
  if (key === 'mixer.crossfader') {
    const off = Math.round(Math.abs(value - 0.5) * 200)
    return off === 0 ? 'centre' : `${value < 0.5 ? 'A' : 'B'} ${off}%`
  }
  const control = key.slice(2)
  if (control === 'fader') return value < 0.005 ? 'off' : formatDb(gainToDb(faderGain(value)))
  if (control === 'trim') return formatDb(12 * value)
  if (control === 'filter') {
    if (Math.abs(value) <= FILTER_DEAD_ZONE) return 'off'
    const { lowpassHz, highpassHz } = filterCutoffs(value, sampleRate)
    return value < 0 ? `LP ${formatHz(lowpassHz)}` : `HP ${formatHz(highpassHz)}`
  }
  return value < 0.005 ? 'kill' : formatDb(gainToDb(eqGain(value)))
}
