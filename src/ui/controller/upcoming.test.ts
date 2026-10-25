import { describe, expect, it } from 'vitest'
import { compile } from '../../engine/plan/compile'
import { longBlendPlan } from '../../engine/plan/longBlend'
import { grid } from '../../engine/test-helpers'
import { upcomingCaption, upcomingChange } from './upcoming'

const plan = compile(
  longBlendPlan(
    {
      A: { trackFingerprint: 'a', grid: grid(124, 0.1) },
      B: { trackFingerprint: 'b', grid: grid(122.5, 0.25) },
    },
    { exitBarA: 9, entryBarB: 1 },
  ),
)

describe('upcoming changes', () => {
  it('finds a step within two bars and none further away', () => {
    expect(upcomingChange(plan.controls['A.eqLow'], 56)).toEqual({
      atBeat: 64,
      from: 0.5,
      to: 0,
      kind: 'step',
    })
    expect(upcomingChange(plan.controls['A.eqLow'], 55.9)).toBeUndefined()
    expect(upcomingChange(plan.controls['A.eqLow'], 64)).toBeUndefined()
  })

  it('finds a ramp by its start and target', () => {
    expect(upcomingChange(plan.controls['A.fader'], 90)).toEqual({
      atBeat: 96,
      from: 1,
      to: 0,
      kind: 'ramp',
    })
  })

  it('does not report the end of a ramp under way as a change', () => {
    // A's filter opens over beats 32–64 and then holds.
    expect(upcomingChange(plan.controls['A.filter'], 60)).toBeUndefined()
  })

  it('writes short captions', () => {
    const at = (key: Parameters<typeof upcomingCaption>[0], beat: number) =>
      upcomingCaption(key, upcomingChange(plan.controls[key], beat)!, 25)
    expect(at('A.eqLow', 60)).toBe('kill at 25')
    expect(at('B.eqLow', 60)).toBe('full at 25')
    expect(at('A.eqMid', 60)).toBe('down at 25')
    expect(at('A.fader', 90)).toBe('out at 25')
    expect(at('A.filter', 28)).toBe('sweeps at 25')
  })
})
