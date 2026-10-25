import type { DjId, TrackProfile } from './profile'
import type { MusicalFunction, Reading } from './readings'

// The set spine (#91): an order of tracks with a transition between each pair. A
// reading's functions belong to the slots, so they stay in place when tracks move. What
// happened to a transition is kept by its pair of tracks, so moving a track keeps each
// pair's history and a pair that comes back finds it again.

export type TransitionStatus = 'not tried' | 'tried'

export interface SetPlan {
  readingId: string | null
  order: string[]
  /** The function of each slot, or null for a slot the reading did not give one. */
  roles: (MusicalFunction | null)[]
  /** Pairs someone has listened to in the Lab, by `pairKey`. */
  tried: Record<string, true>
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

export function planFromReading(reading: Reading): SetPlan {
  return { readingId: reading.id, order: [...reading.order], roles: [...reading.roles], tried: {} }
}

/** Moves the track at `index` by `delta` slots; the slots keep their functions. */
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
  }
}

/** Adds a track from the collection at the end, in a slot without a function. */
export function addTrack(plan: SetPlan, id: string): SetPlan {
  if (plan.order.includes(id)) return plan
  return { ...plan, order: [...plan.order, id], roles: [...plan.roles, null] }
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
      status: plan.tried[key] ? 'tried' : 'not tried',
      mixedBy: owner.get(to) ?? 'dj1',
    }
  })
}
