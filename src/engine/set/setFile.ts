import type { FrameFeatures } from '../analysis/structure'
import type { BeatGrid } from '../model'
import type { DjId, TempoSource } from './profile'
import type { Reading } from './readings'
import type { SetPlan } from './spine'

// The set without its audio (#96): what the browser keeps between visits, and the file
// one DJ passes to the other. Tracks are named by fingerprint (SHA-256 of the file,
// D-22), with their analysis features, grid and key, so everything but listening works
// before the files are selected again. Each DJ selects their own copies; a file is
// matched by fingerprint, or by name and length.

export const SET_FORMAT = 'dj-flow-lab/set'
export const SET_VERSION = 1

export interface SavedTrack {
  id: string
  owner: DjId
  fileName: string
  fingerprint: string
  durationSec: number
  grid: BeatGrid
  tempo: TempoSource
  key?: string
  frames: { hopSec: number; total: string; low: string; high: string }
}

export interface SavedSet {
  format: typeof SET_FORMAT
  version: typeof SET_VERSION
  savedAt: string
  djs: Record<DjId, string>
  tracks: SavedTrack[]
  reading: Reading | null
  plan: SetPlan | null
  dismissed: string[]
}

export function encodeFloats(values: Float32Array): string {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength)
  let binary = ''
  const CHUNK = 0x8000
  for (let k = 0; k < bytes.length; k += CHUNK)
    binary += String.fromCharCode(...bytes.subarray(k, k + CHUNK))
  return btoa(binary)
}

export function decodeFloats(text: string): Float32Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let k = 0; k < binary.length; k++) bytes[k] = binary.charCodeAt(k)
  return new Float32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
}

export function encodeFrames(frames: FrameFeatures): SavedTrack['frames'] {
  return {
    hopSec: frames.hopSec,
    total: encodeFloats(frames.total),
    low: encodeFloats(frames.low),
    high: encodeFloats(frames.high),
  }
}

export function decodeFrames(saved: SavedTrack['frames']): FrameFeatures {
  return {
    hopSec: saved.hopSec,
    total: decodeFloats(saved.total),
    low: decodeFloats(saved.low),
    high: decodeFloats(saved.high),
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null

/** Reads a set file, or says why it is not one. */
export function parseSet(text: string): SavedSet | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'This is not a set file: it is not JSON.' }
  }
  if (!isObject(data) || data.format !== SET_FORMAT)
    return { error: 'This is not a DJ Flow Lab set file.' }
  if (data.version !== SET_VERSION)
    return { error: `This set file is version ${String(data.version)}; this app reads version 1.` }
  if (!Array.isArray(data.tracks) || !isObject(data.djs))
    return { error: 'This set file is damaged: it has no tracks.' }
  for (const t of data.tracks) {
    if (
      !isObject(t) ||
      typeof t.id !== 'string' ||
      typeof t.fingerprint !== 'string' ||
      !isObject(t.grid) ||
      !isObject(t.frames)
    )
      return { error: 'This set file is damaged: a track is missing its analysis.' }
  }
  return data as unknown as SavedSet
}

/** Seconds two files may differ in length and still be the same track (D-22). */
export const SAME_LENGTH_SEC = 0.05

/** The saved track a file is, by fingerprint first, then by name and length. */
export function matchTrack(
  saved: readonly Pick<SavedTrack, 'id' | 'fileName' | 'fingerprint' | 'durationSec'>[],
  file: { name: string; fingerprint: string; durationSec?: number },
): { id: string; by: 'fingerprint' | 'name and length' } | null {
  const exact = saved.find((t) => t.fingerprint === file.fingerprint)
  if (exact) return { id: exact.id, by: 'fingerprint' }
  if (file.durationSec === undefined) return null
  const near = saved.find(
    (t) =>
      t.fileName === file.name && Math.abs(t.durationSec - file.durationSec!) <= SAME_LENGTH_SEC,
  )
  return near ? { id: near.id, by: 'name and length' } : null
}
