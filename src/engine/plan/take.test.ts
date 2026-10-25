import { describe, expect, it } from 'vitest'
import { grid, random } from '../test-helpers'
import { compile, valueAt } from './compile'
import { longBlendPlan } from './longBlend'
import { applyTake, applyTakes, simplifyTake, TakeHistory, type Take, type TakePoint } from './take'
import type { ControlEvent, TransitionPlanV1 } from './types'
import { validate } from './validate'

const decks = {
  A: { trackFingerprint: 'a', grid: grid(124, 0.1) },
  B: { trackFingerprint: 'b', grid: grid(122, 0.4) },
}

function plan(events: ControlEvent[]): TransitionPlanV1 {
  return {
    schemaVersion: 1,
    id: 'test',
    strategy: { id: 'test', version: 1, params: {} },
    decks,
    points: { exitBarA: 65, entryBarB: 1 },
    tempo: { master: 'A' },
    span: { startBeat: -16, endBeat: 64 },
    initial: {},
    events,
    annotations: [],
  }
}

const take = (control: Take['control'], points: [number, number][], id = 't1'): Take => ({
  id,
  control,
  points: points.map(([beat, value]) => ({ beat, value })),
})

const at = (p: TransitionPlanV1, control: Take['control'], beat: number) =>
  valueAt(compile(p).controls[control], beat)

const errorsOf = (p: TransitionPlanV1) => validate(p).errors.map((e) => e.message)

describe('simplifyTake', () => {
  it('bins to the step and keeps the last value in a bin', () => {
    const raw: TakePoint[] = [
      { beat: 0, value: 0.5 },
      { beat: 0.01, value: 0.4 },
      { beat: 0.5, value: 0.2 },
    ]
    expect(simplifyTake(raw)).toEqual([
      { beat: 0, value: 0.4 },
      { beat: 0.5, value: 0.2 },
    ])
  })

  it('drops points on a straight line and keeps corners', () => {
    const raw: TakePoint[] = []
    for (let i = 0; i <= 32; i++) raw.push({ beat: i / 8, value: i <= 16 ? i / 32 : 0.5 })
    expect(simplifyTake(raw)).toEqual([
      { beat: 0, value: 0 },
      { beat: 2, value: 0.5 },
      { beat: 4, value: 0.5 },
    ])
  })

  it('stays within the tolerance of a random curve', () => {
    const rnd = random(7)
    const raw: TakePoint[] = []
    let v = 0.5
    for (let i = 0; i < 400; i++) {
      v = Math.min(1, Math.max(0, v + (rnd() - 0.5) * 0.05))
      raw.push({ beat: i / 16, value: v })
    }
    const simple = simplifyTake(raw)
    expect(simple.length).toBeLessThan(raw.length)
    for (let k = 1; k < simple.length; k++)
      expect(simple[k]!.beat).toBeGreaterThan(simple[k - 1]!.beat)
    const p = applyTake(plan([]), { id: 't', control: 'A.eqLow', points: simple })
    for (const r of raw.slice(1))
      expect(Math.abs(at(p, 'A.eqLow', r.beat) - r.value)).toBeLessThan(0.02)
  })
})

describe('applyTake', () => {
  it('replaces the plan on the control between grab and release, then holds', () => {
    const base = plan([
      { id: 'kill', control: 'A.eqLow', kind: 'set', atBeat: 8, to: 0 },
      { id: 'back', control: 'A.eqLow', kind: 'set', atBeat: 40, to: 0.5 },
      { id: 'fade', control: 'A.fader', kind: 'ramp', atBeat: 0, untilBeat: 32, to: 0 },
    ])
    const p = applyTake(
      base,
      take('A.eqLow', [
        [4, 0.5],
        [6, 0.2],
        [12, 0.3],
      ]),
    )
    expect(errorsOf(p)).toEqual([])
    expect(at(p, 'A.eqLow', 2)).toBe(0.5) // before: the plan
    expect(at(p, 'A.eqLow', 6)).toBeCloseTo(0.2, 12) // the take
    expect(at(p, 'A.eqLow', 10)).toBeCloseTo(0.2 + (0.1 * 4) / 6, 12) // the kill at 8 is replaced
    expect(at(p, 'A.eqLow', 20)).toBeCloseTo(0.3, 12) // held after the release
    expect(at(p, 'A.eqLow', 41)).toBe(0.5) // the plan's next event
    expect(at(p, 'A.fader', 16)).toBeCloseTo(0.5, 12) // other controls untouched
    expect(p.events.filter((e) => e.source === 'user').map((e) => e.id)).toEqual(['t1.1', 't1.2'])
  })

  it('starts from the plan value at the grab, so the first point never jumps', () => {
    const base = plan([
      { id: 'r', control: 'B.fader', kind: 'ramp', atBeat: 0, untilBeat: 16, to: 1 },
    ])
    const p = applyTake(
      base,
      take('B.fader', [
        [8, 0.9],
        [12, 0.25],
      ]),
    )
    expect(at(p, 'B.fader', 8)).toBeCloseTo(0.5, 12)
    expect(at(p, 'B.fader', 12)).toBeCloseTo(0.25, 12)
  })

  it('cuts a ramp in progress at the grab, following a smooth curve', () => {
    const base = plan([
      {
        id: 'sweep',
        control: 'A.filter',
        kind: 'ramp',
        atBeat: 0,
        untilBeat: 32,
        to: 0.8,
        curve: 'smooth',
        annotationId: undefined,
      },
    ])
    const p = applyTake(
      base,
      take('A.filter', [
        [10, 0],
        [14, -0.5],
      ]),
    )
    expect(errorsOf(p)).toEqual([])
    for (const b of [0, 1.3, 5, 9.9]) {
      expect(Math.abs(at(p, 'A.filter', b) - at(base, 'A.filter', b))).toBeLessThan(0.005)
    }
    expect(at(p, 'A.filter', 14)).toBeCloseTo(-0.5, 12)
    expect(at(p, 'A.filter', 30)).toBeCloseTo(-0.5, 12)
  })

  it('ignores a take with fewer than two points in the span', () => {
    const base = plan([])
    expect(applyTake(base, take('A.trim', [[3, 0.4]]))).toBe(base)
    expect(
      applyTake(
        base,
        take('A.trim', [
          [70, 0.4],
          [80, 0.1],
        ]),
      ),
    ).toBe(base)
  })

  it('keeps every take of the long blend valid and stacks takes', () => {
    const base = longBlendPlan({ A: decks.A, B: decks.B }, { exitBarA: 65, entryBarB: 1 })
    const rnd = random(3)
    const takes: Take[] = []
    const controls = [
      'A.eqLow',
      'B.eqLow',
      'A.filter',
      'B.fader',
      'A.eqMid',
      'mixer.crossfader',
    ] as const
    for (let k = 0; k < 30; k++) {
      const start = base.span.startBeat + rnd() * (base.span.endBeat - base.span.startBeat - 8)
      const points: [number, number][] = []
      for (let i = 0; i < 20; i++) points.push([start + i * 0.25 + rnd() * 0.1, rnd()])
      takes.push({
        id: `t${k}`,
        control: controls[k % controls.length]!,
        points: simplifyTake(points.map(([beat, value]) => ({ beat, value }))),
      })
      expect(errorsOf(applyTakes(base, takes))).toEqual([])
    }
  })
})

describe('TakeHistory', () => {
  const t1 = take(
    'A.trim',
    [
      [0, 0],
      [1, 0.5],
    ],
    't1',
  )
  const t2 = take(
    'A.trim',
    [
      [4, 0],
      [5, -0.5],
    ],
    't2',
  )

  it('undoes and redoes takes', () => {
    const h = new TakeHistory()
    h.add(t1)
    h.add(t2)
    expect(h.takes).toEqual([t1, t2])
    h.undo()
    expect(h.takes).toEqual([t1])
    h.redo()
    expect(h.takes).toEqual([t1, t2])
    expect(h.canRedo).toBe(false)
  })

  it('makes reset undoable', () => {
    const h = new TakeHistory()
    h.add(t1)
    h.reset()
    expect(h.takes).toEqual([])
    h.undo()
    expect(h.takes).toEqual([t1])
  })

  it('drops the redo branch on a new take', () => {
    const h = new TakeHistory()
    h.add(t1)
    h.undo()
    h.add(t2)
    expect(h.takes).toEqual([t2])
    expect(h.canRedo).toBe(false)
  })
})
