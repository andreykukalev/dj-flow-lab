import type { BeatGrid, TransitionPoints } from '../model'
import type { AreaRequest } from '../plan/area'
import type { LoopRequest } from '../plan/loop'
import type { Take } from '../plan/take'
import type { TransitionPlanV1 } from '../plan/types'
import { english, type Translate } from '../../i18n'
import type { DjId } from './profile'

// Versions of a transition and the decision on them (#93, #94). A version is what was
// playing in the Lab when one of the two DJs saved it: the blend start, the area, the
// loop and the takes, on the two grids. Each DJ can pick a version with a reason, or keep
// two to choose on the night; the transition is agreed only when both pick the same.
// The app never picks.

export interface LabState {
  points: TransitionPoints
  area: AreaRequest
  loop: LoopRequest | null
  takes: Take[]
  grids: { A: BeatGrid; B: BeatGrid }
}

export interface TransitionVersion {
  id: string
  name: string
  author: DjId
  state: LabState
  /** The plan that played, takes included: what the set sheet and export are made from. */
  plan: TransitionPlanV1
  /** Who has listened to it; the author from the start. Absent in older saved sets. */
  heardBy?: DjId[]
}

export interface BarComment {
  id: string
  author: DjId
  /** Bar of the outgoing track the comment is pinned to. */
  bar: number
  text: string
}

/** A version's id, or keeping the versions to choose on the night. */
export type Choice = string | 'both'

export interface Pick {
  choice: Choice
  reason: string
}

export interface TransitionWork {
  versions: TransitionVersion[]
  comments: BarComment[]
  picks: Partial<Record<DjId, Pick>>
}

/**
 * Where a transition stands, in one vocabulary for the set, the Lab and the sheet: nobody
 * has listened; tried; one DJ saved a version; two or more to choose between; the same
 * one picked by both; or both kept to choose on the night.
 */
export type WorkStatus =
  | 'not tried'
  | 'tried'
  | 'suggested'
  | 'versions to choose between'
  | 'agreed by both'
  | 'keep both'

export const emptyWork = (): TransitionWork => ({ versions: [], comments: [], picks: {} })

export function addVersion(work: TransitionWork, version: TransitionVersion): TransitionWork {
  return { ...work, versions: [...work.versions, version] }
}

/** Removes a version and any pick of it. */
export function removeVersion(work: TransitionWork, id: string): TransitionWork {
  const picks = Object.fromEntries(
    Object.entries(work.picks).filter(([, p]) => p.choice !== id),
  ) as TransitionWork['picks']
  return { ...work, versions: work.versions.filter((v) => v.id !== id), picks }
}

export function addComment(work: TransitionWork, comment: BarComment): TransitionWork {
  const comments = [...work.comments, comment].sort((a, b) => a.bar - b.bar)
  return { ...work, comments }
}

export function pick(work: TransitionWork, dj: DjId, value: Pick | null): TransitionWork {
  const picks = { ...work.picks }
  if (value) picks[dj] = value
  else delete picks[dj]
  return { ...work, picks }
}

/** Both DJs' common choice, or null while they differ or one has not picked. */
export function agreed(work: TransitionWork): Choice | null {
  const a = work.picks.dj1?.choice
  const b = work.picks.dj2?.choice
  return a !== undefined && a === b ? a : null
}

export function workStatus(work: TransitionWork | undefined, tried: boolean): WorkStatus {
  const both = work ? agreed(work) : null
  if (both === 'both') return 'keep both'
  if (both !== null) return 'agreed by both'
  if (work && work.versions.length >= 2) return 'versions to choose between'
  if (work && work.versions.length === 1) return 'suggested'
  return tried ? 'tried' : 'not tried'
}

/** `dj` has listened to the version. */
export function markHeard(work: TransitionWork, id: string, dj: DjId): TransitionWork {
  return {
    ...work,
    versions: work.versions.map((v) =>
      v.id !== id || v.heardBy?.includes(dj) ? v : { ...v, heardBy: [...(v.heardBy ?? []), dj] },
    ),
  }
}

/** The other DJ's versions that `dj` has not listened to yet: what needs auditioning. */
export function unheard(work: TransitionWork | undefined, dj: DjId): TransitionVersion[] {
  return (work?.versions ?? []).filter((v) => v.author !== dj && !v.heardBy?.includes(dj))
}

/** "Blend start A 49.1 with B 17.1 · 16 + 16 bars · loop on B · 2 takes" */
export function describeState(s: LabState, t: Translate = english): string {
  const at = (bar: number, beat = 1) => `${bar}.${beat}`
  const parts = [
    t('versions.describe', {
      a: at(s.points.exitBarA, s.points.exitBeatA),
      b: at(s.points.entryBarB, s.points.entryBeatB),
    }),
    t('versions.bars', { before: s.area.beforeBars, after: s.area.afterBars }),
  ]
  if (s.loop) parts.push(t('versions.loop', { deck: s.loop.deck }))
  if (s.takes.length > 0) parts.push(t('versions.takes', { n: s.takes.length }))
  return parts.join(' · ')
}
