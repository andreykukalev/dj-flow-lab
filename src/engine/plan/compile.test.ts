import { describe, expect, it } from 'vitest'
import { CONTROL_KEYS, defaultState } from '../mixer'
import { grid, random } from '../test-helpers'
import { compile, normalizeEvents, stateAt, valueAt } from './compile'
import { longBlendPlan } from './longBlend'
import type { ControlEvent, TransitionPlanV1 } from './types'

const decks = {
  A: { trackFingerprint: 'a', grid: grid(124, 0.1) },
  B: { trackFingerprint: 'b', grid: grid(122, 0.4) },
}

function plan(events: ControlEvent[], initial: TransitionPlanV1['initial'] = {}): TransitionPlanV1 {
  return {
    schemaVersion: 1,
    id: 'test',
    strategy: { id: 'test', version: 1, params: {} },
    decks,
    points: { exitBarA: 65, entryBarB: 1 },
    tempo: { master: 'A' },
    span: { startBeat: -16, endBeat: 64 },
    initial,
    events,
    annotations: [],
  }
}

const ramp = (
  id: string,
  control: ControlEvent['control'],
  atBeat: number,
  untilBeat: number,
  to: number,
  curve?: 'linear' | 'smooth',
): ControlEvent => ({ id, control, kind: 'ramp', atBeat, untilBeat, to, ...(curve && { curve }) })

const set = (
  id: string,
  control: ControlEvent['control'],
  atBeat: number,
  to: number,
): ControlEvent => ({
  id,
  control,
  kind: 'set',
  atBeat,
  to,
})

describe('compile', () => {
  it('holds defaults when there are no events', () => {
    const c = compile(plan([]))
    expect(stateAt(c, 0)).toEqual(defaultState())
    expect(c.controls['A.fader']).toEqual([{ b0: -16, b1: 64, v0: 1, v1: 1, curve: 'hold' }])
  })

  it('starts from the initial state', () => {
    const c = compile(plan([], { 'B.eqLow': 0, 'A.filter': -0.5 }))
    expect(stateAt(c, -16)['B.eqLow']).toBe(0)
    expect(stateAt(c, 10)['A.filter']).toBe(-0.5)
    expect(stateAt(c, 10)['A.eqLow']).toBe(0.5)
  })

  it('covers the span with contiguous segments for every control', () => {
    const p = longBlendPlan(decks, { exitBarA: 65, entryBarB: 1 })
    const c = compile(p)
    for (const key of CONTROL_KEYS) {
      const segs = c.controls[key]
      expect(segs[0]!.b0).toBe(p.span.startBeat)
      expect(segs.at(-1)!.b1).toBe(p.span.endBeat)
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.b0).toBe(segs[i - 1]!.b1)
    }
  })

  it('throws on overlapping events (validate first)', () => {
    expect(() =>
      compile(plan([ramp('r1', 'A.fader', 0, 8, 0), ramp('r2', 'A.fader', 4, 12, 1)])),
    ).toThrow(/overlaps/)
  })
})

describe('stateAt', () => {
  const events = [
    ramp('down', 'A.fader', 0, 16, 0),
    set('back', 'A.fader', 16, 0.5),
    ramp('smooth', 'B.fader', 8, 24, 1, 'smooth'),
    set('kill', 'A.eqLow', 32, 0),
    ramp('up', 'A.eqLow', 40, 48, 1),
    set('end', 'A.trim', 64, 0.5),
  ]
  const c = compile(plan(events))
  const v = (key: ControlEvent['control'], beat: number) => stateAt(c, beat)[key]

  it('holds the initial value before the span and before the first event', () => {
    expect(v('A.fader', -100)).toBe(1)
    expect(v('A.fader', -16)).toBe(1)
    expect(v('A.fader', -0.001)).toBe(1)
  })

  it('interpolates ramps linearly from the value at their start', () => {
    expect(v('A.fader', 0)).toBe(1)
    expect(v('A.fader', 4)).toBe(0.75)
    expect(v('A.fader', 8)).toBe(0.5)
    expect(v('A.fader', 15.999)).toBeCloseTo(0, 3)
  })

  it('applies a set at its own beat, including at a ramp’s end', () => {
    expect(v('A.fader', 16)).toBe(0.5)
    expect(v('A.eqLow', 31.999)).toBe(0.5)
    expect(v('A.eqLow', 32)).toBe(0)
  })

  it('ramps from the value a set left', () => {
    expect(v('A.eqLow', 40)).toBe(0)
    expect(v('A.eqLow', 44)).toBe(0.5)
    expect(v('A.eqLow', 48)).toBe(1)
    expect(v('A.eqLow', 60)).toBe(1)
  })

  it('eases smooth ramps with a cosine', () => {
    expect(v('B.fader', 8)).toBe(0)
    expect(v('B.fader', 12)).toBeCloseTo((1 - Math.cos(Math.PI / 4)) / 2, 12)
    expect(v('B.fader', 16)).toBeCloseTo(0.5, 12)
    expect(v('B.fader', 24)).toBe(1)
  })

  it('holds the final value after the span, including a set at the very end', () => {
    expect(v('A.fader', 64)).toBe(0.5)
    expect(v('A.fader', 1000)).toBe(0.5)
    expect(v('A.trim', 63.999)).toBe(0)
    expect(v('A.trim', 64)).toBe(0.5)
    expect(v('A.trim', 70)).toBe(0.5)
  })

  it('depends only on the beat, never on earlier calls', () => {
    const rnd = random(6)
    const beats = Array.from({ length: 500 }, () => -30 + rnd() * 110)
    const fresh = beats.map((b) => stateAt(compile(plan(events)), b))
    const reused = beats.map((b) => stateAt(c, b))
    const reversed = [...beats]
      .reverse()
      .map((b) => stateAt(c, b))
      .reverse()
    expect(reused).toEqual(fresh)
    expect(reversed).toEqual(fresh)
  })

  it('matches a brute-force evaluation of the events', () => {
    const rnd = random(7)
    for (const key of CONTROL_KEYS) {
      for (let i = 0; i < 50; i++) {
        const beat = -20 + rnd() * 100
        expect(valueAt(c.controls[key], beat)).toBe(stateAt(c, beat)[key])
      }
    }
  })
})

describe('normalization', () => {
  it('compiles permuted event order identically', () => {
    const p = longBlendPlan(decks, { exitBarA: 65, entryBarB: 1 })
    const expected = compile(p)
    const rnd = random(8)
    for (let i = 0; i < 20; i++) {
      const shuffled = [...p.events]
        .map((e) => ({ e, k: rnd() }))
        .sort((a, b) => a.k - b.k)
        .map((x) => x.e)
      expect(compile({ ...p, events: shuffled })).toEqual(expected)
    }
  })

  it('sorts by beat, then control, then id', () => {
    const sorted = normalizeEvents([
      set('z', 'B.fader', 4, 1),
      set('b', 'A.fader', 4, 1),
      set('a', 'A.fader', 4, 0),
      set('y', 'B.fader', 0, 1),
    ])
    expect(sorted.map((e) => e.id)).toEqual(['y', 'a', 'b', 'z'])
  })
})

describe('long-blend proof-of-concept plan', () => {
  const c = compile(longBlendPlan(decks, { exitBarA: 65, entryBarB: 1 }))
  const s = (beat: number) => stateAt(c, beat)

  it('has A alone during the pre-roll', () => {
    expect(s(-32)['A.fader']).toBe(1)
    expect(s(-32)['B.fader']).toBe(0)
  })

  it('brings B in with its bass cut', () => {
    expect(s(16)['B.fader']).toBe(0.5)
    expect(s(32)['B.fader']).toBe(1)
    expect(s(63.75)['B.eqLow']).toBe(0)
  })

  it('opens the high-pass on A over the 8 bars before the handoff', () => {
    expect(s(32)['A.filter']).toBe(0)
    expect(s(48)['A.filter']).toBeCloseTo(0.175, 12)
    expect(s(64)['A.filter']).toBe(0.35)
  })

  it('swaps the bass at the handoff downbeat', () => {
    expect(s(63.999)['A.eqLow']).toBe(0.5)
    expect(s(64)['A.eqLow']).toBe(0)
    expect(s(64)['B.eqLow']).toBe(0.5)
  })

  it('fades A out and leaves B alone in the tail', () => {
    expect(s(112)['A.fader']).toBe(0.5)
    expect(s(128)['A.fader']).toBe(0)
    expect(s(160)).toMatchObject({ 'A.fader': 0, 'B.fader': 1, 'B.eqLow': 0.5 })
  })
})
