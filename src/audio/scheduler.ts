import { segmentValue, valueAt, type CompiledPlan } from '../engine/plan/compile'
import { CONTROL_KEYS, type ControlKey } from '../engine/mixer'
import { anchorTimeOf, type PlaybackAnchor } from '../engine/time'
import type { MixerGraph, ParamTarget } from './mixerGraph'

// Plan execution (D-18): compiled segments become sampled linear ramps in audio
// units on the context clock. Only setValueAtTime and linearRampToValueAtTime are used.

export interface ScheduleOptions {
  /** Ramp sampling step in control space, in beats (provisional). */
  stepBeats: number
  /** Length of the ramp that replaces a step (`set` event), in seconds (D-15). */
  declickSec: number
}

export const DEFAULT_SCHEDULE: ScheduleOptions = { stepBeats: 1 / 32, declickSec: 0.005 }

/**
 * Schedules the controls of the plan (every control unless `keys` says otherwise) from
 * `anchor.beat` onward. The caller has already cancelled earlier automation; the first
 * scheduled value of each parameter is `stateAt(anchor.beat)`, at `anchor.ctxTime`.
 */
export function schedulePlan(
  compiled: CompiledPlan,
  mixer: MixerGraph,
  anchor: PlaybackAnchor,
  options: ScheduleOptions = DEFAULT_SCHEDULE,
  keys: readonly ControlKey[] = CONTROL_KEYS,
): void {
  for (const key of keys) {
    for (const target of mixer.targetsOf(key)) {
      scheduleControl(compiled.controls[key], target, anchor, options)
    }
  }
}

function scheduleControl(
  segments: CompiledPlan['controls'][keyof CompiledPlan['controls']],
  { param, map }: ParamTarget,
  anchor: PlaybackAnchor,
  { stepBeats, declickSec }: ScheduleOptions,
): void {
  const from = anchor.beat
  const time = (beat: number) => anchorTimeOf(anchor, beat)
  let value = valueAt(segments, from)
  let lastTime = anchor.ctxTime
  param.setValueAtTime(map(value), lastTime)

  for (const s of segments) {
    if (s.b1 <= from && !(s.b0 === s.b1 && s.b0 >= from)) continue
    const start = Math.max(s.b0, from)

    // A jump at the segment start (a `set` event) becomes a short ramp.
    if (s.b0 > from && s.v0 !== value) {
      const t = Math.max(time(s.b0), lastTime)
      param.setValueAtTime(map(value), t)
      param.linearRampToValueAtTime(map(s.v0), t + declickSec)
      lastTime = t + declickSec
      value = s.v0
    }
    if (s.curve === 'hold' || s.b1 <= s.b0) {
      value = s.v1
      continue
    }

    // Sample the ramp on a grid aligned to the segment start, so a restart in the
    // middle of a ramp schedules the same points as a play-through from its start.
    const t0 = Math.max(time(start), lastTime)
    param.setValueAtTime(map(segmentValue(s, start)), t0)
    const firstStep = Math.floor((start - s.b0) / stepBeats) + 1
    for (let k = firstStep; ; k++) {
      const beat = Math.min(s.b0 + k * stepBeats, s.b1)
      param.linearRampToValueAtTime(map(segmentValue(s, beat)), time(beat))
      if (beat >= s.b1) break
    }
    lastTime = time(s.b1)
    value = s.v1
  }
}
