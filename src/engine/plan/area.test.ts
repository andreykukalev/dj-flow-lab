import { describe, expect, it } from 'vitest'
import { DEFAULT_AREA, fitArea, moveEdge, type AreaContext } from './area'

// #75: the transition area around the blend start, kept inside the music of both tracks.

const roomy: AreaContext = { startBeatA: 96, entryBeatB: 64, beatsA: 400, beatsB: 300 }

describe('fitArea', () => {
  it('keeps the area asked for when both tracks have the music', () => {
    expect(fitArea(DEFAULT_AREA, roomy)).toEqual({
      beforeBeats: 64,
      afterBeats: 64,
      preRollBeats: 32,
      tailBeats: 32,
      trimmed: [],
      tooShort: false,
    })
  })

  it('takes a side of the area on its own', () => {
    const fitted = fitArea({ beforeBars: 4, afterBars: 24, linked: false }, roomy)
    expect([fitted.beforeBeats, fitted.afterBeats]).toEqual([16, 96])
  })

  it('trims the side before when B has no music before its entry bar', () => {
    const fitted = fitArea(DEFAULT_AREA, { ...roomy, entryBeatB: 0 })
    expect([fitted.beforeBeats, fitted.afterBeats]).toEqual([0, 64])
    expect(fitted.trimmed).toEqual(['Before trimmed to 0 bars: B has no music before that.'])
    expect(fitted.tooShort).toBe(false)
  })

  it('trims the side before near the start of A, and shortens the pre-roll first', () => {
    const fitted = fitArea(DEFAULT_AREA, { ...roomy, startBeatA: 40 })
    expect(fitted).toMatchObject({ beforeBeats: 40, preRollBeats: 0 })
    expect(fitted.trimmed).toEqual(['Before trimmed to 10 bars: A has no music before that.'])
    expect(fitArea(DEFAULT_AREA, { ...roomy, startBeatA: 80 })).toMatchObject({
      beforeBeats: 64,
      preRollBeats: 16,
      trimmed: [],
    })
  })

  it('trims the side after where either track ends, and the tail with it', () => {
    const endA = fitArea(DEFAULT_AREA, { ...roomy, beatsA: 130 })
    expect(endA).toMatchObject({ afterBeats: 34, tailBeats: 32 })
    expect(endA.trimmed).toEqual(['After trimmed to 8 bars 2 beats: A ends there.'])
    const endB = fitArea(DEFAULT_AREA, { ...roomy, beatsB: 100.5 })
    expect(endB).toMatchObject({ afterBeats: 36, tailBeats: 0 })
    expect(endB.trimmed).toEqual(['After trimmed to 9 bars: B ends there.'])
  })

  it('says when less than a bar fits', () => {
    expect(fitArea(DEFAULT_AREA, { ...roomy, entryBeatB: 0, beatsA: 98 }).tooShort).toBe(true)
  })
})

describe('moveEdge', () => {
  it('moves both edges of a linked area and one edge otherwise', () => {
    expect(moveEdge(DEFAULT_AREA, 'before', 8)).toEqual({
      beforeBars: 8,
      afterBars: 8,
      linked: true,
    })
    expect(moveEdge({ ...DEFAULT_AREA, linked: false }, 'after', 4)).toEqual({
      beforeBars: 16,
      afterBars: 4,
      linked: false,
    })
    expect(moveEdge(DEFAULT_AREA, 'after', -3).afterBars).toBe(0)
  })
})
