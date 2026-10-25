import { describe, expect, it } from 'vitest'
import { arrangement, full, SR } from '../analysis/arrangement'
import { track } from './fixtures'
import { observe } from './observations'
import { analyseAudio, fullShare, shape, structureOn } from './profile'
import { MAX_SLOTS, readings, rolesFor } from './readings'
import {
  addTrack,
  markTried,
  moveTrack,
  pairKey,
  planFromReading,
  removeTrack,
  transitions,
} from './spine'

const COLLECTION = [
  track('a1', 'dj1', 'deep', 122),
  track('a2', 'dj1', 'lift', 124),
  track('a3', 'dj1', 'tool', 126),
  track('b1', 'dj2', 'deep', 123),
  track('b2', 'dj2', 'peak', 128),
  track('b3', 'dj2', 'tool', 140),
]
const NAMES = { dj1: 'Andrei', dj2: 'Lena' }

describe('track profiles', () => {
  it('estimates a likely grid and the structure from the audio alone', () => {
    const audio = arrangement([
      { bars: 16, kick: true, bass: false, hats: false },
      { bars: 32, ...full },
    ])
    const f = analyseAudio([audio], SR)
    expect(f.tempo).toBe('likely')
    expect(Math.abs(f.grid.bpm - 120)).toBeLessThan(0.1)
    const { structure } = structureOn(f.frames, f.grid, f.tempo)
    expect(structure.sections.map((s) => s.term)).toEqual(['INTRO', 'GROOVE'])
  })

  it('moves the phrase lines of a likely grid, never of the DJ’s', () => {
    const audio = arrangement([
      { bars: 20, kick: true, bass: false, hats: false },
      { bars: 16, ...full },
      { bars: 8, kick: false, bass: false, hats: false },
      { bars: 16, ...full },
    ])
    const f = analyseAudio([audio], SR)
    const likely = structureOn(f.frames, { ...f.grid, anchorSec: 0 }, 'likely')
    expect(likely.grid.phraseOffsetBars).toBe(4)
    const yours = structureOn(f.frames, { ...f.grid, anchorSec: 0 }, 'yours')
    expect(yours.grid.phraseOffsetBars).toBe(0)
  })

  it('draws the shape relative to the track itself', () => {
    const t = track('x', 'dj1', 'deep', 120)
    const s = shape(t, 10)
    expect(s).toHaveLength(10)
    expect(Math.max(...s)).toBeGreaterThan(0.95)
    expect(s[0]!).toBeLessThan(s[5]!)
    expect(fullShare(track('t', 'dj1', 'tool', 120))).toBe(1)
  })
})

describe('observe', () => {
  const obs = observe(COLLECTION, NAMES)
  const byKind = (kind: string) => obs.find((o) => o.kind === kind)

  it('finds tracks close in tempo, and leaves out the one far away', () => {
    const t = byKind('tempo-neighbours')!
    expect(t.layer).toBe('measured')
    expect(t.trackIds).toEqual(['a1', 'b1', 'a2', 'a3', 'b2'])
    expect(t.detail).toMatch(/122\.0 to 128\.0 BPM/)
  })

  it('finds steady grooves, breakdowns with a return, late lifts and room to mix', () => {
    expect(byKind('steady-groove')!.trackIds).toEqual(['a1', 'a3', 'b1', 'b3'])
    expect(byKind('breakdown-return')!.trackIds).toEqual(['b2'])
    expect(byKind('late-lift')!.trackIds).toEqual(['a2'])
    expect(byKind('room-to-mix')!.trackIds).toEqual(['a1', 'a2', 'b1', 'b2'])
  })

  it('pairs the closest tracks across the two DJs', () => {
    const p = byKind('pair-across')!
    expect(p.trackIds).toEqual(['a1', 'b1'])
    expect(p.detail).toContain('(Andrei)')
    expect(p.detail).toContain('(Lena)')
  })

  it('gives every observation its tracks and a bar to hear, and never claims vocals, melody or key', () => {
    for (const o of obs) {
      expect(o.trackIds.length).toBeGreaterThan(0)
      expect(o.hear.length).toBeGreaterThan(0)
      for (const h of o.hear) {
        expect(o.trackIds).toContain(h.trackId)
        expect(h.bar).toBeGreaterThanOrEqual(1)
      }
      expect(`${o.title} ${o.detail}`).not.toMatch(/vocal|melod|key|harmon/i)
    }
  })

  it('has nothing to say about fewer than two tracks', () => {
    expect(observe(COLLECTION.slice(0, 1))).toEqual([])
  })

  it('pairs across only with tracks from both DJs', () => {
    expect(observe(COLLECTION.filter((t) => t.owner === 'dj1')).map((o) => o.kind)).not.toContain(
      'pair-across',
    )
  })
})

describe('readings', () => {
  it('offers each reading only with its evidence, and the fallback always', () => {
    const obs = observe(COLLECTION, NAMES)
    const all = readings(COLLECTION, obs)
    expect(all.map((r) => r.id)).toEqual([
      'into-the-unknown',
      'hidden-euphoria',
      'two-rooms',
      'pressure-and-breath',
      'steady-climb',
    ])
    for (const r of all) {
      expect(r.layer).toBe('interpretation')
      for (const w of r.why) expect(obs.map((o) => o.id)).toContain(w.observationId)
    }
    // Without the two DJs' pair or the late lifts, those readings are not offered.
    const fewer = readings(
      COLLECTION,
      obs.filter((o) => o.kind !== 'pair-across' && o.kind !== 'late-lift'),
    )
    expect(fewer.map((r) => r.id)).toEqual([
      'into-the-unknown',
      'pressure-and-breath',
      'steady-climb',
    ])
    expect(readings(COLLECTION, []).map((r) => r.id)).toEqual(['steady-climb'])
  })

  it('orders every track once, with a function per slot and the count per DJ', () => {
    for (const r of readings(COLLECTION, observe(COLLECTION, NAMES))) {
      expect([...r.order].sort()).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
      expect(r.roles).toHaveLength(6)
      expect(r.roles[0]).toBe(r.functions[0])
      expect(r.roles.at(-1)).toBe(r.functions.at(-1))
      expect(r.uses).toEqual({ dj1: 3, dj2: 3 })
    }
  })

  it('climbs from the track that drives least and alternates the DJs in two rooms', () => {
    const all = readings(COLLECTION, observe(COLLECTION, NAMES))
    const climb = all.find((r) => r.id === 'steady-climb')!
    expect(climb.order[0]).toBe('a2') // the slowest-but-one, and the least full
    expect(climb.order.at(-2)).toBe('b3')
    const rooms = all.find((r) => r.id === 'two-rooms')!
    expect(rooms.order).toEqual(['a1', 'b1', 'a2', 'b2', 'a3', 'b3'])
  })

  it('uses at most MAX_SLOTS tracks of a large collection', () => {
    const many = Array.from({ length: 15 }, (_, k) =>
      track(`t${k}`, k % 2 ? 'dj2' : 'dj1', (['deep', 'lift', 'tool'] as const)[k % 3]!, 120 + k),
    )
    for (const r of readings(many, observe(many))) {
      expect(r.order).toHaveLength(MAX_SLOTS)
      expect(new Set(r.order).size).toBe(MAX_SLOTS)
    }
  })

  it('spreads the functions over the slots', () => {
    expect(rolesFor(['OPEN', 'BUILD', 'RESOLVE'], 5)).toEqual([
      'OPEN',
      'BUILD',
      'BUILD',
      'RESOLVE',
      'RESOLVE',
    ])
    expect(rolesFor(['OPEN', 'RESOLVE'], 1)).toEqual(['OPEN'])
  })
})

describe('the set spine', () => {
  const reading = readings(COLLECTION, [])[0]!
  const plan = planFromReading(reading)

  it('keeps each transition’s status by its pair when tracks move', () => {
    const [a, b, c] = plan.order
    const tried = markTried(plan, a!, b!)
    expect(transitions(tried, COLLECTION)[0]).toMatchObject({
      key: pairKey(a!, b!),
      status: 'tried',
    })
    const moved = moveTrack(tried, 2, -2) // c, a, b
    expect(moved.order.slice(0, 3)).toEqual([c, a, b])
    const t = transitions(moved, COLLECTION)
    expect(t[0]).toMatchObject({ from: c, to: a, status: 'not tried' })
    expect(t[1]).toMatchObject({ from: a, to: b, status: 'tried' })
    expect(moved.roles).toEqual(plan.roles)
  })

  it('has the DJ bringing the next track in mix each transition', () => {
    for (const t of transitions(plan, COLLECTION))
      expect(t.mixedBy).toBe(COLLECTION.find((x) => x.id === t.to)!.owner)
  })

  it('removes a slot and adds a track at the end without a function', () => {
    const removed = removeTrack(plan, 0)
    expect(removed.order).toEqual(plan.order.slice(1))
    expect(removed.roles).toEqual(plan.roles.slice(1))
    const added = addTrack(removed, plan.order[0]!)
    expect(added.order.at(-1)).toBe(plan.order[0])
    expect(added.roles.at(-1)).toBeNull()
    expect(addTrack(added, plan.order[0]!)).toBe(added)
    expect(moveTrack(plan, 0, -1)).toBe(plan)
  })
})
