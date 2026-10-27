import { english, type Translate } from '../../i18n'
import { mainLevels, type BarFeatures } from '../analysis/structure'
import { barCount, sectionBars, shape, type TrackProfile } from './profile'

// "What we noticed in your tracks" (#89): a few observations about the shared
// collection, each resting only on what the analysis measures (tempo, and per bar the
// level, low end and highs within a track), each with the tracks and bars it rests on,
// so the DJs can hear it. Nothing here is about vocals, melody or key: they are not
// measured yet, and the screen says so. The words come from the dictionary, in the
// language the store passes; English when none is given.

export type ObservationKind =
  | 'tempo-neighbours'
  | 'steady-groove'
  | 'breakdown-return'
  | 'late-lift'
  | 'room-to-mix'
  | 'pair-across'

/** 8 bars of one track to listen to, from `bar`. */
export interface Hear {
  trackId: string
  bar: number
  label: string
}

export interface Observation {
  id: string
  kind: ObservationKind
  layer: 'measured' | 'likely'
  title: string
  detail: string
  trackIds: string[]
  hear: Hear[]
}

/** Each track follows the one before with at most this tempo change. */
export const NEIGHBOUR_PERCENT = 3
const STEADY_BARS = 32
const STEADY_DB = 2
const ROOM_BARS = 16
const LATE_SHARE = 0.5
const MAX_HEAR = 3

const percentApart = (a: number, b: number) => (Math.abs(a - b) / Math.min(a, b)) * 100

const median = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

/** Runs of tracks, in tempo order, where each is within the neighbour change of the last. */
function tempoNeighbours(tracks: readonly TrackProfile[], t: Translate): Observation[] {
  const sorted = [...tracks].sort((a, b) => a.grid.bpm - b.grid.bpm)
  const runs: TrackProfile[][] = []
  for (const track of sorted) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    if (run && last && percentApart(last.grid.bpm, track.grid.bpm) <= NEIGHBOUR_PERCENT)
      run.push(track)
    else runs.push([track])
  }
  const min = tracks.length >= 6 ? 3 : 2
  return runs
    .filter((r) => r.length >= min)
    .map((run, k) => {
      const lo = run[0]!.grid.bpm
      const hi = run.at(-1)!.grid.bpm
      const ends = run.length > 1 ? [run[0]!, run.at(-1)!] : run
      return {
        id: `tempo-neighbours-${k + 1}`,
        kind: 'tempo-neighbours',
        layer: 'measured',
        title: t('obs.tempo.title', { n: run.length }),
        detail: t('obs.tempo.detail', {
          lo: lo.toFixed(1),
          hi: hi.toFixed(1),
          pct: NEIGHBOUR_PERCENT,
        }),
        trackIds: run.map((x) => x.id),
        hear: ends.map((x) => ({ trackId: x.id, bar: grooveBar(x), label: x.name })),
      }
    })
}

/** The first bar of a track's first full section, or bar 1. */
function grooveBar(t: TrackProfile): number {
  return t.structure.sections.find((s) => s.term === 'GROOVE' || s.term === 'DROP')?.fromBar ?? 1
}

/** The longest stretch of bars that stays within STEADY_DB of its median on every feature. */
function steadyStretch(bars: readonly BarFeatures[]): { fromBar: number; bars: number } | null {
  let best: { fromBar: number; bars: number } | null = null
  let from = 0
  const steady = (slice: readonly BarFeatures[]) =>
    (['energyDb', 'lowDb', 'highDb'] as const).every((key) => {
      const m = median(slice.map((b) => b[key]))
      return slice.every((b) => Math.abs(b[key] - m) <= STEADY_DB)
    })
  for (let to = 1; to <= bars.length; to++) {
    while (from < to - 1 && !steady(bars.slice(from, to))) from++
    if (!best || to - from > best.bars) best = { fromBar: bars[from]!.bar, bars: to - from }
  }
  return best
}

function steadyGrooves(tracks: readonly TrackProfile[], t: Translate): Observation[] {
  const found: { t: TrackProfile; run: { fromBar: number; bars: number } }[] = []
  for (const track of tracks) {
    // Only bars with the low end in: a long quiet intro is room to mix, not a groove.
    const main = mainLevels(track.structure.bars)
    const pieces: BarFeatures[][] = [[]]
    for (const b of track.structure.bars) {
      if (b.lowDb >= main.low - 6) pieces.at(-1)!.push(b)
      else if (pieces.at(-1)!.length > 0) pieces.push([])
    }
    const runs = pieces.map(steadyStretch).filter((r) => r !== null)
    const run = runs.sort((a, b) => b.bars - a.bars)[0]
    if (run && run.bars >= STEADY_BARS) found.push({ t: track, run })
  }
  if (found.length === 0) return []
  return [
    {
      id: 'steady-groove',
      kind: 'steady-groove',
      layer: 'likely',
      title: t('obs.steady.title', { n: found.length }),
      detail: t('obs.steady.detail', { bars: STEADY_BARS }),
      trackIds: found.map((x) => x.t.id),
      hear: found.slice(0, MAX_HEAR).map((x) => ({
        trackId: x.t.id,
        bar: x.run.fromBar + Math.floor(x.run.bars / 2) - 4,
        label: t('obs.steady.hear', { name: x.t.name, bars: x.run.bars, bar: x.run.fromBar }),
      })),
    },
  ]
}

/** Likely breakdowns followed by a fuller section; hear the four bars on either side of the return. */
function breakdownReturns(tracks: readonly TrackProfile[], t: Translate): Observation[] {
  const found: { t: TrackProfile; bar: number }[] = []
  for (const track of tracks) {
    const s = track.structure.sections
    const k = s.findIndex(
      (x, i) =>
        x.term === 'BREAKDOWN' &&
        s.slice(i + 1).some((y) => y.term === 'DROP' || y.term === 'GROOVE'),
    )
    if (k < 0) continue
    const back = s.slice(k + 1).find((y) => y.term === 'DROP' || y.term === 'GROOVE')!
    found.push({ t: track, bar: back.fromBar })
  }
  if (found.length === 0) return []
  return [
    {
      id: 'breakdown-return',
      kind: 'breakdown-return',
      layer: 'likely',
      title: t('obs.breakdown.title', { n: found.length }),
      detail: t('obs.breakdown.detail'),
      trackIds: found.map((x) => x.t.id),
      hear: found.slice(0, MAX_HEAR).map((x) => ({
        trackId: x.t.id,
        bar: Math.max(1, x.bar - 4),
        label: t('obs.breakdown.hear', { name: x.t.name, bar: x.bar }),
      })),
    },
  ]
}

/** Tracks whose first full section starts after half of the track. */
function lateLifts(tracks: readonly TrackProfile[], t: Translate): Observation[] {
  const found: { t: TrackProfile; bar: number }[] = []
  for (const track of tracks) {
    const first = track.structure.sections.find((s) => s.term === 'GROOVE' || s.term === 'DROP')
    if (first && first.fromBar - 1 >= LATE_SHARE * barCount(track))
      found.push({ t: track, bar: first.fromBar })
  }
  if (found.length === 0) return []
  return [
    {
      id: 'late-lift',
      kind: 'late-lift',
      layer: 'likely',
      title: t('obs.late.title', { n: found.length }),
      detail: t('obs.late.detail'),
      trackIds: found.map((x) => x.t.id),
      hear: found.slice(0, MAX_HEAR).map((x) => ({
        trackId: x.t.id,
        bar: Math.max(1, x.bar - 4),
        label: t('obs.late.hear', { name: x.t.name, bar: x.bar }),
      })),
    },
  ]
}

/** Long likely intros or outros: room for another track to play over. */
function roomToMix(tracks: readonly TrackProfile[], t: Translate): Observation[] {
  const found: { t: TrackProfile; bar: number; label: string }[] = []
  for (const track of tracks) {
    const s = track.structure.sections
    const intro = s[0]?.term === 'INTRO' && sectionBars(s[0]) >= ROOM_BARS ? s[0] : undefined
    const last = s.at(-1)
    const outro = last?.term === 'OUTRO' && sectionBars(last) >= ROOM_BARS ? last : undefined
    if (outro)
      found.push({
        t: track,
        bar: outro.fromBar,
        label: t('obs.room.outro', { name: track.name, bars: sectionBars(outro) }),
      })
    else if (intro)
      found.push({
        t: track,
        bar: 1,
        label: t('obs.room.intro', { name: track.name, bars: sectionBars(intro) }),
      })
  }
  if (found.length === 0) return []
  return [
    {
      id: 'room-to-mix',
      kind: 'room-to-mix',
      layer: 'likely',
      title: t('obs.room.title', { n: found.length }),
      detail: t('obs.room.detail', { bars: ROOM_BARS }),
      trackIds: found.map((x) => x.t.id),
      hear: found.slice(0, MAX_HEAR).map((x) => ({ trackId: x.t.id, bar: x.bar, label: x.label })),
    },
  ]
}

/** How different two tracks' shapes and tempos are: 0 is the same. */
export function distance(a: TrackProfile, b: TrackProfile): number {
  const sa = shape(a, 16)
  const sb = shape(b, 16)
  const shapeGap = sa.reduce((n, v, k) => n + Math.abs(v - (sb[k] ?? 0)), 0) / 16
  return percentApart(a.grid.bpm, b.grid.bpm) / NEIGHBOUR_PERCENT + 2 * shapeGap
}

/** The closest pair between one DJ's tracks and the other's. */
function pairAcross(
  tracks: readonly TrackProfile[],
  names: Record<string, string>,
  t: Translate,
): Observation[] {
  let best: { a: TrackProfile; b: TrackProfile; d: number } | null = null
  for (const a of tracks)
    for (const b of tracks) {
      if (a.owner !== 'dj1' || b.owner !== 'dj2') continue
      const d = distance(a, b)
      if (!best || d < best.d) best = { a, b, d }
    }
  if (!best) return []
  const { a, b } = best
  return [
    {
      id: 'pair-across',
      kind: 'pair-across',
      layer: 'likely',
      title: t('obs.pair.title'),
      detail: t('obs.pair.detail', {
        a: a.name,
        da: names[a.owner] ?? t('dj.1'),
        b: b.name,
        db: names[b.owner] ?? t('dj.2'),
        bpmA: a.grid.bpm.toFixed(1),
        bpmB: b.grid.bpm.toFixed(1),
      }),
      trackIds: [a.id, b.id],
      hear: [a, b].map((x) => ({ trackId: x.id, bar: grooveBar(x), label: x.name })),
    },
  ]
}

/** Every observation the collection supports, in a fixed order; none for fewer than two tracks. */
export function observe(
  tracks: readonly TrackProfile[],
  names: Record<string, string> = {},
  t: Translate = english,
): Observation[] {
  const usable = tracks.filter((x) => barCount(x) > 0)
  if (usable.length < 2) return []
  return [
    ...tempoNeighbours(usable, t),
    ...steadyGrooves(usable, t),
    ...breakdownReturns(usable, t),
    ...lateLifts(usable, t),
    ...roomToMix(usable, t),
    ...pairAcross(usable, names, t),
  ]
}
