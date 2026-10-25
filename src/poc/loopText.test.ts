import { describe, expect, it } from 'vitest'
import { grid } from '../engine/test-helpers'
import type { TransitionTiming } from '../engine/time'
import { describeLoop, loopName, practiceLoop } from './loopText'

const straight: TransitionTiming = {
  gridA: grid(124, 0.1),
  gridB: grid(122.5, 0.25),
  exitBarA: 25,
  entryBarB: 17,
}

describe('loop text', () => {
  it('says nothing for a straight transition', () => {
    expect(describeLoop(straight)).toBeNull()
    expect(practiceLoop(straight)).toBeNull()
  })

  it('describes holding A, and how to play it', () => {
    const t = {
      ...straight,
      loop: { deck: 'A' as const, startBeat: 96, lengthBeats: 16 as const, repeats: 2 },
    }
    expect(describeLoop(t)).toBe(
      "A plays its bars 25–28 3 times, from A 25.1 to A 29.1: A holds this groove while B plays on, and A's bar 29 comes 8 bars later.",
    )
    expect(practiceLoop(t)).toBe(
      'On the controller: with Quantize on, set a 16-beat (4-bar) loop on deck A at its bar 25 (LOOP IN there, LOOP OUT 4 bars later, or a Beat Loop pad) as A reaches A 25.1, and press RELOOP/EXIT during pass 3, before A 29.1, or let A fade out inside the loop.',
    )
    expect(loopName({ deck: 'A', side: 'after', bars: 4, passes: 3, gapBars: 0 }, t)).toBe(
      'A bars 25–28 × 3',
    )
  })

  it("describes stretching B's run-in, with where to start B", () => {
    const t = {
      ...straight,
      loop: { deck: 'B' as const, startBeat: 0, lengthBeats: 16 as const, repeats: 1 },
    }
    expect(describeLoop(t)).toBe(
      'B plays its bars 1–4 twice, from A 5.1 to A 13.1: B starts 4 bars earlier and still has its bar 17.1 on the blend start.',
    )
    expect(practiceLoop(t)).toContain('start B from its bar 1 at A 5.1')
    expect(practiceLoop(t)).toContain('press RELOOP/EXIT during pass 2, before A 13.1')
  })
})
