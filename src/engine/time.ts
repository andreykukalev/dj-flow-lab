import type { BeatGrid, DeckId, DeckLoop, TransitionPoints } from './model'

// All conversions between the time domains of D-08 live in this file:
// file time (seconds in one deck's audio), track beat, bar:beat (display),
// transition beat (the shared timeline) and context time (the audio clock).

/** Duration of one beat at the given tempo. */
export function secondsPerBeat(bpm: number): number {
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new RangeError(`BPM must be positive, got ${bpm}`)
  return 60 / bpm
}

export function secondsPerBar(grid: BeatGrid): number {
  return grid.beatsPerBar * secondsPerBeat(grid.bpm)
}

/** File time of track beat 0: the first downbeat at or after file time 0. */
export function firstDownbeatSec(grid: BeatGrid): number {
  const bar = secondsPerBar(grid)
  const t = grid.anchorSec - Math.floor(grid.anchorSec / bar) * bar
  // Guard against rounding that lands a hair below a full bar.
  return bar - t < 1e-9 ? 0 : t
}

/** Track beat (0 = bar 1 beat 1, may be negative) to file time. */
export function beatToSec(grid: BeatGrid, beat: number): number {
  return firstDownbeatSec(grid) + beat * secondsPerBeat(grid.bpm)
}

/** File time to track beat. */
export function secToBeat(grid: BeatGrid, sec: number): number {
  return (sec - firstDownbeatSec(grid)) / secondsPerBeat(grid.bpm)
}

/** Track beat at which the given 1-based bar starts. */
export function barToBeat(grid: BeatGrid, bar: number): number {
  return (bar - 1) * grid.beatsPerBar
}

/** The 1-based bar that contains the given track beat. Beats before bar 1 give bar 0 or less. */
export function beatToBar(grid: BeatGrid, beat: number): number {
  return Math.floor(beat / grid.beatsPerBar) + 1
}

export interface BarBeat {
  /** 1-based bar. */
  bar: number
  /** 1-based beat within the bar. */
  beat: number
  /** Position within the beat, 0..1. */
  fraction: number
}

/** Track beat to the 1-based `bar.beat` shown to users. */
export function toBarBeat(grid: BeatGrid, trackBeat: number): BarBeat {
  const whole = Math.floor(trackBeat)
  const bar = beatToBar(grid, whole)
  return {
    bar,
    beat: whole - barToBeat(grid, bar) + 1,
    fraction: trackBeat - whole,
  }
}

export function formatBarBeat(pos: BarBeat): string {
  return `${pos.bar}.${pos.beat}`
}

/** Parses `bar` or `bar.beat` (1-based) into a track beat; null when it is not one. */
export function parseBarBeat(grid: BeatGrid, text: string): number | null {
  const m = /^\s*(-?\d+)(?:\.(\d+))?\s*$/.exec(text)
  if (!m) return null
  const bar = Number(m[1])
  const beat = m[2] === undefined ? 1 : Number(m[2])
  if (beat < 1 || beat > grid.beatsPerBar) return null
  return barToBeat(grid, bar) + beat - 1
}

/** Nearest bar line (1-based bar) to a file time. */
export function snapSecToBar(grid: BeatGrid, sec: number): number {
  return Math.round(secToBeat(grid, sec) / grid.beatsPerBar) + 1
}

/**
 * Playback rate for the follower deck so that its beats match the master deck (D-07).
 * Without key lock this also shifts pitch by the same ratio.
 */
export function tempoRate(master: BeatGrid, follower: BeatGrid): number {
  return master.bpm / follower.bpm
}

/** Pitch change caused by playing at the given rate, in semitones. */
export function rateToSemitones(rate: number): number {
  return 12 * Math.log2(rate)
}

// ---------------------------------------------------------------------------
// Transition timeline

export interface TransitionTiming extends TransitionPoints {
  gridA: BeatGrid
  gridB: BeatGrid
  /** A loop on one deck (#81) bends that deck's map; the timeline itself stays linear. */
  loop?: DeckLoop
}

function deckGrid(timing: TransitionTiming, deck: DeckId): BeatGrid {
  return deck === 'A' ? timing.gridA : timing.gridB
}

/** Track beat of the given deck at the blend start (transition beat 0). */
export function deckEntryBeat(timing: TransitionTiming, deck: DeckId): number {
  return deck === 'A'
    ? barToBeat(timing.gridA, timing.exitBarA) + (timing.exitBeatA ?? 1) - 1
    : barToBeat(timing.gridB, timing.entryBarB) + (timing.entryBeatB ?? 1) - 1
}

/** Playback rate of deck B. Deck A is the tempo master at rate 1. */
export function rateB(timing: TransitionTiming): number {
  return tempoRate(timing.gridA, timing.gridB)
}

// ---------------------------------------------------------------------------
// Loops (#81)
//
// A deck plays straight over runs of the transition timeline: in a run, deck beat =
// transition beat + offset. Without a loop there is one run. A loop of length L played
// 1 + R times from deck beat S adds R jumps back from S + L to S. Its passes start at
// transition beat P0, the first at P0 and the last at P0 + R·L: P0 = S − E for a loop
// after the blend start (the first pass is where the deck reaches S anyway), and
// P0 = S − E − R·L for one before it (the last pass is), E being the deck's beat at the
// blend start. So the blend start always pairs the same beats.

/** One stretch of the timeline over which a deck plays straight. */
export interface DeckRun {
  /** Transition beats, `from` inclusive, `to` exclusive; ±Infinity at the ends. */
  from: number
  to: number
  /** Deck beat = transition beat + offset. */
  offset: number
}

/** Where a deck's loop plays on the timeline. */
export interface LoopSchedule extends DeckLoop {
  side: 'before' | 'after'
  /** Transition beat where the first pass starts, and where the last one ends. */
  from: number
  to: number
  passes: number
}

/** Which side of the blend start a loop is on, or null when it crosses it. */
export function loopSide(loop: DeckLoop, entryBeat: number): 'before' | 'after' | null {
  if (loop.startBeat + loop.lengthBeats <= entryBeat) return 'before'
  if (loop.startBeat >= entryBeat) return 'after'
  return null
}

/** The timing's loop on the timeline, or null when there is none or it crosses the blend start. */
export function loopSchedule(timing: TransitionTiming): LoopSchedule | null {
  const loop = timing.loop
  if (!loop || loop.repeats < 1) return null
  const entry = deckEntryBeat(timing, loop.deck)
  const side = loopSide(loop, entry)
  if (!side) return null
  const { startBeat: s, lengthBeats: l, repeats: r } = loop
  const from = side === 'after' ? s - entry : s - entry - r * l
  return { ...loop, side, from, to: from + (r + 1) * l, passes: r + 1 }
}

/** The runs of one deck, in timeline order, covering the whole timeline. */
export function deckRuns(timing: TransitionTiming, deck: DeckId): DeckRun[] {
  const entry = deckEntryBeat(timing, deck)
  const loop = loopSchedule(timing)
  if (!loop || loop.deck !== deck) return [{ from: -Infinity, to: Infinity, offset: entry }]
  const { startBeat: s, lengthBeats: l, repeats: r, from: p0 } = loop
  const runs: DeckRun[] = [{ from: -Infinity, to: p0 + l, offset: s - p0 }]
  for (let k = 1; k < r; k++)
    runs.push({ from: p0 + k * l, to: p0 + (k + 1) * l, offset: s - p0 - k * l })
  runs.push({ from: p0 + r * l, to: Infinity, offset: s - p0 - r * l })
  return runs
}

/** Track beat of the given deck that plays at the given transition beat. */
export function transitionBeatToDeckBeat(
  timing: TransitionTiming,
  deck: DeckId,
  transitionBeat: number,
): number {
  const runs = deckRuns(timing, deck)
  const run = runs.find((r) => transitionBeat < r.to) ?? runs.at(-1)!
  return transitionBeat + run.offset
}

/**
 * Transition beat at which the given deck plays one of its track beats. A looped beat
 * plays more than once; this is the pass nearest the blend start (the first pass of a
 * loop after it, the last of one before it).
 */
export function deckBeatToTransitionBeat(
  timing: TransitionTiming,
  deck: DeckId,
  deckBeat: number,
): number {
  const runs = deckRuns(timing, deck)
  const loop = loopSchedule(timing)
  if (runs.length === 1 || !loop) return deckBeat - runs[0]!.offset
  const first = runs[0]!
  const last = runs.at(-1)!
  if (deckBeat < loop.startBeat) return deckBeat - first.offset
  if (deckBeat >= loop.startBeat + loop.lengthBeats) return deckBeat - last.offset
  return deckBeat - (loop.side === 'after' ? first : last).offset
}

/** File time of the given deck at the given transition beat. */
export function transitionBeatToDeckSec(
  timing: TransitionTiming,
  deck: DeckId,
  transitionBeat: number,
): number {
  return beatToSec(deckGrid(timing, deck), transitionBeatToDeckBeat(timing, deck, transitionBeat))
}

/** Transition beat at the given file time of the given deck (the pass nearest the blend start). */
export function deckSecToTransitionBeat(
  timing: TransitionTiming,
  deck: DeckId,
  sec: number,
): number {
  return deckBeatToTransitionBeat(timing, deck, secToBeat(deckGrid(timing, deck), sec))
}

/** Real time from transition beat 0 to the given transition beat (A's tempo). */
export function transitionBeatToElapsedSec(
  timing: TransitionTiming,
  transitionBeat: number,
): number {
  return transitionBeat * secondsPerBeat(timing.gridA.bpm)
}

export function elapsedSecToTransitionBeat(timing: TransitionTiming, elapsedSec: number): number {
  return elapsedSec / secondsPerBeat(timing.gridA.bpm)
}

// ---------------------------------------------------------------------------
// Context time (D-04)

/** The single record of playback position: transition beat `beat` plays at context time `ctxTime`. */
export interface PlaybackAnchor {
  ctxTime: number
  beat: number
  /** Tempo of the transition timeline (deck A). */
  bpm: number
}

/** Transition beat playing at context time `t`. */
export function anchorBeatAt(anchor: PlaybackAnchor, t: number): number {
  return anchor.beat + (t - anchor.ctxTime) / secondsPerBeat(anchor.bpm)
}

/** Context time at which transition beat `beat` plays. */
export function anchorTimeOf(anchor: PlaybackAnchor, beat: number): number {
  return anchor.ctxTime + (beat - anchor.beat) * secondsPerBeat(anchor.bpm)
}
