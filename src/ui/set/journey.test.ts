import { describe, expect, it } from 'vitest'
import { track } from '../../engine/set/fixtures'
import { readings } from '../../engine/set/readings'
import { planFromReading, markTried, pairKey, setWork } from '../../engine/set/spine'
import { addVersion, emptyWork, pick } from '../../engine/set/versions'
import { translatorFor } from '../../i18n'
import { journey } from './journey'

const en = translatorFor('en')
const ru = translatorFor('ru')

const TRACKS = [
  track('a1', 'dj1', 'deep', 122),
  track('b1', 'dj2', 'deep', 123),
  track('a2', 'dj1', 'tool', 126),
]
const ready = (profiles: typeof TRACKS) => profiles.map(() => ({ status: 'ready' as const }))

describe('the journey bar', () => {
  it('starts with only Your music open', () => {
    const steps = journey(
      { tracks: [], profiles: [], reading: null, readings: 0, plan: null, lab: null },
      en,
    )
    expect(steps.map((s) => s.enabled)).toEqual([true, false, false, false, false])
    expect(steps.map((s) => s.state)).toEqual([
      'Add tracks from both of you',
      'needs two ready tracks',
      'choose a concept first',
      'opens from a transition on the set',
      'needs a set',
    ])
  })

  it('counts tracks as they are analysed and when their files are missing', () => {
    const one = journey(
      {
        tracks: [{ status: 'ready' }, { status: 'analysing' }, { status: 'waiting' }],
        profiles: TRACKS.slice(0, 1),
        reading: null,
        readings: 0,
        plan: null,
        lab: null,
      },
      en,
    )
    expect(one[0]!.state).toBe('Analysing 2…')
    const missing = journey(
      {
        tracks: [{ status: 'ready' }, { status: 'missing' }],
        profiles: TRACKS.slice(0, 2),
        reading: null,
        readings: 1,
        plan: null,
        lab: null,
      },
      ru,
    )
    expect(missing[0]!.state).toBe('1 ждёт файл')
    expect(missing[1]!).toMatchObject({ enabled: true, state: '1 прочтение — послушайте' })
  })

  it('follows the set, the Lab and the decisions', () => {
    const reading = readings(TRACKS, [], en).at(-1)!
    let plan = planFromReading(reading)
    const [t1, t2] = [
      pairKey(plan.order[0]!, plan.order[1]!),
      pairKey(plan.order[1]!, plan.order[2]!),
    ]
    const base = { tracks: ready(TRACKS), profiles: TRACKS, reading, readings: 1, lab: null }
    let steps = journey({ ...base, plan }, en)
    expect(steps[1]!.state).toBe('A Steady Climb chosen')
    expect(steps[2]!).toMatchObject({ enabled: true, state: '3 tracks · 2 transitions' })
    expect(steps[3]!).toMatchObject({ enabled: true, state: '0 of 2 tried' })
    expect(steps[4]!).toMatchObject({ enabled: true, state: '2 without a version' })

    plan = markTried(plan, plan.order[0]!, plan.order[1]!)
    steps = journey({ ...base, plan, lab: { from: '', to: '', index: 1 } }, ru)
    expect(steps[1]!.state).toBe('Выбрано: Ровный подъём')
    expect(steps[3]!.state).toBe('Переход 2 из 2')

    const version = {
      id: 'v1',
      name: 'one',
      author: 'dj1' as const,
      state: {} as never,
      plan: {} as never,
    }
    const agreedWork = pick(
      pick(addVersion(emptyWork(), version), 'dj1', { choice: 'v1', reason: '' }),
      'dj2',
      {
        choice: 'v1',
        reason: '',
      },
    )
    plan = setWork(setWork(plan, t1, agreedWork), t2, addVersion(emptyWork(), version))
    steps = journey({ ...base, plan }, en)
    expect(steps[3]!.state).toBe('2 of 2 tried')
    expect(steps[4]!.state).toBe('1 of 2 agreed')
  })
})
