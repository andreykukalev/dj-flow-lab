import { MAX_LOOP_REPEATS, type BeatGrid, type DeckId, type DeckLoop } from '../model'
import { beatToSec, deckEntryBeat, loopSchedule, type TransitionTiming } from '../time'
import type { AreaContext, AreaRequest } from './area'
import type { TransitionPlanV1 } from './types'

// Loop-assisted transitions (#81). The plan stores the loop in track beats of its deck,
// so it is reproducible; the session keeps what the user asked for relative to the blend
// start, like the area, so moving the blend start carries the loop along. Its extra
// passes give the deck more music on the loop's side of the blend start, which is what
// lets a loop fill an area that one track could not fill on its own.

export type LoopBars = 2 | 4 | 8

export const LOOP_BARS: readonly LoopBars[] = [2, 4, 8]

/** Most passes of a loop, the first one included. */
export const MAX_PASSES = MAX_LOOP_REPEATS + 1

/** The loop the user asked for, relative to the blend start. */
export interface LoopRequest {
  deck: DeckId
  /** Before the blend start (its passes come before it) or after it. */
  side: 'before' | 'after'
  bars: LoopBars
  /** Times the loop plays, 2 to 8. */
  passes: number
  /** Whole bars between the blend start and the loop's near end. */
  gapBars: number
}

/** The timing a plan plays with: its grids, points and loop. */
export function planTiming(plan: TransitionPlanV1): TransitionTiming {
  return {
    gridA: plan.decks.A.grid,
    gridB: plan.decks.B.grid,
    ...plan.points,
    ...(plan.loop && { loop: plan.loop }),
  }
}

/** What a deck offers a loop: its grid, its beat at the blend start and its length in beats. */
export interface LoopDeck {
  grid: BeatGrid
  entryBeat: number
  /** Track beats of music from bar 1 to the end of the file. */
  beats: number
}

const barsText = (bars: number) => `${bars} bar${bars === 1 ? '' : 's'}`

/**
 * The loop for a request on a deck: on that deck's downbeats, as near the blend start
 * as the gap says. The gap shrinks when the deck has no music that far away; a loop
 * that does not fit even next to the blend start is refused with the reason.
 */
export function resolveLoop(
  request: LoopRequest,
  deck: LoopDeck,
): { loop: DeckLoop } | { error: string } {
  const per = deck.grid.beatsPerBar
  const length = request.bars * per
  const passes = Math.round(request.passes)
  if (passes < 2 || passes > MAX_PASSES)
    return { error: `A loop plays 2 to ${MAX_PASSES} times, not ${passes}` }
  const name = `${request.bars}-bar loop on ${request.deck}`
  const gap = Math.max(0, Math.floor(request.gapBars))
  let start: number
  if (request.side === 'after') {
    const first = Math.ceil(deck.entryBeat / per - 1e-9) * per
    const last = Math.floor(deck.beats / per) * per - length
    if (last < first)
      return { error: `There is not enough of ${request.deck} after the blend start for a ${name}` }
    start = Math.min(first + gap * per, last)
  } else {
    const end = Math.floor(deck.entryBeat / per + 1e-9) * per
    if (end - length < 0)
      return {
        error: `${request.deck} has ${barsText(Math.max(0, end / per))} before the blend start: not enough for a ${name}`,
      }
    start = Math.max(end - length - gap * per, 0)
  }
  return {
    loop: {
      deck: request.deck,
      startBeat: start,
      lengthBeats: length as 8 | 16 | 32,
      repeats: passes - 1,
    },
  }
}

/** The request that gives back a deck loop, for showing it in the controls. */
export function requestOf(loop: DeckLoop, timing: TransitionTiming): LoopRequest {
  const per = loop.deck === 'A' ? timing.gridA.beatsPerBar : timing.gridB.beatsPerBar
  const entry = deckEntryBeat(timing, loop.deck)
  const side = loopSchedule(timing)?.side ?? (loop.startBeat >= entry ? 'after' : 'before')
  const gapBars =
    side === 'after'
      ? Math.round((loop.startBeat - Math.ceil(entry / per - 1e-9) * per) / per)
      : Math.round((Math.floor(entry / per + 1e-9) * per - loop.startBeat - loop.lengthBeats) / per)
  return {
    deck: loop.deck,
    side,
    bars: (loop.lengthBeats / per) as LoopBars,
    passes: loop.repeats + 1,
    gapBars: Math.max(0, gapBars),
  }
}

/**
 * The area context with the loop's extra passes: a loop before the blend start gives its
 * deck that much more music before it, one after it that much more after it.
 */
export function areaContextFor(
  timing: TransitionTiming,
  beats: Record<DeckId, number>,
): AreaContext {
  const extra = { A: { before: 0, after: 0 }, B: { before: 0, after: 0 } }
  const loop = loopSchedule(timing)
  if (loop) extra[loop.deck][loop.side] = loop.repeats * loop.lengthBeats
  return {
    startBeatA: deckEntryBeat(timing, 'A') + extra.A.before,
    entryBeatB: deckEntryBeat(timing, 'B') + extra.B.before,
    beatsA: beats.A + extra.A.before + extra.A.after,
    beatsB: beats.B + extra.B.before + extra.B.after,
  }
}

/**
 * A loop that gives back bars the area had to trim because one track has no music
 * there, or null when no loop of 2 to 8 bars does (#81). Only the two cases DJs use
 * most are offered: B's first bars looped before the blend start when B's run-in is
 * too short, and A's bars from the blend start looped after it when A ends too soon.
 */
export function loopToFill(
  request: AreaRequest,
  timing: TransitionTiming,
  beats: Record<DeckId, number>,
): LoopRequest | null {
  const entryA = deckEntryBeat(timing, 'A')
  const entryB = deckEntryBeat(timing, 'B')
  const wantBefore = Math.max(0, Math.round(request.beforeBars * 4))
  const wantAfter = Math.max(0, Math.round(request.afterBars * 4))
  const roomBeforeA = Math.max(0, Math.floor(entryA))
  const roomBeforeB = Math.max(0, Math.floor(entryB))
  const roomAfterA = Math.max(0, Math.floor(beats.A - entryA))
  const roomAfterB = Math.max(0, Math.floor(beats.B - entryB))

  /** The longest loop of whole bars that fits in `usableBars`, played often enough to fill `missing` beats. */
  const fill = (deck: DeckId, side: 'before' | 'after', usableBars: number, missing: number) => {
    if (missing < 4) return null
    const bars = [...LOOP_BARS].reverse().find((b) => b <= usableBars)
    if (!bars) return null
    const passes = Math.min(MAX_PASSES, 1 + Math.ceil(missing / (bars * 4)))
    // B loops its first bars; A loops the bars from the blend start.
    const gapBars = side === 'before' ? Math.max(0, Math.floor(entryB / 4 + 1e-9) - bars) : 0
    return { deck, side, bars, passes, gapBars } satisfies LoopRequest
  }

  if (roomBeforeB < Math.min(wantBefore, roomBeforeA)) {
    const missing = Math.min(wantBefore, roomBeforeA) - roomBeforeB
    const idea = fill('B', 'before', Math.floor(entryB / 4 + 1e-9), missing)
    if (idea) return idea
  }
  if (roomAfterA < Math.min(wantAfter, roomAfterB)) {
    const missing = Math.min(wantAfter, roomAfterB) - roomAfterA
    const idea = fill(
      'A',
      'after',
      Math.floor((beats.A - Math.ceil(entryA / 4 - 1e-9) * 4) / 4),
      missing,
    )
    if (idea) return idea
  }
  return null
}

/** Whether the looped deck's audio covers the loop. */
export function loopInsideAudio(loop: DeckLoop, grid: BeatGrid, durationSec: number): boolean {
  return (
    loop.startBeat >= 0 && beatToSec(grid, loop.startBeat + loop.lengthBeats) <= durationSec + 1e-6
  )
}
