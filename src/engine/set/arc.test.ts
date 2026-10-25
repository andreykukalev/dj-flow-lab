import { describe, expect, it } from 'vitest'
import { arcPoints, momentFor, moments } from './arc'
import { track } from './fixtures'
import { observe } from './observations'
import { readings } from './readings'
import { addTrack, moveTrack, planFromReading, removeTrack, setArc } from './spine'

const COLLECTION = [
  track('a1', 'dj1', 'deep', 122),
  track('a2', 'dj1', 'lift', 124),
  track('a3', 'dj1', 'tool', 126),
  track('b1', 'dj2', 'deep', 123),
  track('b2', 'dj2', 'peak', 128),
  track('b3', 'dj2', 'tool', 140),
]

describe('moments', () => {
  const peak = COLLECTION[4]! // INTRO 1-16, GROOVE 17-32, BREAKDOWN 33-40, BUILD-UP 41-48, DROP 49-56 …

  it('picks the bars that fit each function', () => {
    expect(momentFor(peak, 'OPEN')).toMatchObject({ bar: 1, purpose: 'how it opens' })
    expect(momentFor(peak, 'RELEASE').bar).toBe(29)
    expect(momentFor(peak, 'BUILD').bar).toBe(37)
    expect(momentFor(peak, 'HANDOFF').bar).toBe(65)
    expect(momentFor(peak, 'RESOLVE').bar).toBe(61)
    const deep = COLLECTION[0]! // INTRO 1-16, GROOVE 17-64, OUTRO 65-80
    expect(momentFor(deep, 'HOLD')).toMatchObject({ bar: 37, purpose: 'the state it holds' })
  })

  it('stays inside the track with 8 bars to play', () => {
    for (const t of COLLECTION)
      for (const role of [
        'OPEN',
        'BUILD',
        'HOLD',
        'RELEASE',
        'HANDOFF',
        'TRANSFORM',
        'RESOLVE',
      ] as const) {
        const m = momentFor(t, role)
        expect(m.bar).toBeGreaterThanOrEqual(1)
        expect(m.bar + 7).toBeLessThanOrEqual(t.structure.bars.length)
      }
  })

  it('gives one moment per slot, in the set’s order', () => {
    const plan = planFromReading(readings(COLLECTION, [])[0]!)
    const ms = moments(plan, COLLECTION)
    expect(ms.map((m) => m.trackId)).toEqual(plan.order)
    expect(ms.map((m) => m.role)).toEqual(plan.roles)
  })
})

describe('the arc', () => {
  const all = readings(COLLECTION, observe(COLLECTION))

  it('comes with every reading, one value per slot', () => {
    for (const r of all) {
      expect(r.arc).toHaveLength(r.order.length)
      for (const v of r.arc) expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('follows the slots, and becomes the DJs’ own once edited', () => {
    const plan = planFromReading(all.find((r) => r.id === 'steady-climb')!)
    expect(plan.arcEdited).toBe(false)
    expect(moveTrack(plan, 0, 1).arc).toEqual(plan.arc)
    expect(removeTrack(plan, 0).arc).toEqual(plan.arc.slice(1))
    const edited = setArc(removeTrack(plan, 0), 0, 2)
    expect(edited).toMatchObject({ arcEdited: true })
    expect(edited.arc[0]).toBe(1)
    expect(addTrack(edited, plan.order[0]!).arc.at(-1)).toBe(edited.arc.at(-1))
  })

  it('matches a reading’s own order, and notes a track set clearly against it', () => {
    const plan = planFromReading(all.find((r) => r.id === 'steady-climb')!)
    expect(arcPoints(plan, COLLECTION).every((p) => p.note === null)).toBe(true)
    // The fastest, fullest track moved to the start, where the arc is low.
    const fastest = plan.order.indexOf('b3')
    const moved = moveTrack(plan, fastest, -fastest)
    const points = arcPoints(moved, COLLECTION)
    expect(points[0]).toMatchObject({ trackId: 'b3', note: 'above' })
  })
})
