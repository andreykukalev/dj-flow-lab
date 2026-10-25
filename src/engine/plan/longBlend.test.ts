import { describe, expect, it } from 'vitest'
import { grid } from '../test-helpers'
import { compile, valueAt } from './compile'
import { handoffBeat, LEGACY_AREA, longBlendPlan } from './longBlend'
import { validate } from './validate'

// #75: the long blend is generated for the transition area, so every move happens
// inside the area that is highlighted.

const decks = {
  A: { trackFingerprint: 'a', grid: grid(124, 0.1) },
  B: { trackFingerprint: 'b', grid: grid(122, 0.4) },
}
const points = { exitBarA: 65, entryBarB: 17 }
const area = (beforeBeats: number, afterBeats: number) => ({
  beforeBeats,
  afterBeats,
  preRollBeats: 32,
  tailBeats: 32,
})

describe('longBlendPlan', () => {
  it('keeps the original plan for the legacy area', () => {
    const plan = longBlendPlan(decks, { exitBarA: 65, entryBarB: 1 })
    const at = Object.fromEntries(plan.events.map((e) => [e.id, [e.atBeat, e.untilBeat]]))
    expect(at).toEqual({
      'b-in': [0, 32],
      'b-mid': [0, 64],
      'b-high': [0, 64],
      'a-hp': [32, 64],
      'a-low': [64, undefined],
      'b-low': [64, undefined],
      'a-mid': [64, 96],
      'a-high': [64, 96],
      'a-out': [96, 128],
    })
    expect(plan.span).toEqual({ startBeat: -32, endBeat: 160 })
    expect(plan.strategy.params).toMatchObject({ overlapBars: 32, handoffBar: 17 })
    expect(handoffBeat(LEGACY_AREA)).toBe(64)
  })

  it('blends across the area, with the bass swap on the blend start', () => {
    const plan = longBlendPlan(decks, points, area(64, 64))
    const c = compile(plan)
    expect(plan.span).toEqual({ startBeat: -96, endBeat: 96 })
    expect(valueAt(c.controls['B.fader'], -64)).toBe(0)
    expect(valueAt(c.controls['B.fader'], -32)).toBe(1)
    expect(valueAt(c.controls['A.eqLow'], -0.01)).toBe(0.5)
    expect(valueAt(c.controls['A.eqLow'], 0)).toBe(0)
    expect(valueAt(c.controls['B.eqLow'], 0)).toBe(0.5)
    expect(valueAt(c.controls['A.fader'], 32)).toBe(1)
    expect(valueAt(c.controls['A.fader'], 64)).toBe(0)
    expect(validate(plan).errors).toEqual([])
  })

  it('puts nothing outside the area', () => {
    for (const [before, after] of [
      [64, 64],
      [16, 96],
      [0, 64],
      [36, 0],
      [0, 4],
    ] as const) {
      const plan = longBlendPlan(decks, points, area(before, after))
      for (const e of plan.events) {
        expect(e.atBeat).toBeGreaterThanOrEqual(-before)
        expect(e.untilBeat ?? e.atBeat).toBeLessThanOrEqual(after)
      }
      expect(validate(plan).errors).toEqual([])
    }
  })

  it('moves the handoff to the middle when one side has less than a bar', () => {
    expect(handoffBeat(area(16, 96))).toBe(0)
    expect(handoffBeat(area(0, 64))).toBe(32)
    expect(handoffBeat(area(2, 64))).toBe(32)
    expect(handoffBeat(area(36, 0))).toBe(-16)
    expect(handoffBeat(area(0, 4))).toBe(2)
  })
})
