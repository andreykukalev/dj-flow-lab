import { describe, expect, it } from 'vitest'
import { grid, random } from '../test-helpers'
import {
  analyseStructure,
  checkPhrases,
  frameFeatures,
  likelySections,
  type BarFeatures,
} from './structure'

const SR = 16000
const BPM = 120

type Part = { bars: number; kick: boolean; bass: boolean; hats: boolean; rise?: boolean }

/** A synthetic arrangement: kick, off-beat bass, hats and a pad, part by part. */
function arrangement(parts: Part[]): Float32Array {
  const beat = 60 / BPM
  const totalBars = parts.reduce((n, p) => n + p.bars, 0)
  const out = new Float32Array(Math.ceil((totalBars * 4 * beat + 0.5) * SR))
  const rnd = random(11)
  let bar0 = 0
  for (const part of parts) {
    const start = Math.round(bar0 * 4 * beat * SR)
    const end = Math.round((bar0 + part.bars) * 4 * beat * SR)
    for (let i = start; i < end; i++) {
      const t = i / SR
      const inBeat = t % beat
      const progress = (i - start) / (end - start)
      let v = 0.05 * Math.sin(2 * Math.PI * 330 * t) // pad, always
      if (part.kick) v += 0.5 * Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-inBeat / 0.15)
      const off = (t + beat / 2) % beat
      if (part.bass) v += 0.3 * Math.sin(2 * Math.PI * 45 * off) * Math.exp(-off / 0.2)
      if (part.hats) v += 0.1 * (rnd() * 2 - 1) * Math.exp(-(t % (beat / 2)) / 0.02)
      if (part.rise) v += 0.25 * progress * (rnd() * 2 - 1) // a noise riser
      out[i] = v
    }
    bar0 += part.bars
  }
  return out
}

const full = { kick: true, bass: true, hats: true }
const SONG: Part[] = [
  { bars: 16, kick: true, bass: false, hats: false }, // intro
  { bars: 16, ...full },
  { bars: 8, kick: false, bass: false, hats: false }, // breakdown
  { bars: 8, kick: false, bass: false, hats: false, rise: true }, // build-up: a riser enters
  { bars: 16, ...full }, // drop, then groove
  { bars: 8, kick: true, bass: false, hats: false }, // outro
]

describe('analyseStructure', () => {
  const frames = frameFeatures([arrangement(SONG)], SR)

  it('finds the changes on the phrase lines and proposes the sections', () => {
    const s = analyseStructure(frames, grid(BPM, 0))
    expect(s.bars).toHaveLength(72)
    expect(s.changes.map((c) => c.bar)).toEqual([17, 33, 41, 49, 65])
    expect(s.phraseCheck).toMatchObject({ changes: 5, onLines: 5 })
    expect(s.phraseCheck.suggestedOffsetBars).toBeUndefined()
    expect(s.sections.map((x) => [x.term, x.fromBar, x.toBar])).toEqual([
      ['INTRO', 1, 16],
      ['GROOVE', 17, 32],
      ['BREAKDOWN', 33, 40],
      ['BUILD-UP', 41, 48],
      ['DROP', 49, 56],
      ['GROOVE', 57, 64],
      ['OUTRO', 65, 72],
    ])
    expect(s.sections[0]!.reasons.join()).toMatch(/dB less highs/)
    expect(s.sections[2]!.reasons).toContain('low end mostly absent')
    expect(s.sections[4]!.reasons).toContain('low end returns')
  })

  it('suggests moving the phrase lines when the changes fall between them', () => {
    // Four more bars of intro: every change is 4 bars after a phrase line of the grid.
    const longer = frameFeatures([arrangement([{ ...SONG[0]!, bars: 20 }, ...SONG.slice(1)])], SR)
    const s = analyseStructure(longer, grid(BPM, 0))
    expect(s.changes.map((c) => c.bar)).toEqual([21, 37, 45, 53, 69])
    expect(s.phraseCheck).toMatchObject({ onLines: 0, suggestedOffsetBars: 4, suggestedOnLines: 5 })
    const shifted = analyseStructure(longer, grid(BPM, 0, 4))
    expect(shifted.phraseCheck).toMatchObject({ onLines: 5 })
    expect(shifted.phraseCheck.suggestedOffsetBars).toBeUndefined()
  })

  it('finds one groove and no changes in a loop', () => {
    const loop = frameFeatures([arrangement([{ bars: 32, ...full }])], SR)
    const s = analyseStructure(loop, grid(BPM, 0))
    expect(s.changes).toEqual([])
    expect(s.sections.map((x) => x.term)).toEqual(['GROOVE'])
  })
})

describe('checkPhrases', () => {
  it('does not suggest an offset from too few changes', () => {
    const c = checkPhrases(
      [
        { bar: 5, size: 10 },
        { bar: 13, size: 10 },
      ],
      grid(BPM, 0),
    )
    expect(c).toEqual({ phraseBars: 8, changes: 2, onLines: 0 })
  })
})

describe('likelySections', () => {
  const bar = (n: number, energyDb: number, lowDb: number): BarFeatures => ({
    bar: n,
    energyDb,
    lowDb,
    highDb: -30,
  })

  it('follows the phrase offset and keeps a short first block', () => {
    const bars = Array.from({ length: 20 }, (_, k) =>
      k < 4 ? bar(k + 1, -20, -40) : bar(k + 1, -10, -12),
    )
    const s = likelySections(bars, grid(BPM, 0, 4))
    expect(s.map((x) => [x.term, x.fromBar, x.toBar])).toEqual([
      ['INTRO', 1, 4],
      ['GROOVE', 5, 20],
    ])
  })
})
