import { describe, expect, it } from 'vitest'
import {
  doubleBpm,
  halveBpm,
  isPhraseStart,
  nudgeBpm,
  nudgeGrid,
  phraseStarts,
  sameGrid,
  setDownbeatAt,
  setPhraseOffset,
  shiftGridBeats,
  twoPointGrid,
} from './grid'
import { grid, random } from './test-helpers'
import { beatToSec, firstDownbeatSec, secToBeat } from './time'

describe('grid corrections', () => {
  const g = { ...grid(124, 0.3), confidence: 0.8 }

  it('marks every correction as the user’s and drops the analysis confidence', () => {
    const c = nudgeGrid(g, 0.001)
    expect(c.source).toBe('user')
    expect(c.confidence).toBeUndefined()
    expect(g.source).toBe('analysis') // input untouched
  })

  it('sets "the 1" at a file time', () => {
    const c = setDownbeatAt(g, 12.345)
    expect(secToBeat(c, 12.345) % 4).toBeCloseTo(0, 9)
  })

  it('nudges the grid in milliseconds and in fractions of a beat', () => {
    expect(beatToSec(nudgeGrid(g, 0.001), 0)).toBeCloseTo(beatToSec(g, 0) + 0.001, 12)
    expect(beatToSec(shiftGridBeats(g, 1 / 16), 0)).toBeCloseTo(beatToSec(g, 0) + 60 / 124 / 16, 12)
  })

  it('nudges BPM around the anchor', () => {
    const c = nudgeBpm(g, 0.01)
    expect(c.bpm).toBeCloseTo(124.01, 12)
    expect(c.anchorSec).toBe(g.anchorSec)
    expect(() => nudgeBpm(grid(0.005, 0), -0.01)).toThrow(RangeError)
  })

  it('doubles the tempo keeping the anchor as a downbeat', () => {
    const c = doubleBpm(g)
    expect(c.bpm).toBe(248)
    expect(beatToSec(c, 2)).toBeCloseTo(beatToSec(g, 1), 12)
  })

  it('halves the tempo keeping the anchor as a downbeat, and can shift "the 1"', () => {
    const c = halveBpm(grid(248, 1.5))
    expect(c.bpm).toBe(124)
    expect(secToBeat(c, 1.5) % 4).toBeCloseTo(0, 9)
    const shifted = shiftGridBeats(c, 2)
    expect(secToBeat(shifted, 1.5 + 2 * (60 / 124)) % 4).toBeCloseTo(0, 9)
  })
})

describe('two-point BPM', () => {
  it('recovers the exact tempo from two downbeats far apart', () => {
    const truth = grid(123.456, 0.512)
    const rough = grid(123.4, 0.5)
    const t1 = beatToSec(truth, 16)
    const t2 = beatToSec(truth, 16 + 4 * 96)
    const c = twoPointGrid(rough, t1, t2)
    expect(c.bpm).toBeCloseTo(123.456, 9)
    expect(sameGrid(c, truth, 1e-9)).toBe(true)
  })

  it('accepts the two points in either order', () => {
    const truth = grid(128, 0.2)
    const t1 = beatToSec(truth, 0)
    const t2 = beatToSec(truth, 256)
    expect(twoPointGrid(grid(127.9, 0), t2, t1).bpm).toBeCloseTo(128, 9)
  })

  it('rounds to whole bars, so the rough tempo can be off by up to half a bar over the distance', () => {
    const rnd = random(4)
    for (let i = 0; i < 200; i++) {
      const truth = grid(110 + rnd() * 30, rnd() * 2)
      const bars = 8 + Math.floor(rnd() * 120)
      const t1 = beatToSec(truth, 4 * Math.floor(rnd() * 16))
      const t2 = t1 + (bars * 4 * 60) / truth.bpm
      // Rough tempo off by less than 40% of a bar over the distance.
      const roughBpm = truth.bpm * (1 + ((rnd() - 0.5) * 0.8) / bars)
      expect(twoPointGrid(grid(roughBpm, 0), t1, t2).bpm).toBeCloseTo(truth.bpm, 9)
    }
  })

  it('refuses points less than a bar apart', () => {
    expect(() => twoPointGrid(grid(120, 0), 1, 1.9)).toThrow(RangeError)
  })
})

describe('phrase grid', () => {
  it('starts phrases at bar 1 plus the offset', () => {
    const g = grid(124, 0)
    expect(isPhraseStart(g, 1, 16)).toBe(true)
    expect(isPhraseStart(g, 17, 16)).toBe(true)
    expect(isPhraseStart(g, 9, 16)).toBe(false)
    expect(isPhraseStart(g, 9, 8)).toBe(true)
    const shifted = setPhraseOffset(g, 4)
    expect(isPhraseStart(shifted, 5, 16)).toBe(true)
    expect(isPhraseStart(shifted, 1, 16)).toBe(false)
    expect(isPhraseStart(shifted, -11, 16)).toBe(true)
  })

  it('lists phrase starts in a bar range', () => {
    expect(phraseStarts(grid(124, 0), 1, 64, 16)).toEqual([1, 17, 33, 49])
    expect(phraseStarts(grid(124, 0, 4), 1, 64, 16)).toEqual([5, 21, 37, 53])
    expect(phraseStarts(grid(124, 0, 4), 22, 40, 8)).toEqual([29, 37])
    expect(phraseStarts(grid(124, 0, -3), 1, 30, 8)).toEqual([6, 14, 22, 30])
  })

  it('agrees with isPhraseStart', () => {
    const rnd = random(5)
    for (let i = 0; i < 50; i++) {
      const g = grid(124, 0, Math.floor((rnd() - 0.5) * 40))
      const from = Math.floor(rnd() * 50) - 10
      const len = ([8, 16, 32] as const)[i % 3]!
      const expected = []
      for (let bar = from; bar <= from + 100; bar++)
        if (isPhraseStart(g, bar, len)) expected.push(bar)
      expect(phraseStarts(g, from, from + 100, len)).toEqual(expected)
    }
  })
})

describe('sameGrid', () => {
  it('treats an anchor at another downbeat as the same grid', () => {
    const g = grid(124, 0.3)
    expect(sameGrid(g, grid(124, beatToSec(g, 400)))).toBe(true)
    expect(firstDownbeatSec(grid(124, beatToSec(g, 400)))).toBeCloseTo(0.3, 9)
  })

  it('sees tempo, position and phrase changes', () => {
    const g = grid(124, 0.3)
    expect(sameGrid(g, nudgeBpm(g, 0.01))).toBe(false)
    expect(sameGrid(g, nudgeGrid(g, 0.001))).toBe(false)
    expect(sameGrid(g, setPhraseOffset(g, 1))).toBe(false)
  })
})
