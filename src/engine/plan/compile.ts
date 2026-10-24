import { CONTROL_KEYS, controlSpec, type ControlKey, type ControlState } from '../mixer'
import type { ControlEvent, TransitionPlanV1 } from './types'

// Plan compiler and stateAt (D-17). The compiled form is the only thing the
// scheduler and the visuals read, so audio and controller cannot disagree.

export type SegmentCurve = 'hold' | 'linear' | 'smooth'

/** One stretch of one control, from beat `b0` (inclusive) to `b1` (exclusive). */
export interface Segment {
  b0: number
  b1: number
  v0: number
  v1: number
  curve: SegmentCurve
}

export interface CompiledPlan {
  span: { startBeat: number; endBeat: number }
  /** Per control, segments in order, covering the whole span without gaps. */
  controls: Record<ControlKey, Segment[]>
}

/** Sorts events by (atBeat, control, id), so equal plans compile identically. */
export function normalizeEvents(events: readonly ControlEvent[]): ControlEvent[] {
  return [...events].sort(
    (a, b) =>
      a.atBeat - b.atBeat ||
      (a.control < b.control ? -1 : a.control > b.control ? 1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
}

/**
 * Compiles a plan into segments. The plan must have passed `validate` without
 * errors; overlapping events on one control throw.
 */
export function compile(plan: TransitionPlanV1): CompiledPlan {
  const { startBeat, endBeat } = plan.span
  const events = normalizeEvents(plan.events)
  const controls = {} as Record<ControlKey, Segment[]>

  for (const key of CONTROL_KEYS) {
    const segments: Segment[] = []
    let value = plan.initial[key] ?? controlSpec(key).default
    let cursor = startBeat
    const hold = (until: number) => {
      if (until > cursor)
        segments.push({ b0: cursor, b1: until, v0: value, v1: value, curve: 'hold' })
    }

    for (const e of events) {
      if (e.control !== key) continue
      if (e.atBeat < cursor) throw new Error(`Event ${e.id} overlaps another event on ${key}`)
      hold(e.atBeat)
      cursor = e.atBeat
      if (e.kind === 'set') {
        value = e.to
      } else {
        const until = e.untilBeat ?? e.atBeat
        segments.push({ b0: e.atBeat, b1: until, v0: value, v1: e.to, curve: e.curve ?? 'linear' })
        value = e.to
        cursor = until
      }
    }
    hold(endBeat)
    if (segments.at(-1)?.v1 !== value) {
      // A set exactly at the span end: the value it sets holds after the span.
      segments.push({ b0: endBeat, b1: endBeat, v0: value, v1: value, curve: 'hold' })
    }
    controls[key] = segments
  }
  return { span: { startBeat, endBeat }, controls }
}

/** Value of a segment at a beat inside it. */
export function segmentValue(s: Segment, beat: number): number {
  if (s.curve === 'hold' || s.b1 <= s.b0) return s.v0
  const u = Math.min(1, Math.max(0, (beat - s.b0) / (s.b1 - s.b0)))
  const w = s.curve === 'smooth' ? (1 - Math.cos(Math.PI * u)) / 2 : u
  return s.v0 + (s.v1 - s.v0) * w
}

/** Index of the segment that holds `beat`: the last one starting at or before it (0 before the first). */
export function segmentIndexAt(segments: readonly Segment[], beat: number): number {
  let lo = 0
  let hi = segments.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segments[mid]!.b0 <= beat) lo = mid
    else hi = mid - 1
  }
  return lo
}

/** Value of one control at a transition beat. Before the span: initial value; after: final value. */
export function valueAt(segments: readonly Segment[], beat: number): number {
  const s = segments[segmentIndexAt(segments, beat)]!
  if (beat < s.b0) return s.v0
  if (beat >= s.b1) return s.v1
  return segmentValue(s, beat)
}

/** State of every control at a transition beat. A pure function of (plan, beat). */
export function stateAt(compiled: CompiledPlan, beat: number): ControlState {
  const state = {} as ControlState
  for (const key of CONTROL_KEYS) state[key] = valueAt(compiled.controls[key], beat)
  return state
}
