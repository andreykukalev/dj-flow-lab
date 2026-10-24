import type { BeatGrid, DeckId, TransitionPoints } from './model'

/** Duration of one beat at the given tempo. */
export function secondsPerBeat(bpm: number): number {
  if (!(bpm > 0)) throw new RangeError(`BPM must be positive, got ${bpm}`)
  return 60 / bpm
}

/** Track beat (0 = first downbeat, may be negative) to position in the track's audio. */
export function beatToSec(grid: BeatGrid, beat: number): number {
  return grid.firstDownbeatSec.value + beat * secondsPerBeat(grid.bpm.value)
}

/** Position in the track's audio to track beat (0 = first downbeat). */
export function secToBeat(grid: BeatGrid, sec: number): number {
  return (sec - grid.firstDownbeatSec.value) / secondsPerBeat(grid.bpm.value)
}

export function barToBeat(grid: BeatGrid, bar: number): number {
  return bar * grid.beatsPerBar
}

/** The bar that contains the given track beat. */
export function beatToBar(grid: BeatGrid, beat: number): number {
  return Math.floor(beat / grid.beatsPerBar)
}

/** Nearest bar line to a position in the track's audio. */
export function snapSecToBar(grid: BeatGrid, sec: number): number {
  return Math.round(secToBeat(grid, sec) / grid.beatsPerBar)
}

/**
 * Playback rate for the incoming deck so that its beats match the outgoing deck.
 * Without key lock this also shifts pitch by the same ratio.
 */
export function tempoRate(master: BeatGrid, follower: BeatGrid): number {
  return master.bpm.value / follower.bpm.value
}

/** Tempo change applied to the follower, as a signed fraction (0.03 = 3% faster). */
export function tempoGap(master: BeatGrid, follower: BeatGrid): number {
  return tempoRate(master, follower) - 1
}

export interface TransitionTiming extends TransitionPoints {
  gridA: BeatGrid
  gridB: BeatGrid
}

/** Track beat in the given deck that plays at the given transition beat. */
export function transitionBeatToDeckBeat(
  timing: TransitionTiming,
  deck: DeckId,
  transitionBeat: number,
): number {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  const bar = deck === 'A' ? timing.exitBarA : timing.entryBarB
  return barToBeat(grid, bar) + transitionBeat
}

/** Position in the given deck's audio, in seconds, at the given transition beat. */
export function transitionBeatToDeckSec(
  timing: TransitionTiming,
  deck: DeckId,
  transitionBeat: number,
): number {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  return beatToSec(grid, transitionBeatToDeckBeat(timing, deck, transitionBeat))
}

/** Transition beat at the given position in the given deck's audio. */
export function deckSecToTransitionBeat(
  timing: TransitionTiming,
  deck: DeckId,
  sec: number,
): number {
  const grid = deck === 'A' ? timing.gridA : timing.gridB
  const bar = deck === 'A' ? timing.exitBarA : timing.entryBarB
  return secToBeat(grid, sec) - barToBeat(grid, bar)
}

/**
 * Elapsed real time from the transition start (beat 0) to the given transition beat.
 * Deck A is the tempo master, so real time follows A's tempo.
 */
export function transitionBeatToElapsedSec(
  timing: TransitionTiming,
  transitionBeat: number,
): number {
  return transitionBeat * secondsPerBeat(timing.gridA.bpm.value)
}

export function elapsedSecToTransitionBeat(timing: TransitionTiming, elapsedSec: number): number {
  return elapsedSec / secondsPerBeat(timing.gridA.bpm.value)
}
