import { describe, expect, it } from 'vitest'
import { DEFAULT_AREA } from '../plan/area'
import { grid } from '../test-helpers'
import { arrangement, BPM, full, SR, type Part } from './arrangement'
import { suggestBlendStarts, type AutoTrack } from './autoPoint'
import { analyseStructure, frameFeatures } from './structure'

const intro = { kick: true, bass: false, hats: false }
const quiet = { kick: false, bass: false, hats: false }

function track(parts: Part[], phraseOffsetBars = 0): AutoTrack {
  const samples = arrangement(parts)
  const g = grid(BPM, 0, phraseOffsetBars)
  return {
    structure: analyseStructure(frameFeatures([samples], SR), g),
    grid: g,
    beats: (samples.length / SR) * (BPM / 60),
  }
}

const PARTS_A: Part[] = [
  { bars: 16, ...intro },
  { bars: 32, ...full },
  { bars: 8, ...quiet }, // breakdown
  { bars: 8, ...quiet, rise: true }, // build-up
  { bars: 32, ...full },
  { bars: 16, ...intro }, // outro: kick only
]
const A = track(PARTS_A)
const B = track([
  { bars: 16, ...intro },
  { bars: 32, ...full },
  { bars: 8, ...quiet },
  { bars: 32, ...full },
  { bars: 16, ...intro },
])

const LOOP = track([{ bars: 64, ...full }])

describe('suggestBlendStarts', () => {
  it("lines A's outro up with B's groove, B's intro under A", () => {
    const [best] = suggestBlendStarts(A, B, DEFAULT_AREA)
    expect(best).toMatchObject({ exitBarA: 97, entryBarB: 17, area: DEFAULT_AREA, cautions: [] })
    expect(best!.fitted).toMatchObject({ beforeBeats: 64, afterBeats: 64, trimmed: [] })
    const why = best!.reasons.join(' ')
    expect(why).toContain("A's music changes at bar 97")
    expect(why).toContain("B's music changes at bar 17")
    expect(why).toContain("B's bars 1–16 (likely INTRO) are sparser")
    expect(why).toContain("A's bars 97–112 (likely OUTRO) are sparser")
  })

  it('gives different ideas, each on phrase lines of both tracks', () => {
    const ideas = suggestBlendStarts(A, B, DEFAULT_AREA)
    expect(ideas).toHaveLength(3)
    expect(new Set(ideas.map((c) => c.exitBarA)).size).toBe(3)
    expect(new Set(ideas.map((c) => c.entryBarB)).size).toBe(3)
    for (const c of ideas) {
      expect((c.exitBarA - 1) % 8).toBe(0)
      expect((c.entryBarB - 1) % 8).toBe(0)
    }
    expect(ideas[0]!.score).toBeGreaterThanOrEqual(ideas[1]!.score)
  })

  it('with "lift", swaps out of a reduced part of A into a full part of B', () => {
    const [best] = suggestBlendStarts(A, B, DEFAULT_AREA, { energy: 'lift' })
    expect(best).toMatchObject({ exitBarA: 65, entryBarB: 17 })
    expect(best!.reasons.join(' ')).toMatch(
      /fuller, each against its own main part.*the energy lifts/,
    )
  })

  it('sizes the area from the length, and otherwise keeps the current one', () => {
    const [short] = suggestBlendStarts(A, B, DEFAULT_AREA, { length: 'short' })
    expect(short!.area).toEqual({ beforeBars: 4, afterBars: 4, linked: true })
    expect(short!.fitted).toMatchObject({ beforeBeats: 16, afterBeats: 16 })
    const own = { beforeBars: 8, afterBars: 12, linked: false }
    expect(suggestBlendStarts(A, B, own)[0]!.area).toEqual(own)
  })

  it('says when there is no structure to go on', () => {
    const [best] = suggestBlendStarts(LOOP, LOOP, DEFAULT_AREA)
    // The latest phrase line of A with the whole area after it, B's first with it before.
    expect(best).toMatchObject({ exitBarA: 49, entryBarB: 17 })
    expect(best!.cautions.join(' ')).toContain('Neither track shows clear changes')
  })

  it('warns when the phrase lines miss the music', () => {
    const [best] = suggestBlendStarts(track(PARTS_A, 4), B, DEFAULT_AREA)
    expect(best!.cautions.join(' ')).toContain("check A's grid")
  })

  it('prefers not to swap the bass into a part of B that has none', () => {
    // B's low end stops for good after its first 24 bars.
    const noBass = track([
      { bars: 24, ...full },
      { bars: 40, ...quiet },
    ])
    const ideas = suggestBlendStarts(A, noBass, DEFAULT_AREA)
    expect(ideas[0]!.entryBarB).toBeLessThanOrEqual(17)
    // Every idea that swaps into the part without low end says so.
    for (const c of ideas) {
      if (c.entryBarB > 17) expect(c.cautions.join(' ')).toContain('the bass may drop out')
    }
    expect(ideas.some((c) => c.entryBarB > 17)).toBe(true)
  })

  it('offers no loop where the straight area fits', () => {
    for (const c of suggestBlendStarts(A, B, DEFAULT_AREA, {}, 10)) {
      if (c.fitted.trimmed.length === 0) expect(c.alternative).toBeUndefined()
    }
  })

  it("offers a loop on B's intro where B has too little run-in, the straight form first", () => {
    // B's intro is 8 bars: lining up its bar 9 trims the 16 bars before to 8.
    const shortIntro = track([
      { bars: 8, ...intro },
      { bars: 32, ...full },
      { bars: 8, ...quiet },
      { bars: 32, ...full },
      { bars: 16, ...intro },
    ])
    const ideas = suggestBlendStarts(A, shortIntro, DEFAULT_AREA, {}, 10)
    const idea = ideas.find((c) => c.entryBarB === 9)!
    expect(idea.fitted.beforeBeats).toBe(32)
    expect(idea.alternative).toMatchObject({
      loop: { deck: 'B', side: 'before', bars: 8, passes: 2, gapBars: 0 },
      fitted: { beforeBeats: 64, afterBeats: 64, trimmed: [] },
    })
    expect(idea.alternative!.reasons.join(' ')).toContain(
      "Looping B's bars 1–8 twice gives B 16 bars to come in, and bar 9 still lands on the blend start",
    )
    expect(idea.alternative!.cautions.join(' ')).toContain('Listen to each jump back')
    // The loop is ranked by what it gives back, less its cost; it does not change the straight form.
    expect(idea.alternative!.score).toBeGreaterThan(idea.score)
    expect(idea.alternative!.score - idea.score).toBeLessThan(3)
  })

  it('finds nothing in a track without a full bar', () => {
    const tiny = track([{ bars: 0, ...full }])
    expect(suggestBlendStarts(tiny, tiny, DEFAULT_AREA)).toEqual([])
  })
})
