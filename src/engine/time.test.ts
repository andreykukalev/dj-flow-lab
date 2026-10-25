import { describe, expect, it } from 'vitest'
import { grid, random } from './test-helpers'
import {
  anchorBeatAt,
  anchorTimeOf,
  barToBeat,
  beatToBar,
  beatToSec,
  deckSecToTransitionBeat,
  elapsedSecToTransitionBeat,
  firstDownbeatSec,
  formatBarBeat,
  parseBarBeat,
  rateB,
  rateToSemitones,
  secToBeat,
  secondsPerBar,
  secondsPerBeat,
  snapSecToBar,
  tempoRate,
  toBarBeat,
  transitionBeatToDeckBeat,
  transitionBeatToDeckSec,
  transitionBeatToElapsedSec,
  type TransitionTiming,
} from './time'

describe('beat grid conversion', () => {
  const g = grid(120, 0.25) // 2 s bars

  it('computes beat and bar length', () => {
    expect(secondsPerBeat(120)).toBe(0.5)
    expect(secondsPerBeat(128)).toBeCloseTo(0.46875)
    expect(secondsPerBar(g)).toBe(2)
  })

  it('rejects non-positive or non-finite tempo', () => {
    expect(() => secondsPerBeat(0)).toThrow(RangeError)
    expect(() => secondsPerBeat(-120)).toThrow(RangeError)
    expect(() => secondsPerBeat(Number.NaN)).toThrow(RangeError)
    expect(() => secondsPerBeat(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('puts bar 1 at the first downbeat at or after file time 0', () => {
    expect(firstDownbeatSec(g)).toBe(0.25)
    expect(firstDownbeatSec(grid(120, 8.25))).toBeCloseTo(0.25, 12)
    expect(firstDownbeatSec(grid(120, -1.75))).toBeCloseTo(0.25, 12)
    expect(firstDownbeatSec(grid(120, 0))).toBe(0)
    expect(firstDownbeatSec(grid(120, 4))).toBe(0)
  })

  it('places track beat 0 on bar 1 beat 1', () => {
    expect(beatToSec(g, 0)).toBe(0.25)
    expect(beatToSec(g, 8)).toBe(4.25)
    expect(beatToSec(g, -1)).toBe(-0.25)
  })

  it('numbers bars from 1', () => {
    expect(barToBeat(g, 1)).toBe(0)
    expect(barToBeat(g, 17)).toBe(64)
    expect(beatToBar(g, 0)).toBe(1)
    expect(beatToBar(g, 3.99)).toBe(1)
    expect(beatToBar(g, 4)).toBe(2)
    expect(beatToBar(g, -0.5)).toBe(0)
  })

  it('formats bar.beat for display', () => {
    expect(formatBarBeat(toBarBeat(g, 0))).toBe('1.1')
    expect(formatBarBeat(toBarBeat(g, 5.5))).toBe('2.2')
    expect(toBarBeat(g, 5.5).fraction).toBe(0.5)
    expect(formatBarBeat(toBarBeat(g, 63))).toBe('16.4')
    expect(formatBarBeat(toBarBeat(g, -1))).toBe('0.4')
  })

  it('snaps a file time to the nearest bar line', () => {
    expect(snapSecToBar(g, 0.25)).toBe(1)
    expect(snapSecToBar(g, 2.0)).toBe(2) // bar 2 starts at 2.25
    expect(snapSecToBar(g, 1.2)).toBe(1)
  })

  it('round-trips file time and beats on random grids', () => {
    const rnd = random(1)
    for (let i = 0; i < 200; i++) {
      const r = grid(60 + rnd() * 120, (rnd() - 0.5) * 600)
      const sec = rnd() * 900
      const beat = (rnd() - 0.5) * 2000
      expect(beatToSec(r, secToBeat(r, sec))).toBeCloseTo(sec, 9)
      expect(secToBeat(r, beatToSec(r, beat))).toBeCloseTo(beat, 9)
    }
  })

  it('gives the same grid whichever downbeat is the anchor', () => {
    const rnd = random(2)
    for (let i = 0; i < 200; i++) {
      const r = grid(60 + rnd() * 120, rnd() * 600)
      const k = Math.round((rnd() - 0.5) * 400)
      const moved = grid(r.bpm, beatToSec(r, k * 4))
      for (const beat of [-7, 0, 1.5, 33, 1000]) {
        expect(beatToSec(moved, beat)).toBeCloseTo(beatToSec(r, beat), 8)
      }
    }
  })
})

describe('tempo sync', () => {
  it('speeds up a slower incoming track to the master tempo', () => {
    expect(tempoRate(grid(126, 0), grid(122, 0))).toBeCloseTo(126 / 122)
  })

  it('converts the rate to a pitch change in semitones', () => {
    expect(rateToSemitones(1)).toBe(0)
    expect(rateToSemitones(2)).toBeCloseTo(12)
    expect(rateToSemitones(124 / 120)).toBeCloseTo(0.568, 3)
    expect(rateToSemitones(120 / 124)).toBeCloseTo(-0.568, 3)
  })
})

describe('transition timeline', () => {
  const timing: TransitionTiming = {
    gridA: grid(124, 0.1),
    gridB: grid(120, 0.6),
    exitBarA: 97,
    entryBarB: 1,
  }

  it('maps beat 0 to the exit bar of A and the entry bar of B', () => {
    expect(transitionBeatToDeckBeat(timing, 'A', 0)).toBe(384)
    expect(transitionBeatToDeckBeat(timing, 'B', 0)).toBe(0)
    expect(transitionBeatToDeckSec(timing, 'A', 0)).toBeCloseTo(0.1 + 384 * (60 / 124))
    expect(transitionBeatToDeckSec(timing, 'B', 0)).toBeCloseTo(0.6)
  })

  it('starts the timeline on a beat inside the exit bar when one is given (#75)', () => {
    const offBeat = { ...timing, exitBeatA: 3 }
    expect(transitionBeatToDeckBeat(offBeat, 'A', 0)).toBe(386)
    expect(transitionBeatToDeckBeat(offBeat, 'B', 0)).toBe(0)
    expect(transitionBeatToDeckBeat({ ...timing, entryBeatB: 4 }, 'B', 0)).toBe(3)
    expect(
      deckSecToTransitionBeat(offBeat, 'A', transitionBeatToDeckSec(offBeat, 'A', 5)),
    ).toBeCloseTo(5, 10)
  })

  it('keeps both decks on the same beat as the transition advances', () => {
    for (const t of [-32, 0, 1, 31, 64, 160]) {
      const secA = transitionBeatToDeckSec(timing, 'A', t)
      const secB = transitionBeatToDeckSec(timing, 'B', t)
      expect(deckSecToTransitionBeat(timing, 'A', secA)).toBeCloseTo(t, 10)
      expect(deckSecToTransitionBeat(timing, 'B', secB)).toBeCloseTo(t, 10)
    }
  })

  it('advances deck B by one of its beats per master beat at the synced rate', () => {
    const elapsed = transitionBeatToElapsedSec(timing, 16)
    const bAdvance =
      transitionBeatToDeckSec(timing, 'B', 16) - transitionBeatToDeckSec(timing, 'B', 0)
    expect(elapsed * rateB(timing)).toBeCloseTo(bAdvance, 10)
  })

  it('converts elapsed time back to transition beats', () => {
    expect(elapsedSecToTransitionBeat(timing, transitionBeatToElapsedSec(timing, 42))).toBeCloseTo(
      42,
    )
  })
})

describe('playback anchor', () => {
  const anchor = { ctxTime: 10, beat: -32, bpm: 124 }

  it('maps context time to transition beats at A’s tempo', () => {
    expect(anchorBeatAt(anchor, 10)).toBe(-32)
    expect(anchorBeatAt(anchor, 10 + 60 / 124)).toBeCloseTo(-31, 12)
    expect(anchorTimeOf(anchor, 0)).toBeCloseTo(10 + 32 * (60 / 124), 12)
  })

  it('round-trips beats and context time', () => {
    const rnd = random(3)
    for (let i = 0; i < 100; i++) {
      const beat = (rnd() - 0.5) * 400
      expect(anchorBeatAt(anchor, anchorTimeOf(anchor, beat))).toBeCloseTo(beat, 9)
    }
  })
})

describe('parseBarBeat', () => {
  const g = grid(124, 0.1)

  it('reads a bar or a bar.beat as a track beat', () => {
    expect(parseBarBeat(g, '25')).toBe(96)
    expect(parseBarBeat(g, '25.1')).toBe(96)
    expect(parseBarBeat(g, ' 25.3 ')).toBe(98)
    expect(formatBarBeat(toBarBeat(g, parseBarBeat(g, '41.4')!))).toBe('41.4')
  })

  it('refuses what is not a position', () => {
    expect(parseBarBeat(g, '25.5')).toBeNull()
    expect(parseBarBeat(g, '25.0')).toBeNull()
    expect(parseBarBeat(g, 'bar 3')).toBeNull()
    expect(parseBarBeat(g, '')).toBeNull()
  })
})
