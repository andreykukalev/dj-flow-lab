import { segmentIndexAt, type Segment } from '../../engine/plan/compile'
import type { ControlKey } from '../../engine/mixer'

// What a control is about to do: drives the dashed "about to move" ring, the target
// tick and the caption under a knob or fader (mockup iPad 4).

export interface UpcomingChange {
  /** Transition beat at which the control starts to move. */
  atBeat: number
  /** Position it moves from and to. */
  from: number
  to: number
  kind: 'step' | 'ramp'
}

/** Beats ahead in which a coming change is shown: two bars. */
export const UPCOMING_WITHIN_BEATS = 8

/**
 * The next change of a control after `beat`, if it starts within `withinBeats`. A
 * change already under way is not "upcoming": the control is visibly moving.
 */
export function upcomingChange(
  segments: readonly Segment[],
  beat: number,
  withinBeats = UPCOMING_WITHIN_BEATS,
): UpcomingChange | undefined {
  const index = segmentIndexAt(segments, beat)
  const current = segments[index]
  if (!current) return undefined
  // Where the control is headed in the segment it is in now (its end value).
  let value = beat < current.b0 ? current.v0 : current.v1
  for (let i = index + 1; i < segments.length; i++) {
    const s = segments[i]!
    if (s.b0 - beat > withinBeats) return undefined
    if (s.curve !== 'hold' && s.v1 !== s.v0) {
      return { atBeat: s.b0, from: s.v0, to: s.v1, kind: 'ramp' }
    }
    if (s.v0 !== value) return { atBeat: s.b0, from: value, to: s.v0, kind: 'step' }
    value = s.v1
  }
  return undefined
}

/** A short caption for a coming change, such as "kill at 113". */
export function upcomingCaption(key: ControlKey, change: UpcomingChange, bar: number): string {
  const control = key.split('.')[1]
  const direction = change.to > change.from ? 'up' : 'down'
  let verb: string
  if (control?.startsWith('eq')) {
    verb = change.to === 0 ? 'kill' : change.to === 0.5 ? 'full' : direction
  } else if (control === 'fader') verb = change.to === 0 ? 'out' : direction
  else if (control === 'filter') verb = change.to === 0 ? 'off' : 'sweeps'
  else verb = direction
  return `${verb} at ${bar}`
}
