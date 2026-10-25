import type { Observation, ObservationKind } from './observations'
import { fullShare, type DjId, type TrackProfile } from './profile'

// The Concept Explorer (#90): "What story could this music tell?" Three or four readings
// of the same tracks, none marked as best. Each one is an _interpretation_, authored
// here, and offered only when the observations it rests on are present; the fallback is
// always offered. A reading proposes an order of tracks from what is measured (tempo,
// and how much of each track runs at its full groove, never loudness between tracks),
// and gives each slot a musical function (docs/MUSICAL_LANGUAGE.md). The DJs listen and
// decide; the language-model version comes later (#99).

export type MusicalFunction =
  'OPEN' | 'BUILD' | 'HOLD' | 'RELEASE' | 'HANDOFF' | 'TRANSFORM' | 'RESOLVE'

export interface Reading {
  id: string
  name: string
  words: [string, string, string]
  idea: string
  functions: MusicalFunction[]
  /** Why it might work, each resting on an observation. */
  why: { text: string; observationId: string }[]
  question: string
  /** Track ids in the proposed order. */
  order: string[]
  /** The function the reading gives each slot of the order. */
  roles: MusicalFunction[]
  uses: Record<DjId, number>
  /** How the order was made, in words. */
  orderedBy: string
  layer: 'interpretation'
}

/** A reading uses at most this many tracks; the rest can be added on the set. */
export const MAX_SLOTS = 12

interface Authored {
  id: string
  name: string
  words: [string, string, string]
  idea: string
  functions: MusicalFunction[]
  question: string
  /** Every one of these must be observed; each gives a reason. */
  needs: { kind: ObservationKind; why: string }[]
  /** How full each slot should be, by position 0..1 in the set. */
  curve?: (x: number) => number
  /** Alternates the two DJs instead of following a curve. */
  alternate?: boolean
}

const AUTHORED: Authored[] = [
  {
    id: 'into-the-unknown',
    name: 'Into the Unknown',
    words: ['Immersion', 'mystery', 'gradual revelation'],
    idea:
      'Start with space and few elements, let one groove settle long enough to forget ' +
      'time, and reveal the full weight only near the end.',
    functions: ['OPEN', 'HOLD', 'BUILD', 'TRANSFORM', 'RESOLVE'],
    question: 'How long can the room stay inside one state before it needs the reveal?',
    needs: [
      { kind: 'room-to-mix', why: 'Long sparse intros and outros give space to open slowly.' },
      { kind: 'steady-groove', why: 'Long steady grooves can hold the state.' },
    ],
    curve: (x) => (x < 0.8 ? x / 0.8 : 1 - (x - 0.8) * 2),
  },
  {
    id: 'hidden-euphoria',
    name: 'Hidden Euphoria',
    words: ['Restraint', 'anticipation', 'emotional uplift'],
    idea:
      'Keep the energy held back for most of the set, let breakdowns tease what is ' +
      'coming, and open it all up in one late stretch.',
    functions: ['OPEN', 'HOLD', 'BUILD', 'RELEASE', 'RESOLVE'],
    question: 'Which return is strong enough to carry the whole set’s release?',
    needs: [
      { kind: 'breakdown-return', why: 'Breakdowns with a return can tease the release.' },
      { kind: 'late-lift', why: 'Tracks that hold their fullest part back fit a late peak.' },
    ],
    curve: (x) => (x < 0.6 ? 0.2 + 0.3 * x : x < 0.85 ? 1 : 0.55),
  },
  {
    id: 'two-rooms',
    name: 'Two Rooms, One Night',
    words: ['Dialogue', 'contrast', 'meeting'],
    idea:
      'Each DJ keeps their own colour and the set moves between the two, track by track, ' +
      'until the two collections meet.',
    functions: ['OPEN', 'HANDOFF', 'TRANSFORM', 'HANDOFF', 'RESOLVE'],
    question: 'Where do the two collections sound most alike, and should that be the meeting?',
    needs: [{ kind: 'pair-across', why: 'A pair across the two collections can be the meeting.' }],
    alternate: true,
  },
  {
    id: 'pressure-and-breath',
    name: 'Pressure and Breath',
    words: ['Tension', 'release', 'pulse'],
    idea:
      'Waves instead of one arc: hold pressure on a steady groove, let it breathe in a ' +
      'breakdown, and come back stronger each time.',
    functions: ['BUILD', 'HOLD', 'RELEASE', 'BUILD', 'RELEASE', 'RESOLVE'],
    question: 'How many waves does the room want before the last one?',
    needs: [
      { kind: 'steady-groove', why: 'Steady grooves can hold the pressure.' },
      { kind: 'breakdown-return', why: 'Breakdowns with a return give each wave its breath.' },
    ],
    curve: (x) => 0.5 + 0.35 * Math.sin(2 * Math.PI * 2 * x) + 0.15 * x,
  },
]

const FALLBACK: Authored = {
  id: 'steady-climb',
  name: 'A Steady Climb',
  words: ['Patience', 'momentum', 'arrival'],
  idea:
    'The plainest story: from the slowest and sparsest tracks to the fastest and fullest, ' +
    'one small step at a time, then a calm landing.',
  functions: ['OPEN', 'BUILD', 'HOLD', 'RESOLVE'],
  question: 'Is a straight climb what this music wants, or does it ask for a turn?',
  needs: [],
  curve: (x) => (x < 0.9 ? x / 0.9 : 0.8),
}

/** How far into its range a track drives: tempo and its share of full bars, 0..1 within the collection. */
export function drive(tracks: readonly TrackProfile[]): Map<string, number> {
  const bpms = tracks.map((t) => t.grid.bpm)
  const lo = Math.min(...bpms)
  const hi = Math.max(...bpms)
  return new Map(
    tracks.map((t) => [
      t.id,
      0.5 * (hi > lo ? (t.grid.bpm - lo) / (hi - lo) : 0.5) + 0.5 * fullShare(t),
    ]),
  )
}

/** The function of each slot: the reading's functions spread over the order. */
export function rolesFor(functions: readonly MusicalFunction[], slots: number): MusicalFunction[] {
  if (slots === 0) return []
  if (slots === 1) return [functions[0]!]
  return Array.from(
    { length: slots },
    (_, i) => functions[Math.round((i * (functions.length - 1)) / (slots - 1))]!,
  )
}

/** Tracks sorted into slots so that fuller tracks land where the curve is higher. */
function byCurve(
  tracks: readonly TrackProfile[],
  curve: (x: number) => number,
  drives: Map<string, number>,
): string[] {
  const n = tracks.length
  const ranked = [...tracks].sort(
    (a, b) => drives.get(a.id)! - drives.get(b.id)! || a.id.localeCompare(b.id),
  )
  const slots = Array.from({ length: n }, (_, i) => ({ i, c: curve(n === 1 ? 0 : i / (n - 1)) }))
  slots.sort((a, b) => a.c - b.c || a.i - b.i)
  const order = new Array<string>(n)
  slots.forEach((s, k) => (order[s.i] = ranked[k]!.id))
  return order
}

/** The two DJs in turns, each in tempo order, starting with the DJ whose first track is slower. */
function alternating(tracks: readonly TrackProfile[]): string[] {
  const mine = (dj: DjId) =>
    tracks.filter((t) => t.owner === dj).sort((a, b) => a.grid.bpm - b.grid.bpm)
  let [a, b] = [mine('dj1'), mine('dj2')]
  if ((b[0]?.grid.bpm ?? Infinity) < (a[0]?.grid.bpm ?? Infinity)) [a, b] = [b, a]
  const order: string[] = []
  for (let k = 0; k < Math.max(a.length, b.length); k++) {
    if (a[k]) order.push(a[k]!.id)
    if (b[k]) order.push(b[k]!.id)
  }
  return order
}

/** The tracks a reading uses: those its observations name first, then the rest, at most MAX_SLOTS. */
function pick(
  tracks: readonly TrackProfile[],
  evidence: readonly Observation[],
  alternate: boolean,
): TrackProfile[] {
  if (tracks.length <= MAX_SLOTS) return [...tracks]
  const score = (t: TrackProfile) => evidence.filter((o) => o.trackIds.includes(t.id)).length
  const sorted = [...tracks].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
  if (!alternate) return sorted.slice(0, MAX_SLOTS)
  // Half from each DJ where they have enough.
  const out: TrackProfile[] = []
  const half = MAX_SLOTS / 2
  for (const dj of ['dj1', 'dj2'] as const)
    out.push(...sorted.filter((t) => t.owner === dj).slice(0, half))
  for (const t of sorted) if (out.length < MAX_SLOTS && !out.includes(t)) out.push(t)
  return out
}

function build(
  a: Authored,
  tracks: readonly TrackProfile[],
  evidence: Observation[],
  drives: Map<string, number>,
): Reading {
  const used = pick(tracks, evidence, a.alternate ?? false)
  const order = a.alternate ? alternating(used) : byCurve(used, a.curve!, drives)
  const owners = new Map(tracks.map((t) => [t.id, t.owner]))
  const uses: Record<DjId, number> = { dj1: 0, dj2: 0 }
  for (const id of order) uses[owners.get(id)!]++
  return {
    id: a.id,
    name: a.name,
    words: a.words,
    idea: a.idea,
    functions: a.functions,
    why: a.needs.map((n) => ({
      text: n.why,
      observationId: evidence.find((o) => o.kind === n.kind)!.id,
    })),
    question: a.question,
    order,
    roles: rolesFor(a.functions, order.length),
    uses,
    orderedBy: a.alternate
      ? 'the two DJs in turns, each in tempo order'
      : 'tempo and how much of each runs at its full groove',
    layer: 'interpretation',
  }
}

/** The readings the observations support, in a fixed order, then the fallback. */
export function readings(
  tracks: readonly TrackProfile[],
  observations: readonly Observation[],
): Reading[] {
  if (tracks.length === 0) return []
  const drives = drive(tracks)
  const out: Reading[] = []
  for (const a of AUTHORED) {
    const evidence = a.needs.map((n) => observations.find((o) => o.kind === n.kind))
    if (evidence.some((o) => o === undefined)) continue
    out.push(build(a, tracks, evidence as Observation[], drives))
  }
  out.push(build(FALLBACK, tracks, [], drives))
  return out
}
