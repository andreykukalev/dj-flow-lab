// Helpers shared by the engine's unit tests.
import type { BeatGrid } from './model'

export function grid(bpm: number, anchorSec: number, phraseOffsetBars = 0): BeatGrid {
  return { bpm, anchorSec, beatsPerBar: 4, phraseOffsetBars, source: 'analysis' }
}

/** Seeded random numbers in [0, 1) for property tests (mulberry32). */
export function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
