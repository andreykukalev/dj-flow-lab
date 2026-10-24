/**
 * Shared types for the musical model. Pure types, no runtime dependencies.
 *
 * Conventions (TECHNICAL_DECISIONS.md D-08, D-09):
 * - Track beats are 0-based floats: bar 1 beat 1 of a deck is track beat 0.
 * - Bars are 1-based everywhere a bar number is stored or shown, like DJ software.
 *   Bar 1 is the first full bar at or after file time 0.
 * - Transition beats are the shared timeline of a transition: 0 is the first beat
 *   of deck A's exit bar, and they advance at deck A's tempo.
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

/** Where a transition starts in each track, as 1-based bars. */
export interface TransitionPoints {
  /** Bar of deck A at which the transition timeline starts (transition beat 0). */
  exitBarA: number
  /** Bar of deck B that lines up with `exitBarA`. */
  entryBarB: number
}
