import { describe, expect, it } from 'vitest'
import type { BeatGrid } from './model'
import {
  beatToBar,
  beatToSec,
  deckSecToTransitionBeat,
  elapsedSecToTransitionBeat,
  secToBeat,
  secondsPerBeat,
  snapSecToBar,
  tempoGap,
  tempoRate,
  transitionBeatToDeckBeat,
  transitionBeatToDeckSec,
  transitionBeatToElapsedSec,
  type TransitionTiming,
} from './time'

function grid(bpm: number, firstDownbeatSec: number): BeatGrid {
  return {
    bpm: { value: bpm, layer: 'measured', source: 'analysis' },
    firstDownbeatSec: { value: firstDownbeatSec, layer: 'measured', source: 'analysis' },
    beatsPerBar: 4,
  }
}

describe('beat grid conversion', () => {
  const g = grid(120, 0.25)

  it('computes beat length', () => {
    expect(secondsPerBeat(120)).toBe(0.5)
    expect(secondsPerBeat(128)).toBeCloseTo(0.46875)
  })

  it('rejects non-positive tempo', () => {
    expect(() => secondsPerBeat(0)).toThrow(RangeError)
    expect(() => secondsPerBeat(Number.NaN)).toThrow(RangeError)
  })

  it('places beat 0 on the first downbeat', () => {
    expect(beatToSec(g, 0)).toBe(0.25)
    expect(beatToSec(g, 8)).toBe(4.25)
    expect(beatToSec(g, -1)).toBe(-0.25)
  })

  it('round-trips seconds and beats', () => {
    for (const sec of [0, 0.25, 1.1, 37.5, 300]) {
      expect(beatToSec(g, secToBeat(g, sec))).toBeCloseTo(sec, 10)
    }
  })

  it('finds the bar of a beat, including before the first downbeat', () => {
    expect(beatToBar(g, 0)).toBe(0)
    expect(beatToBar(g, 3.99)).toBe(0)
    expect(beatToBar(g, 4)).toBe(1)
    expect(beatToBar(g, -0.5)).toBe(-1)
  })

  it('snaps a position to the nearest bar line', () => {
    expect(snapSecToBar(g, 0.25)).toBe(0)
    expect(snapSecToBar(g, 2.0)).toBe(1) // bar 1 starts at 2.25
    expect(snapSecToBar(g, 1.2)).toBe(0) // bar 0 at 0.25, bar 1 at 2.25
  })
})

describe('tempo sync', () => {
  it('speeds up a slower incoming track to the master tempo', () => {
    expect(tempoRate(grid(126, 0), grid(122, 0))).toBeCloseTo(126 / 122)
    expect(tempoGap(grid(126, 0), grid(122, 0))).toBeCloseTo(0.0328, 3)
  })

  it('slows down a faster incoming track', () => {
    expect(tempoGap(grid(120, 0), grid(124, 0))).toBeLessThan(0)
  })
})

describe('transition timeline', () => {
  const timing: TransitionTiming = {
    gridA: grid(124, 0.1),
    gridB: grid(120, 0.6),
    exitBarA: 96,
    entryBarB: 0,
  }

  it('maps beat 0 to the exit bar of A and the entry bar of B', () => {
    expect(transitionBeatToDeckBeat(timing, 'A', 0)).toBe(384)
    expect(transitionBeatToDeckBeat(timing, 'B', 0)).toBe(0)
    expect(transitionBeatToDeckSec(timing, 'A', 0)).toBeCloseTo(0.1 + 384 * (60 / 124))
    expect(transitionBeatToDeckSec(timing, 'B', 0)).toBeCloseTo(0.6)
  })

  it('keeps both decks on the same beat as the transition advances', () => {
    for (const t of [-16, 0, 1, 31, 64]) {
      const secA = transitionBeatToDeckSec(timing, 'A', t)
      const secB = transitionBeatToDeckSec(timing, 'B', t)
      expect(deckSecToTransitionBeat(timing, 'A', secA)).toBeCloseTo(t, 10)
      expect(deckSecToTransitionBeat(timing, 'B', secB)).toBeCloseTo(t, 10)
    }
  })

  it('advances deck B by one of its beats per master beat at the synced rate', () => {
    const rate = tempoRate(timing.gridA, timing.gridB)
    const elapsed = transitionBeatToElapsedSec(timing, 16)
    const bAdvance =
      transitionBeatToDeckSec(timing, 'B', 16) - transitionBeatToDeckSec(timing, 'B', 0)
    expect(elapsed * rate).toBeCloseTo(bAdvance, 10)
  })

  it('converts elapsed time back to transition beats', () => {
    expect(elapsedSecToTransitionBeat(timing, transitionBeatToElapsedSec(timing, 42))).toBeCloseTo(
      42,
    )
  })
})
