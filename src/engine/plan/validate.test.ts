import { describe, expect, it } from 'vitest'
import { nudgeBpm } from '../grid'
import { grid } from '../test-helpers'
import { transitionBeatToDeckSec } from '../time'
import { longBlendPlan } from './longBlend'
import type { ControlEvent, TransitionPlanV1 } from './types'
import { validate, type ErrorCode, type ValidationContext, type WarningCode } from './validate'

const decks = {
  A: { trackFingerprint: 'a', grid: grid(124, 0.1) },
  B: { trackFingerprint: 'b', grid: grid(123, 0.4) }, // +0.14 semitones: no pitch warning
}
const points = { exitBarA: 65, entryBarB: 1 }
const base = (): TransitionPlanV1 => longBlendPlan(decks, points)

function withEvents(...events: ControlEvent[]): TransitionPlanV1 {
  return { ...base(), events: [...base().events, ...events] }
}

const errorCodes = (p: TransitionPlanV1, ctx?: ValidationContext): ErrorCode[] =>
  validate(p, ctx).errors.map((e) => e.code)
const warningCodes = (p: TransitionPlanV1, ctx?: ValidationContext): WarningCode[] =>
  validate(p, ctx).warnings.map((e) => e.code)

describe('validate: valid plans', () => {
  it('accepts the long-blend plan with no errors or warnings', () => {
    const durationSec = { A: 600, B: 600 }
    expect(
      validate(base(), { durationSec, currentGrids: { A: decks.A.grid, B: decks.B.grid } }),
    ).toEqual({
      errors: [],
      warnings: [],
    })
  })

  it('allows a set exactly at a ramp’s end', () => {
    expect(
      errorCodes(withEvents({ id: 'x', control: 'B.fader', kind: 'set', atBeat: 32, to: 0.8 })),
    ).toEqual([])
  })

  it('allows a ramp starting where another ends', () => {
    expect(
      errorCodes(
        withEvents({
          id: 'x',
          control: 'B.fader',
          kind: 'ramp',
          atBeat: 32,
          untilBeat: 40,
          to: 0.9,
        }),
      ),
    ).toEqual([])
  })
})

describe('validate: errors', () => {
  it('refuses an unsupported schema version', () => {
    const p = { ...base(), schemaVersion: 2 } as unknown as TransitionPlanV1
    const { errors } = validate(p)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({
      code: 'schema-version',
      message: expect.stringContaining('2'),
    })
  })

  it('refuses an unknown control in events and in the initial state', () => {
    const p = withEvents({ id: 'x', control: 'C.fader' as never, kind: 'set', atBeat: 0, to: 1 })
    expect(validate(p).errors[0]).toMatchObject({ code: 'unknown-control', eventId: 'x' })
    const q = { ...base(), initial: { 'A.volume': 1 } as TransitionPlanV1['initial'] }
    expect(errorCodes(q)).toEqual(['unknown-control'])
  })

  it('refuses non-finite numbers', () => {
    expect(
      errorCodes(
        withEvents({ id: 'x', control: 'A.trim', kind: 'set', atBeat: Number.NaN, to: 0 }),
      ),
    ).toEqual(['non-finite'])
    expect(
      errorCodes(withEvents({ id: 'x', control: 'A.trim', kind: 'set', atBeat: 0, to: Infinity })),
    ).toEqual(['non-finite'])
    expect(errorCodes({ ...base(), initial: { 'A.trim': Number.NaN } })).toEqual(['non-finite'])
    expect(errorCodes({ ...base(), span: { startBeat: 0, endBeat: Infinity } })).toContain(
      'non-finite',
    )
  })

  it('refuses targets outside the control’s range', () => {
    const p = withEvents({ id: 'x', control: 'A.eqMid', kind: 'set', atBeat: 140, to: 1.2 })
    expect(validate(p).errors[0]).toMatchObject({
      code: 'out-of-range',
      eventId: 'x',
      message: 'Event "x" on A.eqMid: target 1.2 is outside 0…1',
    })
    expect(errorCodes({ ...base(), initial: { 'A.filter': -1.5 } })).toEqual(['out-of-range'])
  })

  it('refuses ramps without an end or ending before they start', () => {
    expect(
      errorCodes(withEvents({ id: 'x', control: 'A.trim', kind: 'ramp', atBeat: 0, to: 1 })),
    ).toEqual(['ramp-end'])
    const p = withEvents({
      id: 'x',
      control: 'A.trim',
      kind: 'ramp',
      atBeat: 8,
      untilBeat: 8,
      to: 1,
    })
    expect(validate(p).errors[0]!.message).toBe(
      'Event "x" on A.trim: ramp ends at beat 8, not after its start 8',
    )
  })

  it('refuses events outside the span', () => {
    expect(
      errorCodes(withEvents({ id: 'x', control: 'A.trim', kind: 'set', atBeat: -40, to: 0 })),
    ).toEqual(['outside-span'])
    expect(
      errorCodes(
        withEvents({
          id: 'x',
          control: 'A.trim',
          kind: 'ramp',
          atBeat: 150,
          untilBeat: 170,
          to: 0,
        }),
      ),
    ).toEqual(['outside-span'])
  })

  it('refuses overlapping events on one control', () => {
    expect(
      errorCodes(
        withEvents({
          id: 'x',
          control: 'B.fader',
          kind: 'ramp',
          atBeat: 16,
          untilBeat: 40,
          to: 0.5,
        }),
      ),
    ).toEqual(['overlap'])
    // A set inside a ramp, or at its start.
    expect(
      errorCodes(withEvents({ id: 'x', control: 'B.fader', kind: 'set', atBeat: 8, to: 0.5 })),
    ).toEqual(['overlap'])
    expect(
      errorCodes(withEvents({ id: 'x', control: 'B.fader', kind: 'set', atBeat: 0, to: 0.5 })),
    ).toEqual(['overlap'])
  })

  it('refuses two sets on one control at the same beat', () => {
    const p = withEvents({ id: 'x', control: 'A.eqLow', kind: 'set', atBeat: 64, to: 0.1 })
    expect(validate(p).errors[0]).toMatchObject({
      code: 'duplicate-set',
      message: 'Events "a-low" and "x" both set A.eqLow at beat 64',
    })
  })

  it('refuses duplicate event ids', () => {
    expect(
      errorCodes(withEvents({ id: 'a-low', control: 'A.trim', kind: 'set', atBeat: 4, to: 0 })),
    ).toEqual(['duplicate-id'])
  })

  it('refuses exit and entry points that are not bars inside the tracks', () => {
    expect(errorCodes({ ...base(), points: { exitBarA: 0, entryBarB: 1 } })).toEqual([
      'point-outside-track',
    ])
    expect(errorCodes({ ...base(), points: { exitBarA: 65, entryBarB: 1.5 } })).toEqual([
      'point-outside-track',
    ])
    // #75: a blend start on another beat of the bar is fine; a beat outside the bar is not.
    expect(errorCodes({ ...base(), points: { exitBarA: 65, exitBeatA: 3, entryBarB: 1 } })).toEqual(
      [],
    )
    for (const exitBeatA of [0, 5, 2.5])
      expect(errorCodes({ ...base(), points: { exitBarA: 65, exitBeatA, entryBarB: 1 } })).toEqual([
        'point-outside-track',
      ])
    const exitSecA = transitionBeatToDeckSec(
      { gridA: decks.A.grid, gridB: decks.B.grid, ...points },
      'A',
      0,
    )
    expect(errorCodes(base(), { durationSec: { A: exitSecA - 1, B: 600 } })).toEqual([
      'point-outside-track',
    ])
    expect(errorCodes(base(), { durationSec: { A: 600, B: 0.2 } })).toEqual(['point-outside-track'])
  })

  it('refuses a plan that outlasts track B', () => {
    const timing = { gridA: decks.A.grid, gridB: decks.B.grid, ...points }
    const endB = transitionBeatToDeckSec(timing, 'B', 160)
    expect(errorCodes(base(), { durationSec: { A: 600, B: endB + 0.01 } })).toEqual([])
    const { errors } = validate(base(), { durationSec: { A: 600, B: endB - 2 } })
    expect(errors[0]).toMatchObject({ code: 'deck-b-ends-early', deck: 'B' })
    expect(errors[0]!.message).toMatch(/^Track B ends 2 s before the plan ends at beat 160$/)
  })

  it('refuses references to missing annotations', () => {
    const p = { ...base(), annotations: base().annotations.filter((a) => a.id !== 'bass-swap') }
    expect(errorCodes(p)).toEqual(['missing-annotation', 'missing-annotation'])
  })

  it('refuses an empty or reversed span and invalid grids', () => {
    expect(errorCodes({ ...base(), span: { startBeat: 10, endBeat: 10 } })).toContain('span')
    const bad = { ...base(), decks: { ...decks, B: { trackFingerprint: 'b', grid: grid(0, 0) } } }
    expect(errorCodes(bad)).toEqual(['invalid-grid'])
  })
})

describe('validate: warnings', () => {
  it('flags events off the 1/4-beat grid', () => {
    const p = withEvents({ id: 'x', control: 'A.trim', kind: 'set', atBeat: 10.1, to: 0 })
    expect(validate(p)).toMatchObject({
      errors: [],
      warnings: [{ code: 'off-grid', eventId: 'x' }],
    })
  })

  it('flags an outdated strategy version', () => {
    expect(warningCodes(base(), { strategyVersion: 2 })).toEqual(['strategy-outdated'])
    expect(warningCodes(base(), { strategyVersion: 1 })).toEqual([])
  })

  it('flags a pitch change of half a semitone or more', () => {
    const p = { ...base(), decks: { ...decks, B: { trackFingerprint: 'b', grid: grid(120, 0.4) } } }
    const { warnings } = validate(p)
    expect(warnings).toEqual([
      {
        code: 'pitch-change',
        deck: 'B',
        message: 'Matching the tempo shifts track B by +0.57 semitones',
      },
    ])
  })

  it('flags both decks playing full bass for more than a beat', () => {
    const early = withEvents({ id: 'x', control: 'B.eqLow', kind: 'set', atBeat: 56, to: 0.5 })
    // Remove the original B low set at 64 so the clash runs 56…64.
    const p = { ...early, events: early.events.filter((e) => e.id !== 'b-low') }
    const { warnings } = validate(p)
    expect(warnings).toEqual([
      { code: 'bass-clash', message: 'Both decks play full bass from beat 56 to 64' },
    ])
  })

  it('does not flag a clash of one beat or less, or while one deck is silent', () => {
    const p1 = { ...base(), events: base().events.filter((e) => e.id !== 'b-low') }
    const oneBeat = {
      ...p1,
      events: [
        ...p1.events,
        { id: 'x', control: 'B.eqLow', kind: 'set', atBeat: 63, to: 0.5 } as ControlEvent,
      ],
    }
    expect(warningCodes(oneBeat)).toEqual([])
    // B's bass is in from the start, but B is silent until its fader moves at beat 0.
    const silent = {
      ...base(),
      initial: { ...base().initial, 'B.eqLow': 0.5 },
      events: base().events.filter((e) => e.id !== 'b-low' && e.id !== 'b-in'),
    }
    expect(warningCodes(silent)).toEqual([])
  })

  it('flags poor grid fit and grids changed since the plan was made', () => {
    expect(warningCodes(base(), { poorGridFit: { B: true } })).toEqual(['poor-grid-fit'])
    expect(warningCodes(base(), { currentGrids: { A: nudgeBpm(decks.A.grid, 0.01) } })).toEqual([
      'grid-changed',
    ])
  })
})
