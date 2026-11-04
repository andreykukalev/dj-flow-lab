import { describe, expect, it } from 'vitest'
import { ru } from '../../i18n/ru'
import { translator } from '../../i18n'
import { track } from './fixtures'
import {
  camelotText,
  flowOrder,
  keyGrade,
  keyRelation,
  orderFits,
  pairFit,
  parseKey,
  tempoStep,
} from './fit'
import { drive, type TrackProfile } from './profile'

const key = (text: string) => {
  const k = parseKey(text)
  return k ? camelotText(k) : null
}

const withKey = (t: TrackProfile, k?: string): TrackProfile => (k ? { ...t, key: k } : t)

describe('keys', () => {
  it('reads Camelot, Open Key and musical names', () => {
    expect(key('8A')).toBe('8A')
    expect(key('08b')).toBe('8B')
    expect(key('12A')).toBe('12A')
    expect(key('1m')).toBe('8A') // Open Key 1m is A minor
    expect(key('1d')).toBe('8B')
    expect(key('Am')).toBe('8A')
    expect(key('A minor')).toBe('8A')
    expect(key('C')).toBe('8B')
    expect(key('Cmaj')).toBe('8B')
    expect(key('Em')).toBe('9A')
    expect(key('F#m')).toBe('11A')
    expect(key('F♯m')).toBe('11A')
    expect(key('Gbm')).toBe('11A')
    expect(key('Bb')).toBe('6B')
    expect(key('Abm')).toBe('1A')
    expect(key('B')).toBe('1B')
    expect(key('Dbm')).toBe('12A')
    expect(key('E')).toBe('12B')
    expect(key('13A')).toBeNull()
    expect(key('H')).toBeNull()
    expect(key('')).toBeNull()
  })

  it('names the relation on the wheel and grades it', () => {
    const rel = (a: string, b: string) => keyRelation(parseKey(a), parseKey(b))
    expect(rel('8A', '8A')).toBe('same')
    expect(rel('8A', '9A')).toBe('neighbour')
    expect(rel('12A', '1A')).toBe('neighbour')
    expect(rel('8A', '8B')).toBe('relative')
    expect(rel('8A', '9B')).toBe('diagonal')
    expect(rel('8A', '10A')).toBe('twoSteps')
    expect(rel('8A', '3A')).toBe('semitone') // A minor → B♭ minor
    expect(rel('8A', '2A')).toBe('clash')
    expect(rel('8A', 'x')).toBe('unknown')
    expect(keyGrade('neighbour')).toBe('compatible')
    expect(keyGrade('diagonal')).toBe('workable')
    expect(keyGrade('clash')).toBe('clash')
  })
})

describe('tempo steps', () => {
  it('grades a step by how far B is stretched', () => {
    expect(tempoStep(124, 125).grade).toBe('close')
    expect(tempoStep(124, 129).grade).toBe('stretch')
    expect(tempoStep(124, 140).grade).toBe('jump')
    expect(tempoStep(87, 174).grade).toBe('double')
    expect(tempoStep(100, 103).percent).toBeCloseTo(3)
  })
})

describe('pair fit', () => {
  const deep = (id: string, bpm: number, k?: string) => withKey(track(id, 'dj1', 'deep', bpm), k)
  const tool = (id: string, bpm: number, k?: string) => withKey(track(id, 'dj1', 'tool', bpm), k)

  it('suggests a long EQ blend for close tempos, compatible keys and long intros and outros', () => {
    const [a, b] = [deep('a', 124, '8A'), deep('b', 125, '9A')]
    const fit = pairFit(a, b, drive([a, b]))
    expect(fit.room.out).toBeGreaterThanOrEqual(16)
    expect(fit.room.in).toBeGreaterThanOrEqual(16)
    expect(fit).toMatchObject({ grade: 'smooth', technique: 'longBlend' })
    expect(fit.cautions).toEqual([])
  })

  it('keeps the melodies apart when the keys clash, and cuts on a tempo jump', () => {
    const [a, b, c] = [deep('a', 124, '8A'), deep('b', 124, '2A'), deep('c', 140, '8A')]
    const drives = drive([a, b, c])
    expect(pairFit(a, b, drives)).toMatchObject({ grade: 'tricky', technique: 'midSwap' })
    const jump = pairFit(a, c, drives)
    expect(jump).toMatchObject({ grade: 'tricky', technique: 'cut' })
    expect(jump.cautions.join(' ')).toContain('key lock')
  })

  it('loops the side that has no room, and says when keys are missing', () => {
    const [a, b] = [deep('a', 124), tool('b', 124)]
    const drives = drive([a, b])
    const intoTool = pairFit(a, b, drives)
    expect(intoTool.room.in).toBe(0)
    expect(intoTool.technique).toBe('loopIntro')
    expect(intoTool.keys.grade).toBe('unknown')
    expect(intoTool.cautions[0]).toContain('Keys are not typed')
    expect(pairFit(b, a, drives).technique).toBe('loopOutro')
  })

  it('speaks Russian when asked', () => {
    const [a, b] = [deep('a', 124, '8A'), deep('b', 125, '9A')]
    const fit = pairFit(a, b, drive([a, b]), translator('ru', ru))
    expect(fit.reasons[0]).toContain('Темп +0.8%')
    expect(fit.reasons[1]).toContain('8A → 9A')
  })
})

describe('the order that flows', () => {
  it('puts neighbours in compatible keys and close tempos next to each other', () => {
    const tracks = [
      withKey(track('t1', 'dj1', 'deep', 128), '10A'),
      withKey(track('t2', 'dj1', 'deep', 122), '8A'),
      withKey(track('t3', 'dj1', 'deep', 126), '9A'),
      withKey(track('t4', 'dj1', 'deep', 124), '8A'),
      withKey(track('t5', 'dj1', 'deep', 123), '3A'),
    ]
    const order = flowOrder(tracks)
    expect(new Set(order).size).toBe(5)
    const fits = orderFits(order, tracks)
    // Every step is close in tempo, and no more than one pair is in clashing keys.
    expect(fits.filter((f) => f.tempo.grade === 'jump')).toHaveLength(0)
    expect(fits.filter((f) => f.keys.grade === 'clash').length).toBeLessThanOrEqual(1)
    // A rising set: it opens slower than it ends.
    const bpm = new Map(tracks.map((t) => [t.id, t.grid.bpm]))
    expect(bpm.get(order[0]!)!).toBeLessThan(bpm.get(order.at(-1)!)!)
  })

  it('keeps the opener when one is given', () => {
    const tracks = [124, 122, 126, 128].map((bpm, k) => track(`t${k}`, 'dj1', 'deep', bpm))
    expect(flowOrder(tracks, 't3')[0]).toBe('t3')
    expect(flowOrder(tracks)).toEqual(['t1', 't0', 't2', 't3'])
  })
})
