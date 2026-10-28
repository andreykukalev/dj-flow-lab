import { describe, expect, it } from 'vitest'
import { longBlendPlan } from '../plan/longBlend'
import { grid } from '../test-helpers'
import { track } from './fixtures'
import { readings } from './readings'
import {
  addAlternative,
  markTried,
  moveTrack,
  pairKey,
  planFromReading,
  removeAlternative,
  setWork,
  swapIn,
  transitions,
  unused,
} from './spine'
import {
  addComment,
  addVersion,
  agreed,
  describeState,
  emptyWork,
  markHeard,
  pick,
  removeVersion,
  unheard,
  workStatus,
  type LabState,
} from './versions'

const STATE: LabState = {
  points: { exitBarA: 49, entryBarB: 17 },
  area: { beforeBars: 16, afterBars: 16, linked: true },
  loop: null,
  takes: [],
  grids: { A: grid(122, 0), B: grid(124, 0) },
}

const PLAN = longBlendPlan(
  {
    A: { trackFingerprint: 'a', grid: STATE.grids.A },
    B: { trackFingerprint: 'b', grid: STATE.grids.B },
  },
  STATE.points,
)
const version = (id: string, author: 'dj1' | 'dj2') => ({
  id,
  name: id,
  author,
  state: STATE,
  plan: PLAN,
})

describe('versions and picks', () => {
  it('moves a transition from tried to versions to agreed', () => {
    let w = emptyWork()
    expect(workStatus(undefined, false)).toBe('not tried')
    expect(workStatus(w, true)).toBe('tried')
    w = addVersion(w, version('v1', 'dj1'))
    expect(workStatus(w, false)).toBe('suggested')
    w = addVersion(w, version('v2', 'dj2'))
    expect(workStatus(w, true)).toBe('versions to choose between')
    w = pick(w, 'dj1', { choice: 'v1', reason: 'the bass swap lands on the vocal' })
    expect(agreed(w)).toBeNull()
    w = pick(w, 'dj2', { choice: 'v2', reason: 'longer' })
    expect(workStatus(w, true)).toBe('versions to choose between')
    w = pick(w, 'dj2', { choice: 'v1', reason: 'fine, yours' })
    expect(agreed(w)).toBe('v1')
    expect(workStatus(w, true)).toBe('agreed by both')
  })

  it('agrees on keeping both to choose on the night', () => {
    let w = addVersion(addVersion(emptyWork(), version('v1', 'dj1')), version('v2', 'dj2'))
    w = pick(pick(w, 'dj1', { choice: 'both', reason: '' }), 'dj2', { choice: 'both', reason: '' })
    expect(agreed(w)).toBe('both')
    expect(workStatus(w, true)).toBe('keep both')
  })

  it('knows which versions each DJ still has to hear', () => {
    let w = addVersion(emptyWork(), { ...version('v1', 'dj1'), heardBy: ['dj1'] })
    w = addVersion(w, version('v2', 'dj2'))
    expect(unheard(w, 'dj2').map((v) => v.id)).toEqual(['v1'])
    expect(unheard(w, 'dj1').map((v) => v.id)).toEqual(['v2'])
    w = markHeard(w, 'v1', 'dj2')
    expect(unheard(w, 'dj2')).toEqual([])
    expect(markHeard(w, 'v1', 'dj2')).toEqual(w)
    expect(unheard(undefined, 'dj1')).toEqual([])
  })

  it('drops the picks of a removed version', () => {
    let w = addVersion(addVersion(emptyWork(), version('v1', 'dj1')), version('v2', 'dj2'))
    w = pick(pick(w, 'dj1', { choice: 'v1', reason: '' }), 'dj2', { choice: 'v2', reason: '' })
    w = removeVersion(w, 'v1')
    expect(w.versions.map((v) => v.id)).toEqual(['v2'])
    expect(w.picks).toEqual({ dj2: { choice: 'v2', reason: '' } })
    expect(pick(w, 'dj2', null).picks).toEqual({})
  })

  it('keeps comments in bar order', () => {
    let w = addComment(emptyWork(), { id: 'c1', author: 'dj1', bar: 57, text: 'too long' })
    w = addComment(w, { id: 'c2', author: 'dj2', bar: 49, text: 'swap here' })
    expect(w.comments.map((c) => c.bar)).toEqual([49, 57])
  })

  it('describes what a version holds', () => {
    expect(describeState(STATE)).toBe('Blend start A 49.1 with B 17.1 · 16 + 16 bars')
    expect(
      describeState({
        ...STATE,
        loop: { deck: 'B', side: 'before', bars: 4, passes: 2, gapBars: 0 },
        takes: [{ control: 'A.low', points: [] } as never],
      }),
    ).toBe('Blend start A 49.1 with B 17.1 · 16 + 16 bars · loop on B · 1 take')
  })
})

describe('alternatives and work on the spine', () => {
  const tracks = ['a1', 'a2', 'a3', 'b1'].map((id, k) =>
    track(id, k % 2 ? 'dj2' : 'dj1', 'deep', 120 + k),
  )
  const base = planFromReading(readings(tracks.slice(0, 3), [])[0]!)

  it('waits beside a slot and swaps in one action', () => {
    expect(unused(base, ['a1', 'a2', 'a3', 'b1'])).toEqual(['b1'])
    const withAlt = addAlternative(base, 1, 'b1')
    expect(withAlt.alternatives[1]).toEqual(['b1'])
    expect(unused(withAlt, ['b1'])).toEqual([])
    expect(addAlternative(withAlt, 0, 'b1')).toBe(withAlt) // already used
    const swapped = swapIn(withAlt, 1, 'b1')
    expect(swapped.order[1]).toBe('b1')
    expect(swapped.alternatives[1]).toEqual([base.order[1]])
    expect(swapIn(swapped, 1, 'b1')).toBe(swapped)
    expect(removeAlternative(swapped, 1, base.order[1]!).alternatives[1]).toEqual([])
    // Alternatives belong to the slot.
    expect(moveTrack(withAlt, 1, -1).alternatives).toEqual(withAlt.alternatives)
  })

  it('shows each pair’s status from its work, by pair', () => {
    const [a, b] = base.order
    const key = pairKey(a!, b!)
    let plan = markTried(base, a!, b!)
    let work = addVersion(addVersion(emptyWork(), version('v1', 'dj1')), version('v2', 'dj2'))
    plan = setWork(plan, key, work)
    expect(transitions(plan, tracks)[0]!.status).toBe('versions to choose between')
    work = pick(pick(work, 'dj1', { choice: 'v2', reason: '' }), 'dj2', {
      choice: 'v2',
      reason: '',
    })
    plan = setWork(plan, key, work)
    expect(transitions(plan, tracks)[0]!.status).toBe('agreed by both')
    expect(transitions(moveTrack(plan, 0, 1), tracks)[1]?.status).not.toBe('agreed by both')
  })
})
