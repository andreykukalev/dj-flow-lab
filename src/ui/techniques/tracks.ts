import type { StructureTerm } from '../../engine/analysis/structure'
import type { BeatGrid, DeckId } from '../../engine/model'
import { secondsPerBar, secondsPerBeat } from '../../engine/time'

// Lesson tracks for the mixing techniques: whole tracks with an arrangement (intro,
// grooves, breakdown, drop, outro), generated in the browser so every technique plays
// without files. They come in pairs, each pair a different situation a DJ meets: tracks
// made for mixing, melodic tracks in different keys, and awkward tracks with a short
// intro and an abrupt end. Each part sits in one EQ band, so every EQ move is audible:
// kick and bass in LOW, pad and lead in MID, hats in HIGH.

export type Part = 'kick' | 'bass' | 'hats' | 'pad' | 'lead'

export interface LessonSection {
  term: StructureTerm
  bars: number
  parts: readonly Part[]
}

export interface LessonTrack {
  name: string
  grid: BeatGrid
  /** Root of the bass line, Hz (LOW). */
  bassHz: number
  /** `offbeat`: one note between the kicks; `rolling`: three sixteenths after each kick. */
  bassStyle: 'offbeat' | 'rolling'
  /** Pad chord, Hz (MID). */
  padHz: readonly number[]
  /** Lead notes, one per eighth over two bars, 0 for a rest (MID). */
  lead: readonly number[]
  /** Hats on every sixteenth (true) or on the off-beat eighths only (HIGH). */
  busyHats: boolean
  sections: readonly LessonSection[]
}

export type PairId = 'friendly' | 'melodic' | 'awkward'

export const PAIR_IDS: readonly PairId[] = ['friendly', 'melodic', 'awkward']

const K: Part = 'kick'
const B: Part = 'bass'
const H: Part = 'hats'
const P: Part = 'pad'
const L: Part = 'lead'

const grid = (bpm: number, phraseOffsetBars = 0): BeatGrid => ({
  bpm,
  anchorSec: 0.1,
  beatsPerBar: 4,
  phraseOffsetBars,
  source: 'user',
})

// A minor pentatonic and G major pentatonic, an octave above the pads: the two keys of
// a pair clash when both melodies or both chords play.
const A_MINOR = { pad: [329.63, 440, 523.25], notes: [880, 1046.5, 1174.66, 1318.51, 1567.98] }
const G_MAJOR = { pad: [392, 493.88, 587.33], notes: [783.99, 880, 987.77, 1174.66, 1318.51] }

/** Sixteen eighths from scale degrees, 0 = rest. */
const melody = (scale: readonly number[], degrees: readonly number[]) =>
  degrees.map((d) => (d === 0 ? 0 : scale[d - 1]!))

export const LESSON_PAIRS: Record<PairId, Record<DeckId, LessonTrack>> = {
  friendly: {
    A: {
      name: 'Warm Room',
      grid: grid(124),
      bassHz: 55,
      bassStyle: 'offbeat',
      padHz: A_MINOR.pad,
      lead: melody(A_MINOR.notes, [1, 0, 3, 0, 4, 0, 3, 0, 1, 0, 0, 0, 5, 4, 3, 0]),
      busyHats: false,
      sections: [
        { term: 'INTRO', bars: 8, parts: [K, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'BREAKDOWN', bars: 8, parts: [P] },
        { term: 'DROP', bars: 8, parts: [K, B, H, P] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'OUTRO', bars: 8, parts: [K, B, H] },
        { term: 'OUTRO', bars: 8, parts: [K, H] },
      ],
    },
    B: {
      name: 'Deep Steps',
      grid: grid(122.5),
      bassHz: 49,
      bassStyle: 'offbeat',
      padHz: G_MAJOR.pad,
      lead: melody(G_MAJOR.notes, [3, 0, 2, 0, 1, 0, 0, 0, 3, 0, 4, 0, 5, 0, 0, 0]),
      busyHats: true,
      sections: [
        { term: 'INTRO', bars: 8, parts: [K, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P, L] },
        { term: 'BREAKDOWN', bars: 8, parts: [P, L] },
        { term: 'DROP', bars: 8, parts: [K, B, H, P, L] },
        { term: 'GROOVE', bars: 4, parts: [K, B, H, P] },
      ],
    },
  },
  melodic: {
    A: {
      name: 'Night Melody',
      grid: grid(120),
      bassHz: 55,
      bassStyle: 'offbeat',
      padHz: A_MINOR.pad,
      lead: melody(A_MINOR.notes, [5, 0, 4, 3, 0, 1, 0, 0, 3, 0, 4, 0, 5, 0, 3, 0]),
      busyHats: false,
      sections: [
        { term: 'INTRO', bars: 8, parts: [K, H, P] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P, L] },
        { term: 'BREAKDOWN', bars: 8, parts: [P, L] },
        { term: 'DROP', bars: 8, parts: [K, B, H, P, L] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'OUTRO', bars: 8, parts: [K, B, H, P] },
      ],
    },
    B: {
      name: 'Golden Hour',
      grid: grid(121),
      bassHz: 49,
      bassStyle: 'offbeat',
      padHz: G_MAJOR.pad,
      lead: melody(G_MAJOR.notes, [1, 0, 2, 0, 3, 0, 5, 0, 4, 0, 3, 0, 2, 0, 0, 0]),
      busyHats: true,
      sections: [
        { term: 'INTRO', bars: 8, parts: [K, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P, L] },
        { term: 'BREAKDOWN', bars: 8, parts: [P, L] },
        { term: 'DROP', bars: 8, parts: [K, B, H, P, L] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
      ],
    },
  },
  awkward: {
    A: {
      name: 'Hard Stop',
      grid: grid(126),
      bassHz: 52,
      bassStyle: 'rolling',
      padHz: A_MINOR.pad,
      lead: melody(A_MINOR.notes, [1, 1, 0, 3, 0, 0, 4, 0, 1, 1, 0, 5, 0, 0, 4, 0]),
      busyHats: true,
      sections: [
        { term: 'GROOVE', bars: 8, parts: [K, B, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P] },
        { term: 'BREAKDOWN', bars: 4, parts: [P] },
        { term: 'DROP', bars: 12, parts: [K, B, H, P] },
        { term: 'OUTRO', bars: 8, parts: [K, B, H] },
      ],
    },
    B: {
      name: 'Short Fuse',
      grid: grid(128, 4),
      bassHz: 46.25,
      bassStyle: 'rolling',
      padHz: G_MAJOR.pad,
      lead: melody(G_MAJOR.notes, [5, 0, 5, 0, 4, 0, 3, 0, 5, 0, 5, 0, 1, 0, 0, 0]),
      busyHats: false,
      sections: [
        { term: 'INTRO', bars: 4, parts: [K, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H] },
        { term: 'GROOVE', bars: 8, parts: [K, B, H, P, L] },
        { term: 'BREAKDOWN', bars: 4, parts: [P, L] },
        { term: 'DROP', bars: 16, parts: [K, B, H, P, L] },
      ],
    },
  },
}

/** Bars of a lesson track. */
export function trackBars(track: LessonTrack): number {
  return track.sections.reduce((n, s) => n + s.bars, 0)
}

/** Length of the audio: the bars after the first downbeat, and a short tail. */
export function trackSeconds(track: LessonTrack): number {
  return track.grid.anchorSec + trackBars(track) * secondsPerBar(track.grid) + 0.5
}

/** Sections with their 1-based bars, for the arrangement strip. */
export function sectionsWithBars(
  track: LessonTrack,
): (LessonSection & { from: number; to: number })[] {
  let bar = 1
  return track.sections.map((s) => {
    const from = bar
    bar += s.bars
    return { ...s, from, to: bar - 1 }
  })
}

/** Seconds over which a part fades in or out at a section boundary, so nothing clicks. */
const EDGE_SEC = 0.012

type Rhythm = Exclude<Part, 'pad'>
const RHYTHM: readonly Rhythm[] = ['kick', 'bass', 'hats', 'lead']

/** Two bars of one part, from a downbeat: everything but the pad repeats every two bars. */
function template(track: LessonTrack, part: Rhythm, sampleRate: number): Float32Array {
  const beat = secondsPerBeat(track.grid.bpm)
  const eighth = beat / 2
  const n = Math.ceil(8 * beat * sampleRate) + 2
  const out = new Float32Array(n)
  let seed = 0x2545f491
  let lastNoise = 0
  for (let i = 0; i < n; i++) {
    const tb = i / sampleRate
    const inBeat = tb % beat
    let v = 0
    if (part === 'kick') {
      // Pitch falling from 150 to 50 Hz; phase is the integral of the frequency.
      const phase = 2 * Math.PI * (50 * inBeat + 100 * 0.03 * (1 - Math.exp(-inBeat / 0.03)))
      v = 0.5 * Math.sin(phase) * Math.exp(-inBeat / 0.22)
    } else if (part === 'bass') {
      if (track.bassStyle === 'offbeat') {
        const offbeat = (tb + beat / 2) % beat
        v = 0.25 * Math.sin(2 * Math.PI * track.bassHz * offbeat) * Math.exp(-offbeat / 0.18)
      } else {
        const sixteenth = beat / 4
        const step = Math.floor(inBeat / sixteenth)
        const into = inBeat - step * sixteenth
        if (step > 0)
          v = 0.22 * Math.sin(2 * Math.PI * track.bassHz * into) * Math.exp(-into / 0.07)
      }
    } else if (part === 'hats') {
      // High-passed noise.
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0
      const noise = seed / 2147483648
      const step = track.busyHats ? beat / 4 : beat
      const inHat = (track.busyHats ? tb : tb + beat / 2) % step
      v = 0.12 * (noise - lastNoise) * Math.exp(-inHat / 0.02)
      lastNoise = noise
    } else {
      // One note per eighth, plucked, with its octave for some bite.
      const k = Math.floor(tb / eighth)
      const f = track.lead[k % track.lead.length]!
      if (f > 0) {
        const into = tb - k * eighth
        const env = Math.min(1, into / 0.005) * Math.exp(-into / 0.16)
        const w = 2 * Math.PI * f * into
        v = 0.07 * env * (Math.sin(w) + 0.3 * Math.sin(2 * w))
      }
    }
    out[i] = v
  }
  return out
}

/**
 * Renders a lesson track as mono samples at `sampleRate`. Kick, bass, hats and melody
 * are rendered for two bars and laid bar by bar where the arrangement has them; the
 * chords are held across bars, so they are rendered continuously.
 */
export function renderLessonTrack(
  track: LessonTrack,
  sampleRate: number,
): Float32Array<ArrayBuffer> {
  const n = Math.ceil(trackSeconds(track) * sampleRate)
  const out = new Float32Array(n)
  const bar = secondsPerBar(track.grid)
  const first = track.grid.anchorSec
  const barParts: (readonly Part[])[] = track.sections.flatMap((s) =>
    Array.from({ length: s.bars }, () => s.parts),
  )
  const plays = (part: Part, k: number) => barParts[k]?.includes(part) ?? false
  const at = (k: number) => Math.round((first + k * bar) * sampleRate)
  const edge = Math.round(EDGE_SEC * sampleRate)

  for (const part of RHYTHM) {
    const tpl = template(track, part, sampleRate)
    for (let k = 0; k < barParts.length; k++) {
      if (!plays(part, k)) continue
      const start = at(k)
      const length = at(k + 1) - start
      const from = Math.round((k % 2) * bar * sampleRate)
      // The kick starts on the beat; the others fade in and out where they start and stop.
      const fadeIn = part !== 'kick' && !plays(part, k - 1)
      const fadeOut = !plays(part, k + 1)
      for (let j = 0; j < length && start + j < n; j++) {
        let g = 1
        if (fadeIn && j < edge) g = j / edge
        if (fadeOut && length - j < edge) g = Math.min(g, (length - j) / edge)
        out[start + j]! += tpl[from + j]! * g
      }
    }
  }

  // The chords: one rotating phasor per note, and a slow shimmer.
  const notes = track.padHz.map((f) => {
    const w = (2 * Math.PI * f) / sampleRate
    return { c: Math.cos(w), s: Math.sin(w), x: 1, y: 0 }
  })
  const shimmer = (2 * Math.PI * 0.25) / sampleRate
  let swell = 0.85
  for (let k = 0; k < barParts.length; k++) {
    const on = plays('pad', k)
    const start = at(k)
    const length = at(k + 1) - start
    const fadeIn = !plays('pad', k - 1)
    const fadeOut = !plays('pad', k + 1)
    for (let j = 0; j < length && start + j < n; j++) {
      let chord = 0
      for (const p of notes) {
        const x = p.x * p.c - p.y * p.s
        p.y = p.x * p.s + p.y * p.c
        p.x = x
        chord += p.y
      }
      if (!on) continue
      let g = 1
      if (fadeIn && j < edge) g = j / edge
      if (fadeOut && length - j < edge) g = Math.min(g, (length - j) / edge)
      const i = start + j
      if ((i & 63) === 0) swell = 0.85 + 0.15 * Math.sin(shimmer * i)
      out[i]! += g * 0.035 * chord * swell
    }
  }
  return out
}
