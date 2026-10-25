import { setPhraseOffset } from '../grid'
import type { BeatGrid } from '../model'
import {
  analyseStructure,
  frameFeatures,
  type FrameFeatures,
  type LikelySection,
  type TrackStructure,
} from '../analysis/structure'
import { estimateTempo, gridFromEstimate, onsetEnvelope } from '../analysis/tempo'

// A track of the shared collection of a set (#88), as the planning screens see it: whose
// it is, its grid and how sure we are of it, a key the DJ typed, and its likely
// structure. Only features are kept, never the audio, so a whole collection fits in
// memory; the audio is decoded again when someone listens.
//
// What is not measured: vocals, melody, key, timbre. Levels are compared within a track,
// never between tracks, because two masters differ in loudness.

export type DjId = 'dj1' | 'dj2'

export const DJ_IDS: readonly DjId[] = ['dj1', 'dj2']

export interface Dj {
  id: DjId
  name: string
}

/** Where a track's tempo and "the 1" come from: the estimate, or the DJ. */
export type TempoSource = 'likely' | 'yours'

export interface TrackProfile {
  id: string
  owner: DjId
  name: string
  durationSec: number
  grid: BeatGrid
  tempo: TempoSource
  /** Typed by the DJ, in any notation (8A, Am). Never detected. */
  key?: string
  structure: TrackStructure
}

/** What the analysis keeps of a decoded file. */
export interface TrackFeatures {
  durationSec: number
  frames: FrameFeatures
  /** The starting grid: the estimate, or a default when the file has no beat to find. */
  grid: BeatGrid
  tempo: TempoSource
}

const FALLBACK_GRID: BeatGrid = {
  bpm: 120,
  anchorSec: 0,
  beatsPerBar: 4,
  phraseOffsetBars: 0,
  source: 'analysis',
  confidence: 0,
}

/** One pass over the decoded audio: the frame features and a starting grid. */
export function analyseAudio(channels: readonly Float32Array[], sampleRate: number): TrackFeatures {
  const estimate = estimateTempo(onsetEnvelope(channels, sampleRate))
  return {
    durationSec: (channels[0]?.length ?? 0) / sampleRate,
    frames: frameFeatures(channels, sampleRate),
    grid: estimate ? gridFromEstimate(estimate) : FALLBACK_GRID,
    tempo: 'likely',
  }
}

/**
 * The structure on a grid. On the analysis' own grid the phrase lines move to where
 * the music changes when that clearly fits better; a grid the DJ set is kept as it is.
 */
export function structureOn(
  frames: FrameFeatures,
  grid: BeatGrid,
  tempo: TempoSource,
): { grid: BeatGrid; structure: TrackStructure } {
  const structure = analyseStructure(frames, grid)
  const offset = structure.phraseCheck.suggestedOffsetBars
  if (tempo === 'yours' || offset === undefined) return { grid, structure }
  const moved = { ...setPhraseOffset(grid, offset), source: grid.source }
  if (grid.confidence !== undefined) moved.confidence = grid.confidence
  return { grid: moved, structure: analyseStructure(frames, moved) }
}

/** Bars of a track on its grid. */
export const barCount = (t: TrackProfile) => t.structure.bars.length

/** Level per bar relative to the track's loudest bars, 0..1, in `points` steps. */
export function shape(t: TrackProfile, points = 32): number[] {
  const bars = t.structure.bars
  if (bars.length === 0) return []
  const top = Math.max(...bars.map((b) => b.energyDb))
  const range = 24
  return Array.from({ length: points }, (_, k) => {
    const from = Math.floor((k * bars.length) / points)
    const to = Math.max(from + 1, Math.floor(((k + 1) * bars.length) / points))
    const slice = bars.slice(from, to)
    const db = slice.reduce((a, b) => a + b.energyDb, 0) / slice.length
    return Math.max(0, Math.min(1, 1 - (top - db) / range))
  })
}

/** Share of a track's bars in its full sections (GROOVE or DROP), 0..1. */
export function fullShare(t: TrackProfile): number {
  const bars = barCount(t)
  if (bars === 0) return 0
  const full = t.structure.sections
    .filter((s) => s.term === 'GROOVE' || s.term === 'DROP')
    .reduce((n, s) => n + s.toBar - s.fromBar + 1, 0)
  return full / bars
}

export const sectionBars = (s: LikelySection) => s.toBar - s.fromBar + 1

/** "6:12" */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec - m * 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "124.00 BPM · key 8A · 6:12" */
export function trackFacts(t: TrackProfile): string {
  return `${t.grid.bpm.toFixed(2)} BPM · ${t.key ? `key ${t.key}` : 'key —'} · ${formatDuration(t.durationSec)}`
}
