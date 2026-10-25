import { controlSpec, type ControlKey } from '../mixer'
import { compile, valueAt, type Segment } from './compile'
import type { ControlEvent, TransitionPlanV1 } from './types'

// Takes (#68): the user grabs a control while the plan plays, and the movement is
// recorded as plan events. A take replaces the plan on that control from the grab to
// the release; afterwards the control holds the user's last value until the plan's
// next event on it. The result is an ordinary plan that passes `validate`, so it can
// be replayed, compared and explained like any other.

export interface TakePoint {
  /** Transition beat whose audio the move changed. */
  beat: number
  value: number
}

export interface Take {
  id: string
  control: ControlKey
  /** Simplified points, in beat order, at least two, strictly increasing beats. */
  points: TakePoint[]
}

export interface SimplifyOptions {
  /** Recorded points are binned to this grid in beats; the last value in a bin wins. */
  stepBeats: number
  /** Largest allowed difference from the recorded curve, in control units. */
  tolerance: number
}

export const DEFAULT_SIMPLIFY: SimplifyOptions = { stepBeats: 1 / 16, tolerance: 0.01 }

/** Smooth ramps cut by a take are replaced by linear pieces this long, in beats. */
const SMOOTH_PIECE_BEATS = 1 / 8

/**
 * Turns the raw points of a held control into as few points as keep the curve within
 * `tolerance`: binned to `stepBeats`, then Douglas–Peucker on the value at each beat.
 */
export function simplifyTake(
  raw: readonly TakePoint[],
  { stepBeats, tolerance }: SimplifyOptions = DEFAULT_SIMPLIFY,
): TakePoint[] {
  const binned: TakePoint[] = []
  for (const p of raw) {
    const beat = Math.round(p.beat / stepBeats) * stepBeats
    const last = binned.at(-1)
    if (last && beat <= last.beat) last.value = p.value
    else binned.push({ beat, value: p.value })
  }
  if (binned.length <= 2) return binned

  const keep = new Array<boolean>(binned.length).fill(false)
  keep[0] = true
  keep[binned.length - 1] = true
  const stack: [number, number][] = [[0, binned.length - 1]]
  while (stack.length > 0) {
    const [i, j] = stack.pop()!
    const a = binned[i]!
    const b = binned[j]!
    let worst = -1
    let worstError = tolerance
    for (let k = i + 1; k < j; k++) {
      const p = binned[k]!
      const line = a.value + ((b.value - a.value) * (p.beat - a.beat)) / (b.beat - a.beat)
      const error = Math.abs(p.value - line)
      if (error > worstError) {
        worst = k
        worstError = error
      }
    }
    if (worst >= 0) {
      keep[worst] = true
      stack.push([i, worst], [worst, j])
    }
  }
  return binned.filter((_, k) => keep[k])
}

/** The take's points inside the plan span, clamped to the control's range. */
function pointsInSpan(plan: TransitionPlanV1, take: Take): TakePoint[] {
  const { startBeat, endBeat } = plan.span
  const { min, max } = controlSpec(take.control)
  return take.points
    .filter((p) => p.beat >= startBeat && p.beat <= endBeat)
    .map((p) => ({ beat: p.beat, value: Math.min(max, Math.max(min, p.value)) }))
}

/** Linear pieces that follow a segment from its start to `until`. */
function piecesOf(
  segment: Segment,
  until: number,
  base: ControlEvent,
  segments: readonly Segment[],
): ControlEvent[] {
  if (segment.curve !== 'smooth') {
    return [{ ...base, untilBeat: until, to: valueAt(segments, until), curve: 'linear' }]
  }
  const pieces: ControlEvent[] = []
  for (let b0 = segment.b0, k = 0; b0 < until; k++) {
    const b1 = Math.min(until, b0 + SMOOTH_PIECE_BEATS)
    pieces.push({
      ...base,
      id: k === 0 ? base.id : `${base.id}~${k}`,
      atBeat: b0,
      untilBeat: b1,
      to: valueAt(segments, b1),
      curve: 'linear',
      annotationId: k === 0 ? base.annotationId : undefined,
    })
    b0 = b1
  }
  return pieces
}

/** Applies one take to a plan. A take with fewer than two points inside the span changes nothing. */
export function applyTake(plan: TransitionPlanV1, take: Take): TransitionPlanV1 {
  const points = pointsInSpan(plan, take)
  if (points.length < 2) return plan
  const start = points[0]!.beat
  const end = points.at(-1)!.beat
  const segments = compile(plan).controls[take.control]

  const events: ControlEvent[] = []
  for (const e of plan.events) {
    if (e.control !== take.control) {
      events.push(e)
      continue
    }
    const until = e.kind === 'ramp' ? e.untilBeat! : e.atBeat
    if (e.kind === 'set' ? e.atBeat < start : until <= start) {
      events.push(e) // before the grab
    } else if (e.atBeat > end) {
      events.push(e) // after the release: the plan takes over again here
    } else if (e.kind === 'ramp' && e.atBeat < start) {
      // A ramp in progress at the grab is cut there.
      const segment = segments.find((s) => s.b0 === e.atBeat && s.b1 === until)!
      events.push(...piecesOf(segment, start, e, segments))
    }
    // Anything else falls inside the take and is replaced by it.
  }

  // The take starts from the plan's value at the grab, so there is no jump.
  for (let k = 1; k < points.length; k++) {
    events.push({
      id: `${take.id}.${k}`,
      control: take.control,
      kind: 'ramp',
      atBeat: points[k - 1]!.beat,
      untilBeat: points[k]!.beat,
      to: points[k]!.value,
      curve: 'linear',
      source: 'user',
    })
  }
  return { ...plan, events }
}

/** Applies takes in order. */
export function applyTakes(plan: TransitionPlanV1, takes: readonly Take[]): TransitionPlanV1 {
  return takes.reduce(applyTake, plan)
}

/**
 * Undo, redo and reset for takes (brief v0.4 §5b: nothing is irreversible). Each state
 * is the list of takes applied to the strategy's plan; reset is a new, empty state, so
 * it can be undone like anything else.
 */
export class TakeHistory {
  private states: Take[][] = [[]]
  private index = 0

  get takes(): readonly Take[] {
    return this.states[this.index]!
  }

  get canUndo(): boolean {
    return this.index > 0
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1
  }

  add(take: Take): void {
    this.push([...this.takes, take])
  }

  reset(): void {
    if (this.takes.length > 0) this.push([])
  }

  undo(): void {
    if (this.canUndo) this.index--
  }

  redo(): void {
    if (this.canRedo) this.index++
  }

  private push(state: Take[]): void {
    this.states = [...this.states.slice(0, this.index + 1), state]
    this.index = this.states.length - 1
  }
}
