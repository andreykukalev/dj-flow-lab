import type { BeatGrid } from './model'
import { firstDownbeatSec, secondsPerBar, secondsPerBeat } from './time'

// Grid corrections (D-09). Every correction returns a new grid marked as the user's.
// Conversions between time domains are in time.ts.

function corrected(grid: BeatGrid, change: Partial<BeatGrid>): BeatGrid {
  const next: BeatGrid = { ...grid, ...change, source: 'user' }
  delete next.confidence
  return next
}

/** Sets "the 1" at the given file time, keeping the tempo. */
export function setDownbeatAt(grid: BeatGrid, sec: number): BeatGrid {
  return corrected(grid, { anchorSec: sec })
}

/** Moves the whole grid by `deltaSec` (fine nudge: 1 ms steps). */
export function nudgeGrid(grid: BeatGrid, deltaSec: number): BeatGrid {
  return corrected(grid, { anchorSec: grid.anchorSec + deltaSec })
}

/**
 * Moves the grid by a number of beats: 1/16 for the coarse nudge, or whole beats
 * to move "the 1" within the bar (for example after halving the tempo).
 */
export function shiftGridBeats(grid: BeatGrid, beats: number): BeatGrid {
  return nudgeGrid(grid, beats * secondsPerBeat(grid.bpm))
}

/** Sets the tempo, keeping the anchor downbeat in place. */
export function setBpm(grid: BeatGrid, bpm: number): BeatGrid {
  secondsPerBeat(bpm) // validates
  return corrected(grid, { bpm })
}

/** Changes the tempo by `delta` BPM (0.01 steps in the UI), keeping the anchor in place. */
export function nudgeBpm(grid: BeatGrid, delta: number): BeatGrid {
  return setBpm(grid, grid.bpm + delta)
}

/** Doubles the tempo. The anchor stays a downbeat; new beats fall between the old ones. */
export function doubleBpm(grid: BeatGrid): BeatGrid {
  return setBpm(grid, grid.bpm * 2)
}

/**
 * Halves the tempo. The anchor stays a downbeat, which may be the wrong one of each
 * pair of old bars, so the UI asks the user to confirm "the 1" (see `shiftGridBeats`).
 */
export function halveBpm(grid: BeatGrid): BeatGrid {
  return setBpm(grid, grid.bpm / 2)
}

/**
 * Two-point correction, the main precision tool: the user marks "the 1" at two
 * downbeats far apart. The number of bars between them is rounded from the current
 * tempo, so the current tempo only needs to be within half a bar over that distance.
 */
export function twoPointGrid(grid: BeatGrid, firstSec: number, secondSec: number): BeatGrid {
  const t1 = Math.min(firstSec, secondSec)
  const t2 = Math.max(firstSec, secondSec)
  const bars = Math.round((t2 - t1) / secondsPerBar(grid))
  if (bars < 1) {
    throw new RangeError('The two downbeats must be at least one bar apart')
  }
  const bpm = (60 * bars * grid.beatsPerBar) / (t2 - t1)
  return corrected(grid, { bpm, anchorSec: t1 })
}

/** Sets where the phrase grid starts, as a bar offset from bar 1. */
export function setPhraseOffset(grid: BeatGrid, phraseOffsetBars: number): BeatGrid {
  return corrected(grid, { phraseOffsetBars })
}

export type PhraseLength = 8 | 16 | 32

/** Whether the given 1-based bar starts a phrase on the phrase grid. */
export function isPhraseStart(grid: BeatGrid, bar: number, phraseBars: PhraseLength): boolean {
  return (bar - 1 - grid.phraseOffsetBars) % phraseBars === 0
}

/** 1-based bars that start a phrase, from `fromBar` to `toBar` inclusive. */
export function phraseStarts(
  grid: BeatGrid,
  fromBar: number,
  toBar: number,
  phraseBars: PhraseLength,
): number[] {
  const first =
    fromBar + ((((1 + grid.phraseOffsetBars - fromBar) % phraseBars) + phraseBars) % phraseBars)
  const bars: number[] = []
  for (let bar = first; bar <= toBar; bar += phraseBars) bars.push(bar)
  return bars
}

/** Whether two grids put every beat in the same place (anchor at a different downbeat is the same grid). */
export function sameGrid(a: BeatGrid, b: BeatGrid, toleranceSec = 1e-6): boolean {
  return (
    Math.abs(a.bpm - b.bpm) < 1e-9 &&
    Math.abs(firstDownbeatSec(a) - firstDownbeatSec(b)) < toleranceSec &&
    a.beatsPerBar === b.beatsPerBar &&
    a.phraseOffsetBars === b.phraseOffsetBars
  )
}
