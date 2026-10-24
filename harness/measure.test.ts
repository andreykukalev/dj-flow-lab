import { describe, expect, it } from 'vitest'
import { maxJump, maxOnsetOffset, onsets, rms, rmsEnvelope } from './measure'
import { clickPositions, clickTrack, sine, whiteNoise } from './signals'

describe('synthetic signals', () => {
  it('places clicks on the beat grid', () => {
    const opts = { sampleRate: 48000, seconds: 4, bpm: 120, firstBeatSec: 0.25 }
    const data = clickTrack(opts)
    expect(clickPositions(opts)).toEqual([
      12000, 36000, 60000, 84000, 108000, 132000, 156000, 180000,
    ])
    expect(data[12000]).toBe(1)
    expect(data[11999]).toBe(0)
  })

  it('generates identical noise for the same seed', () => {
    expect(whiteNoise(8000, 0.1, 1, 7)).toEqual(whiteNoise(8000, 0.1, 1, 7))
    expect(whiteNoise(8000, 0.1, 1, 7)).not.toEqual(whiteNoise(8000, 0.1, 1, 8))
  })

  it('generates a sine with the expected RMS', () => {
    expect(rms(sine(48000, 1, 1000, 1))).toBeCloseTo(Math.SQRT1_2, 3)
  })
})

describe('measurements', () => {
  it('finds click onsets exactly on synthetic clicks', () => {
    const opts = { sampleRate: 44100, seconds: 10, bpm: 124, firstBeatSec: 0.3 }
    const found = onsets(clickTrack(opts))
    const expected = clickPositions(opts)
    expect(found.length).toBe(expected.length)
    // A step from 0 to 1 crosses 0.5 halfway between the two samples.
    expect(maxOnsetOffset(found, expected)).toBeLessThanOrEqual(0.5)
  })

  it('interpolates sub-sample crossings', () => {
    const data = new Float32Array([0, 0, 0.25, 0.75, 1])
    expect(onsets(data, 0.5)).toEqual([2.5])
  })

  it('computes windowed RMS and jumps', () => {
    const data = new Float32Array([1, -1, 1, -1, 0, 0, 0, 0])
    expect(rmsEnvelope(data, 4)).toEqual([1, 0])
    expect(maxJump(data)).toBe(2)
  })
})
