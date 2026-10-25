import { describe, expect, it } from 'vitest'
import type { DeckLoop } from '../model'
import { grid } from '../test-helpers'
import {
  deckBeatToTransitionBeat,
  deckRuns,
  deckSecToTransitionBeat,
  loopSchedule,
  transitionBeatToDeckBeat,
  transitionBeatToDeckSec,
  type TransitionTiming,
} from '../time'
import { fitArea } from './area'
import { compile } from './compile'
import { longBlendPlan } from './longBlend'
import {
  areaContextFor,
  loopToFill,
  planTiming,
  requestOf,
  resolveLoop,
  type LoopRequest,
} from './loop'
import { applyTake } from './take'
import type { TransitionPlanV1 } from './types'
import { validate } from './validate'

// #81: one loop on one deck. A's bar 25 (beat 96) with B's bar 17 (beat 64).
const gridA = grid(124, 0.1)
const gridB = grid(122.5, 0.25)
const straight: TransitionTiming = { gridA, gridB, exitBarA: 25, entryBarB: 17 }
/** Hold A: bars 25–28 from the blend start, three passes. */
const holdA: DeckLoop = { deck: 'A', startBeat: 96, lengthBeats: 16, repeats: 2 }
/** Stretch B: bars 1–4, twice, before the blend start. */
const stretchB: DeckLoop = { deck: 'B', startBeat: 0, lengthBeats: 16, repeats: 1 }
const withLoop = (loop: DeckLoop): TransitionTiming => ({ ...straight, loop })

describe('deck runs', () => {
  it('maps a straight deck with one run, as before', () => {
    expect(deckRuns(straight, 'A')).toEqual([{ from: -Infinity, to: Infinity, offset: 96 }])
    for (const t of [-200, -1.5, 0, 33.25]) {
      expect(transitionBeatToDeckBeat(straight, 'A', t)).toBe(96 + t)
      expect(transitionBeatToDeckBeat(straight, 'B', t)).toBe(64 + t)
    }
  })

  it('holds A on its bars from the blend start, and plays its later music later', () => {
    const t = withLoop(holdA)
    expect(loopSchedule(t)).toMatchObject({ side: 'after', from: 0, to: 48, passes: 3 })
    const at = (beat: number) => transitionBeatToDeckBeat(t, 'A', beat)
    expect([at(-1), at(0), at(15.5), at(16), at(31), at(32), at(47.75), at(48), at(60)]).toEqual([
      95, 96, 111.5, 96, 111, 96, 111.75, 112, 124,
    ])
    // B is not looped.
    expect(transitionBeatToDeckBeat(t, 'B', 40)).toBe(104)
  })

  it("starts B's looped bars earlier and keeps B's bar 17 on the blend start", () => {
    const t = withLoop(stretchB)
    expect(loopSchedule(t)).toMatchObject({ side: 'before', from: -80, to: -48, passes: 2 })
    const at = (beat: number) => transitionBeatToDeckBeat(t, 'B', beat)
    expect([at(-81), at(-80), at(-65), at(-64), at(-49), at(-48), at(0), at(8)]).toEqual([
      -1, 0, 15, 0, 15, 16, 64, 72,
    ])
    expect(transitionBeatToDeckBeat(t, 'A', 0)).toBe(96)
  })

  it('finds the pass nearest the blend start going back from a deck beat', () => {
    expect(deckBeatToTransitionBeat(withLoop(holdA), 'A', 100)).toBe(4)
    expect(deckBeatToTransitionBeat(withLoop(holdA), 'A', 112)).toBe(48)
    expect(deckBeatToTransitionBeat(withLoop(holdA), 'A', 80)).toBe(-16)
    expect(deckBeatToTransitionBeat(withLoop(stretchB), 'B', 4)).toBe(-60)
    expect(deckBeatToTransitionBeat(withLoop(stretchB), 'B', -2)).toBe(-82)
    const sec = transitionBeatToDeckSec(withLoop(holdA), 'A', 60)
    expect(deckSecToTransitionBeat(withLoop(holdA), 'A', sec)).toBeCloseTo(60, 9)
  })

  it('ignores a loop that crosses the blend start', () => {
    const t = withLoop({ ...holdA, startBeat: 88 })
    expect(loopSchedule(t)).toBeNull()
    expect(deckRuns(t, 'A')).toHaveLength(1)
  })

  it('leaves no gaps between runs', () => {
    for (const loop of [holdA, stretchB, { ...holdA, repeats: 7, lengthBeats: 8 as const }]) {
      const runs = deckRuns(withLoop(loop), loop.deck)
      expect(runs).toHaveLength(loop.repeats + 1)
      for (let k = 1; k < runs.length; k++) expect(runs[k]!.from).toBe(runs[k - 1]!.to)
    }
  })
})

describe('resolving a loop request', () => {
  const deckA = { grid: gridA, entryBeat: 96, beats: 190 }
  const deckB = { grid: gridB, entryBeat: 64, beats: 160 }
  const hold: LoopRequest = { deck: 'A', side: 'after', bars: 4, passes: 3, gapBars: 0 }
  const stretch: LoopRequest = { deck: 'B', side: 'before', bars: 4, passes: 2, gapBars: 12 }

  it('puts the loop on downbeats next to the blend start, the gap away', () => {
    expect(resolveLoop(hold, deckA)).toEqual({ loop: holdA })
    expect(resolveLoop({ ...hold, gapBars: 2 }, deckA)).toEqual({
      loop: { ...holdA, startBeat: 104 },
    })
    expect(resolveLoop(stretch, deckB)).toEqual({ loop: stretchB })
    // A blend start off the downbeat: the loop starts on the next one.
    expect(resolveLoop(hold, { ...deckA, entryBeat: 97 })).toEqual({
      loop: { ...holdA, startBeat: 100 },
    })
  })

  it('shortens a gap the deck has no music for, and refuses a loop that does not fit', () => {
    expect(resolveLoop({ ...stretch, gapBars: 40 }, deckB)).toEqual({ loop: stretchB })
    expect(resolveLoop({ ...hold, gapBars: 40 }, deckA)).toEqual({
      loop: { ...holdA, startBeat: 172 },
    })
    expect(resolveLoop(stretch, { ...deckB, entryBeat: 12 })).toEqual({
      error: 'B has 3 bars before the blend start: not enough for a 4-bar loop on B',
    })
    expect(resolveLoop({ ...hold, passes: 9 }, deckA)).toHaveProperty('error')
    expect(resolveLoop({ ...hold, passes: 1 }, deckA)).toHaveProperty('error')
  })

  it('gives back the request from the loop', () => {
    expect(requestOf(holdA, withLoop(holdA))).toEqual(hold)
    expect(requestOf(stretchB, withLoop(stretchB))).toEqual(stretch)
  })
})

describe('area with a loop', () => {
  const beats = { A: 190, B: 160 }

  it("gives B's extra passes to the area before the blend start", () => {
    // B's bar 9: only 8 bars of B before it.
    const short = { ...straight, entryBarB: 9 }
    const request = { beforeBars: 16, afterBars: 16, linked: true }
    const fitted = fitArea(request, areaContextFor(short, beats))
    expect(fitted.beforeBeats).toBe(32)
    expect(fitted.trimmed).toEqual(['Before trimmed to 8 bars: B has no music before that.'])

    const fill = loopToFill(request, short, beats)
    expect(fill).toEqual({ deck: 'B', side: 'before', bars: 8, passes: 2, gapBars: 0 })
    const resolved = resolveLoop(fill!, { grid: gridB, entryBeat: 32, beats: 160 })
    if (!('loop' in resolved)) throw new Error('expected a loop')
    const looped = fitArea(request, areaContextFor({ ...short, loop: resolved.loop }, beats))
    expect(looped.beforeBeats).toBe(64)
    expect(looped.trimmed).toEqual([])
  })

  it('gives A more music after the blend start when A is held', () => {
    // A's bar 41: 7½ bars of A left after the blend start.
    const late = { ...straight, exitBarA: 41 }
    const request = { beforeBars: 16, afterBars: 16, linked: true }
    expect(fitArea(request, areaContextFor(late, beats)).afterBeats).toBe(30)
    const fill = loopToFill(request, late, beats)
    expect(fill).toEqual({ deck: 'A', side: 'after', bars: 4, passes: 4, gapBars: 0 })
    const resolved = resolveLoop(fill!, { grid: gridA, entryBeat: 160, beats: 190 })
    if (!('loop' in resolved)) throw new Error('expected a loop')
    const ctx = areaContextFor({ ...late, loop: resolved.loop }, beats)
    expect(fitArea(request, ctx).afterBeats).toBe(64)
  })

  it('offers no loop when nothing is trimmed, or nothing fits', () => {
    const request = { beforeBars: 16, afterBars: 16, linked: true }
    expect(loopToFill(request, straight, beats)).toBeNull()
    // B's bar 2: one bar before it, too short for a 2-bar loop.
    expect(loopToFill(request, { ...straight, entryBarB: 2 }, beats)).toBeNull()
  })
})

describe('a plan with a loop', () => {
  const decks = {
    A: { trackFingerprint: 'a', grid: { ...gridA, source: 'user' as const } },
    B: { trackFingerprint: 'b', grid: { ...gridB, source: 'user' as const } },
  }
  const points = { exitBarA: 25, entryBarB: 17 }
  const area = { beforeBeats: 64, afterBeats: 64, preRollBeats: 32, tailBeats: 32 }
  const plan = (loop?: DeckLoop): TransitionPlanV1 => ({
    ...longBlendPlan(decks, points, area),
    ...(loop && { loop }),
  })
  const durationSec = { A: 600, B: 600 }
  const codes = (p: TransitionPlanV1) => validate(p, { durationSec }).errors.map((e) => e.code)

  it('is valid with either loop, and straight plans carry no loop', () => {
    expect('loop' in plan()).toBe(false)
    expect(validate(plan(holdA), { durationSec })).toEqual({ errors: [], warnings: [] })
    expect(codes(plan(stretchB))).toEqual([])
    expect(planTiming(plan(holdA)).loop).toEqual(holdA)
  })

  it('refuses loops that are not 2, 4 or 8 bars on a downbeat, inside the audio, on one side', () => {
    expect(codes(plan({ ...holdA, lengthBeats: 12 as 16 }))).toEqual(['loop'])
    expect(codes(plan({ ...holdA, repeats: 0 }))).toEqual(['loop'])
    expect(codes(plan({ ...holdA, repeats: 8 }))).toEqual(['loop'])
    expect(codes(plan({ ...holdA, repeats: 1.5 }))).toEqual(['loop'])
    expect(codes(plan({ ...holdA, startBeat: 98 }))).toEqual(['loop'])
    expect(codes(plan({ ...holdA, startBeat: 88 }))).toEqual(['loop']) // across the blend start
    expect(codes(plan({ ...stretchB, startBeat: -4 }))).toEqual(['loop'])
    const shortA = validate(plan(holdA), { durationSec: { A: 50, B: 600 } }).errors
    expect(shortA.map((e) => e.message)).toEqual(["The loop on A is outside the track's audio"])
  })

  it("says when the loop's grid is not confirmed", () => {
    const analysed = { ...plan(holdA), decks: { ...decks, A: { ...decks.A, grid: gridA } } }
    expect(validate(analysed, { durationSec }).warnings.map((w) => w.code)).toEqual(['loop-grid'])
  })

  it('counts a loop on B when checking that B lasts to the end of the plan', () => {
    const afterB: DeckLoop = { deck: 'B', startBeat: 64, lengthBeats: 32, repeats: 7 }
    // B's 64 bars at 122.5 BPM: ~125 s. The plan ends 24 bars after bar 17 of B.
    const durations = { A: 600, B: 125 }
    expect(validate(plan(), { durationSec: durations }).errors).toEqual([])
    expect(validate(plan(afterB), { durationSec: durations }).errors.map((e) => e.code)).toEqual([])
    const shortB = { A: 600, B: 40 }
    expect(validate(plan(stretchB), { durationSec: shortB }).errors.map((e) => e.code)).toEqual([
      'deck-b-ends-early',
    ])
  })

  it('survives JSON, and compiles the same automation as the straight plan', () => {
    const p = plan(stretchB)
    const back = JSON.parse(JSON.stringify(p)) as TransitionPlanV1
    expect(back).toEqual(p)
    expect(validate(back, { durationSec }).errors).toEqual([])
    expect(compile(back)).toEqual(compile(plan()))
  })

  it('keeps the loop when a take is applied', () => {
    const take = {
      id: 't1',
      control: 'A.filter' as const,
      points: [
        { beat: 8, value: 0 },
        { beat: 24, value: -0.5 },
      ],
    }
    const taken = applyTake(plan(holdA), take)
    expect(taken.loop).toEqual(holdA)
    expect(validate(taken, { durationSec }).errors).toEqual([])
  })
})
