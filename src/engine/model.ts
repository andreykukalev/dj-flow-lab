/**
 * Shared types for the musical model. Pure types, no runtime dependencies.
 *
 * Conventions (TECHNICAL_DECISIONS.md D-08, D-09):
 * - Track beats are 0-based floats: bar 1 beat 1 of a deck is track beat 0.
 * - Bars are 1-based everywhere a bar number is stored or shown, like DJ software.
 *   Bar 1 is the first full bar at or after file time 0.
 * - Transition beats are the shared timeline of a transition: 0 is the blend start,
 *   beat `exitBeatA` of deck A's exit bar, and they advance at deck A's tempo.
 */

/** The knowledge layers from the product brief §10. */
export type Layer = 'measured' | 'hypothesis' | 'interpretation' | 'preference' | 'instruction'

export type DeckId = 'A' | 'B'

export const DECK_IDS: readonly DeckId[] = ['A', 'B']

/** A constant-tempo beat grid for one track (D-09). */
export interface BeatGrid {
  /** Beats per minute, kept to at least 3 decimals. */
  bpm: number
  /** File time, in seconds, of any downbeat ("the 1"). */
  anchorSec: number
  beatsPerBar: 4
  /** The phrase grid starts at bar 1 + this offset. */
  phraseOffsetBars: number
  /** Who set the grid. User corrections always win over analysis. */
  source: 'analysis' | 'user'
  /** 0..1, present when the grid comes from analysis. */
  confidence?: number
}

/** Where the two tracks line up: the blend start in A, and the bar of B played there. */
export interface TransitionPoints {
  /** Bar of deck A at which the transition timeline starts (transition beat 0). */
  exitBarA: number
  /** 1-based beat of `exitBarA` at which the timeline starts, for a blend start off the downbeat. Default 1. */
  exitBeatA?: number
  /** Bar of deck B that lines up with the blend start in A. */
  entryBarB: number
  /** 1-based beat of `entryBarB` that lines up with the blend start. Default 1. */
  entryBeatB?: number
}

/** Loop lengths (#81): 2, 4 or 8 bars. */
export type LoopBeats = 8 | 16 | 32

export const LOOP_BEATS: readonly LoopBeats[] = [8, 16, 32]

/** Most extra passes of a loop: it plays at most 1 + this many times. */
export const MAX_LOOP_REPEATS = 7

/**
 * One loop on one deck (#81): `lengthBeats` of the deck from `startBeat`, played
 * 1 + `repeats` times in all. The loop never crosses the deck's blend-start beat: one
 * that ends at or before it plays its extra passes before the blend start (the deck's
 * earlier music starts earlier), one that starts at or after it plays them after (its
 * later music comes later). Either way the blend start keeps its pairing.
 */
export interface DeckLoop {
  deck: DeckId
  /** Track beat where the loop starts: a downbeat of the deck's grid. */
  startBeat: number
  lengthBeats: LoopBeats
  /** Extra passes, at least 1. */
  repeats: number
}
