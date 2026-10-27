import { english, type Translate } from '../../i18n'
import { sectionBars, type TrackProfile } from './profile'
import { drive, type MusicalFunction } from './readings'
import type { SetPlan } from './spine'

// Hearing a reading and checking its arc (#92). "Hear the idea" plays one key moment of
// each track in the reading's order, chosen from the track's likely sections for the
// function its slot has. The arc on the spine is set against what each track measures:
// its drive (tempo and share of full bars within the collection), never its loudness.

export interface Moment {
  trackId: string
  bar: number
  role: MusicalFunction | null
  /** What the moment is there for, in words. */
  purpose: string
}

const isFull = (term: string) => term === 'GROOVE' || term === 'DROP'

/** The bar to hear in a track for a function, and why. */
export function momentFor(
  t: TrackProfile,
  role: MusicalFunction | null,
  words: Translate = english,
): Moment {
  const s = t.structure.sections
  const bars = t.structure.bars.length
  const at = (bar: number, purpose: string): Moment => ({
    trackId: t.id,
    bar: Math.max(1, Math.min(bar, Math.max(1, bars - 7))),
    role,
    purpose: words(`moment.${purpose}`),
  })
  const firstFull = s.find((x) => isFull(x.term))
  const longest = s.filter((x) => isFull(x.term)).sort((a, b) => sectionBars(b) - sectionBars(a))[0]
  const breakdown = s.find((x) => x.term === 'BREAKDOWN' || x.term === 'BUILD-UP')
  const outro = s.at(-1)?.term === 'OUTRO' ? s.at(-1) : undefined
  switch (role) {
    case 'OPEN':
      return at(1, 'opens')
    case 'BUILD':
      if (breakdown) return at(breakdown.toBar - 3, 'buildBack')
      if (firstFull && firstFull.fromBar > 1) return at(firstFull.fromBar - 4, 'wayIn')
      break
    case 'RELEASE':
      if (breakdown) return at(breakdown.fromBar - 4, 'letsGo')
      if (outro) return at(outro.fromBar - 4, 'easesOff')
      break
    case 'HANDOFF':
      if (outro) return at(outro.fromBar, 'outro')
      break
    case 'TRANSFORM': {
      const change = [...t.structure.changes].sort((a, b) => b.size - a.size)[0]
      if (change) return at(change.bar - 4, 'changes')
      break
    }
    case 'RESOLVE':
      if (outro) return at(outro.fromBar - 4, 'lands')
      return at(bars - 7, 'ends')
    default:
      break
  }
  if (longest) return at(longest.fromBar + Math.floor(sectionBars(longest) / 2) - 4, 'holds')
  return at(1, 'sounds')
}

/** One moment per slot of the set, in order. */
export function moments(
  plan: Pick<SetPlan, 'order' | 'roles'>,
  tracks: readonly TrackProfile[],
  words: Translate = english,
): Moment[] {
  const byId = new Map(tracks.map((t) => [t.id, t]))
  return plan.order.flatMap((id, k) => {
    const t = byId.get(id)
    return t ? [momentFor(t, plan.roles[k] ?? null, words)] : []
  })
}

export interface ArcPoint {
  trackId: string
  /** The arc at the slot, as a rank among the slots, 0..1. */
  arc: number
  /** The track's drive as a rank among the set's tracks, 0..1. */
  measured: number
  note: 'above' | 'below' | null
}

/** A track this far above or below the arc, both as ranks over the set, gets a note. */
export const ARC_GAP = 0.35

/** Each value's rank among the others, 0..1, ties sharing their mean rank. */
const ranks = (xs: readonly number[]) => {
  const n = xs.length
  return xs.map((x) => {
    const below = xs.filter((y) => y < x - 1e-9).length
    const equal = xs.filter((y) => Math.abs(y - x) <= 1e-9).length
    return n > 1 ? (below + (equal - 1) / 2) / (n - 1) : 0.5
  })
}

/** The arc against each track's drive, each as a rank over the set, with a note where they part. */
export function arcPoints(plan: SetPlan, tracks: readonly TrackProfile[]): ArcPoint[] {
  const used = plan.order.map((id) => tracks.find((t) => t.id === id))
  const present = used.filter((t): t is TrackProfile => t !== undefined)
  if (present.length < 2) return []
  const drives = drive(present)
  const keep = used.map((t) => t !== undefined)
  const arc = ranks(plan.arc.filter((_, k) => keep[k]))
  const measured = ranks(present.map((t) => drives.get(t.id)!))
  return present.map((t, k) => {
    const gap = measured[k]! - arc[k]!
    return {
      trackId: t.id,
      arc: arc[k]!,
      measured: measured[k]!,
      note: gap > ARC_GAP ? 'above' : gap < -ARC_GAP ? 'below' : null,
    }
  })
}
