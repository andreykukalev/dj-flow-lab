import type { BeatGrid } from '../engine/model'
import { secondsPerBeat } from '../engine/time'

// Two synthetic house loops for the proof-of-concept page, generated in the browser so
// the page works without files: a kick on every beat (the reference for judging A/V
// sync), an off-beat bass, sixteenth hats and a pad. The decks differ in bass note,
// chord and hat pattern, so every EQ and filter move is audible. #46 adds real files.

export interface DemoTrack {
  name: string
  grid: BeatGrid
  seconds: number
  bassHz: number
  chordHz: readonly number[]
  /** Hats on every sixteenth (true) or on the off-beat eighths only. */
  busyHats: boolean
}

export const DEMO_TRACKS: Record<'A' | 'B', DemoTrack> = {
  A: {
    name: 'Demo A',
    grid: { bpm: 124, anchorSec: 0.1, beatsPerBar: 4, phraseOffsetBars: 0, source: 'user' },
    seconds: 96,
    bassHz: 55,
    chordHz: [220, 261.63, 329.63],
    busyHats: false,
  },
  B: {
    name: 'Demo B',
    grid: { bpm: 122.5, anchorSec: 0.25, beatsPerBar: 4, phraseOffsetBars: 0, source: 'user' },
    seconds: 80,
    bassHz: 49,
    chordHz: [196, 246.94, 293.66],
    busyHats: true,
  },
}

/** Renders a demo track as mono samples at `sampleRate`. */
export function renderDemoTrack(track: DemoTrack, sampleRate: number): Float32Array<ArrayBuffer> {
  const n = Math.ceil(track.seconds * sampleRate)
  const out = new Float32Array(n)
  const beat = secondsPerBeat(track.grid.bpm)
  const first = track.grid.anchorSec
  let seed = 0x2545f491
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate
    let v = 0
    for (const f of track.chordHz) v += 0.04 * Math.sin(2 * Math.PI * f * t)
    const tb = t - first
    if (tb >= 0) {
      const inBeat = tb % beat
      // Kick: pitch falling from 150 to 50 Hz; phase is the integral of the frequency.
      const phase = 2 * Math.PI * (50 * inBeat + 100 * 0.03 * (1 - Math.exp(-inBeat / 0.03)))
      v += 0.5 * Math.sin(phase) * Math.exp(-inBeat / 0.22)
      const offbeat = (tb + beat / 2) % beat
      v += 0.25 * Math.sin(2 * Math.PI * track.bassHz * offbeat) * Math.exp(-offbeat / 0.18)
      const step = track.busyHats ? beat / 4 : beat
      const inHat = (track.busyHats ? tb : tb + beat / 2) % step
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      v += 0.08 * (seed / 2147483648) * Math.exp(-inHat / 0.02)
    }
    out[i] = v
  }
  return out
}
