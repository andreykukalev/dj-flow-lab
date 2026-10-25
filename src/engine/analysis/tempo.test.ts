import { describe, expect, it } from 'vitest'
import { random } from '../test-helpers'
import { arrangement, BPM, full, SR } from './arrangement'
import { estimateTempo, gridFromEstimate, onsetEnvelope } from './tempo'

/** A kick on every beat from `firstSec`, over a little noise. */
function kicks(bpm: number, firstSec: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  const beat = 60 / bpm
  const rnd = random(3)
  for (let i = 0; i < out.length; i++) {
    const t = i / SR - firstSec
    const noise = 0.02 * (rnd() * 2 - 1)
    if (t < 0) {
      out[i] = noise
      continue
    }
    const inBeat = t % beat
    out[i] = 0.6 * Math.sin(2 * Math.PI * 60 * inBeat) * Math.exp(-inBeat / 0.08) + noise
  }
  return out
}

/** Distance between two times on a circle of one beat. */
const offBeat = (a: number, b: number, bpm: number) => {
  const beat = 60 / bpm
  const d = (((a - b) % beat) + beat) % beat
  return Math.min(d, beat - d)
}

describe('estimateTempo', () => {
  it('finds the tempo and the first beat of an arrangement within 0.1 BPM', () => {
    const song = arrangement([
      { bars: 16, kick: true, bass: false, hats: false },
      { bars: 32, ...full },
      { bars: 8, kick: false, bass: false, hats: false },
      { bars: 16, ...full },
    ])
    const e = estimateTempo(onsetEnvelope([song], SR))!
    expect(Math.abs(e.bpm - BPM)).toBeLessThan(0.1)
    expect(e.anchorSec).toBeLessThan(0.015)
    expect(e.confidence).toBeGreaterThan(0.5)
  })

  it.each([
    [126.5, 0.3],
    [93, 1.1],
    [140, 0],
    [122, 0.05],
  ])('finds %s BPM with the first kick at %s s', (bpm, firstSec) => {
    const e = estimateTempo(onsetEnvelope([kicks(bpm, firstSec, 90)], SR))!
    expect(Math.abs(e.bpm - bpm)).toBeLessThan(0.05)
    expect(Math.abs(e.anchorSec - firstSec)).toBeLessThan(0.01)
  })

  it('keeps the beat, not its double, when hats and bass play between the kicks', () => {
    const e = estimateTempo(onsetEnvelope([arrangement([{ bars: 32, ...full }])], SR))!
    expect(Math.abs(e.bpm - BPM)).toBeLessThan(0.1)
    expect(offBeat(e.anchorSec, 0, BPM)).toBeLessThan(0.015)
  })

  it('gives nothing for silence and a low confidence for noise', () => {
    expect(estimateTempo(onsetEnvelope([new Float32Array(SR * 10)], SR))).toBeNull()
    const rnd = random(5)
    const noise = Float32Array.from({ length: SR * 30 }, () => rnd() - 0.5)
    expect(estimateTempo(onsetEnvelope([noise], SR))!.confidence).toBeLessThan(0.2)
  })

  it('makes a likely grid from the estimate', () => {
    const grid = gridFromEstimate({ bpm: 123.45678, anchorSec: 0.2, confidence: 0.7 })
    expect(grid).toEqual({
      bpm: 123.457,
      anchorSec: 0.2,
      beatsPerBar: 4,
      phraseOffsetBars: 0,
      source: 'analysis',
      confidence: 0.7,
    })
  })
})
