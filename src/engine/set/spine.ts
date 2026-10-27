import type { DjId, TrackProfile } from './profile'
import type { MusicalFunction, Reading } from './readings'
import { workStatus, type TransitionWork, type WorkStatus } from './versions'

// The set spine (#91): an order of tracks with a transition between each pair. A
// reading's functions belong to the slots, so they stay in place when tracks move. What
// happened to a transition is kept by its pair of tracks, so moving a track keeps each
// pair's history and a pair that comes back finds it again.

export type TransitionStatus = WorkStatus

/** A slot holds its track and at most this many candidates waiting beside it. */
export const MAX_ALTERNATIVES = 2

export interface SetPlan {
  readingId: string | null
  order: string[]
  /** The function of each slot, or null for a slot the reading did not give one. */
  roles: (MusicalFunction | null)[]
  /** How full each slot should be, 0..1: the reading's arc, or the DJs' once edited. */
  arc: number[]
  arcEdited: boolean
  /** Candidates waiting beside each slot's track, to swap in. */
  alternatives: string[][]
  /** Pairs someone has listened to in the Lab, by `pairKey`. */
  tried: Record<string, true>
  /** Versions, comments and picks of each pair, by `pairKey`. */
  work: Record<string, TransitionWork>
}

export interface SpineTransition {
  key: string
  from: string
  to: string
  status: TransitionStatus
  /** Who mixes it: the DJ bringing the next track in. */
  mixedBy: DjId
}

export const pairKey = (from: string, to: string) => `${from}→${to}`

/**
 * A reading's order as a plan. What the DJs did on a pair of tracks in a previous plan
 * (tried, versions, comments, picks) is keyed by the pair, so it comes along: switching
 * concepts and coming back loses nothing.
 */
export function planFromReading(reading: Reading, previous?: SetPlan): SetPlan {
  return {
    readingId: reading.id,
    order: [...reading.order],
    roles: [...reading.roles],
    arc: [...reading.arc],
    arcEdited: false,
    alternatives: reading.order.map(() => []),
    tried: { ...previous?.tried },
    work: { ...previous?.work },
  }
}

/** Moves the track at `index` by `delta` slots; the slots keep their functions and arc. */
export function moveTrack(plan: SetPlan, index: number, delta: number): SetPlan {
  const to = index + delta
  if (index < 0 || index >= plan.order.length || to < 0 || to >= plan.order.length) return plan
  const order = [...plan.order]
  const [id] = order.splice(index, 1)
  order.splice(to, 0, id!)
  return { ...plan, order }
}

/** Takes a track out, with its slot. */
export function removeTrack(plan: SetPlan, index: number): SetPlan {
  if (index < 0 || index >= plan.order.length) return plan
  return {
    ...plan,
    order: plan.order.filter((_, k) => k !== index),
    roles: plan.roles.filter((_, k) => k !== index),
    arc: plan.arc.filter((_, k) => k !== index),
    alternatives: plan.alternatives.filter((_, k) => k !== index),
  }
}

/** Adds a track from the collection at the end, in a slot without a function. */
export function addTrack(plan: SetPlan, id: string): SetPlan {
  if (unused(plan, [id]).length === 0) return plan
  return {
    ...plan,
    order: [...plan.order, id],
    roles: [...plan.roles, null],
    arc: [...plan.arc, plan.arc.at(-1) ?? 0.5],
    alternatives: [...plan.alternatives, []],
  }
}

/** Tracks the set does not use, in a slot or waiting beside one. */
export function unused(plan: SetPlan, ids: readonly string[]): string[] {
  const used = new Set([...plan.order, ...plan.alternatives.flat()])
  return ids.filter((id) => !used.has(id))
}

/** Puts a track beside a slot's track, as a candidate to swap in. */
export function addAlternative(plan: SetPlan, index: number, id: string): SetPlan {
  const alts = plan.alternatives[index]
  if (!alts || alts.length >= MAX_ALTERNATIVES || unused(plan, [id]).length === 0) return plan
  const alternatives = plan.alternatives.map((a, k) => (k === index ? [...a, id] : a))
  return { ...plan, alternatives }
}

export function removeAlternative(plan: SetPlan, index: number, id: string): SetPlan {
  const alternatives = plan.alternatives.map((a, k) =>
    k === index ? a.filter((x) => x !== id) : a,
  )
  return { ...plan, alternatives }
}

/** Swaps a waiting candidate into its slot; the track it replaces waits beside it. */
export function swapIn(plan: SetPlan, index: number, id: string): SetPlan {
  const alts = plan.alternatives[index]
  const current = plan.order[index]
  if (!alts?.includes(id) || current === undefined) return plan
  const order = plan.order.map((x, k) => (k === index ? id : x))
  const alternatives = plan.alternatives.map((a, k) =>
    k === index ? a.map((x) => (x === id ? current : x)) : a,
  )
  return { ...plan, order, alternatives }
}

export function setWork(plan: SetPlan, key: string, work: TransitionWork): SetPlan {
  return { ...plan, work: { ...plan.work, [key]: work } }
}

/** The DJs' own arc at one slot, 0..1. */
export function setArc(plan: SetPlan, index: number, value: number): SetPlan {
  if (index < 0 || index >= plan.arc.length) return plan
  const arc = [...plan.arc]
  arc[index] = Math.max(0, Math.min(1, value))
  return { ...plan, arc, arcEdited: true }
}

export function markTried(plan: SetPlan, from: string, to: string): SetPlan {
  const key = pairKey(from, to)
  return plan.tried[key] ? plan : { ...plan, tried: { ...plan.tried, [key]: true } }
}

export function transitions(plan: SetPlan, tracks: readonly TrackProfile[]): SpineTransition[] {
  const owner = new Map(tracks.map((t) => [t.id, t.owner]))
  return plan.order.slice(1).map((to, k) => {
    const from = plan.order[k]!
    const key = pairKey(from, to)
    return {
      key,
      from,
      to,
      status: workStatus(plan.work[key], plan.tried[key] === true),
      mixedBy: owner.get(to) ?? 'dj1',
    }
  })
}
