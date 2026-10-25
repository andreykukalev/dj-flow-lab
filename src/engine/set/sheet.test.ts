import { describe, expect, it } from 'vitest'
import { longBlendPlan } from '../plan/longBlend'
import { track } from './fixtures'
import { readings } from './readings'
import { fileLocation, rekordboxXml } from './rekordbox'
import { clock, deckOf, setSheet } from './sheet'
import { pairKey, planFromReading, setWork, type SetPlan } from './spine'
import { addVersion, emptyWork, pick, type TransitionVersion } from './versions'

const TRACKS = [
  track('a1', 'dj1', 'deep', 122),
  track('b1', 'dj2', 'deep', 123),
  track('a2', 'dj1', 'tool', 124),
]

function version(id: string, from: string, to: string, exitBarA: number): TransitionVersion {
  const a = TRACKS.find((t) => t.id === from)!
  const b = TRACKS.find((t) => t.id === to)!
  const points = { exitBarA, entryBarB: 17 }
  const plan = longBlendPlan(
    { A: { trackFingerprint: from, grid: a.grid }, B: { trackFingerprint: to, grid: b.grid } },
    points,
  )
  return {
    id,
    name: id,
    author: 'dj1',
    plan,
    state: {
      points,
      area: { beforeBars: 0, afterBars: 32, linked: false },
      loop: null,
      takes: [],
      grids: { A: a.grid, B: b.grid },
    },
  }
}

function plan(): SetPlan {
  let p = planFromReading(readings(TRACKS, [])[0]!)
  p = { ...p, order: ['a1', 'b1', 'a2'] }
  let work = addVersion(emptyWork(), version('v1', 'a1', 'b1', 49))
  work = addVersion(work, version('v2', 'a1', 'b1', 57))
  work = pick(pick(work, 'dj1', { choice: 'v1', reason: '' }), 'dj2', { choice: 'v1', reason: '' })
  return setWork(p, pairKey('a1', 'b1'), work)
}

describe('the set sheet', () => {
  const sheet = setSheet(plan(), TRACKS)

  it('says who plays when, on alternating decks', () => {
    expect(sheet.slots).toEqual([
      { trackId: 'a1', deck: 1, player: 'dj1' },
      { trackId: 'b1', deck: 2, player: 'dj2' },
      { trackId: 'a2', deck: 1, player: 'dj1' },
    ])
    expect([0, 1, 2, 3].map(deckOf)).toEqual([1, 2, 1, 2])
  })

  it('plays the agreed version as steps at bars of the outgoing track', () => {
    const t = sheet.transitions[0]!
    expect(t).toMatchObject({ outDeck: 1, inDeck: 2, mixedBy: 'dj2', note: 'Agreed by both.' })
    expect(t.version?.id).toBe('v1')
    // B comes in at the blend start (bar 49 of A) and is started a bar before.
    expect(t.cue).toMatchObject({ playAt: '48.1', inAt: '16.1' })
    const actions = t.steps.map((s) => s.action)
    expect(actions[0]).toBe('Channel 2 fader up')
    expect(t.steps[0]!.at).toMatch(/^49\.1–/)
    expect(actions).toContain('LOW on deck 1 at 7 o’clock (all the way down)')
    expect(actions).toContain('LOW on deck 2 at 12 o’clock')
    expect(actions.at(-1)).toBe('Channel 1 fader down')
    for (const s of t.steps) expect(s.why).not.toBe('')
    const beats = t.steps.map((s) => s.beat)
    expect(beats).toEqual([...beats].sort((x, y) => x - y))
  })

  it('says what is missing where no version is saved', () => {
    const t = sheet.transitions[1]!
    expect(t.version).toBeNull()
    expect(t.steps).toEqual([])
    expect(t.note).toMatch(/No version saved yet/)
  })

  it('names knob positions as hours', () => {
    expect(clock('A.eqLow', 0.5)).toBe('12 o’clock')
    expect(clock('A.eqLow', 1)).toBe('5 o’clock (all the way up)')
    expect(clock('A.filter', 0.4)).toBe('2 o’clock')
  })
})

describe('rekordbox export', () => {
  const sheet = setSheet(plan(), TRACKS)
  const xml = rekordboxXml({
    playlist: 'Andrei & Lena <B2B>',
    folder: '/Users/andrei/Music/Set',
    tracks: TRACKS.map((t) => ({ profile: t, fileName: `${t.id} mix.wav` })),
    sheet,
  })

  it('lists the tracks in set order with their grids', () => {
    expect(xml).toContain('<COLLECTION Entries="3">')
    expect(xml).toContain('Name="Andrei &amp; Lena &lt;B2B&gt;" Type="1" KeyType="0" Entries="3"')
    expect(xml.match(/<TRACK Key="\d"\/>/g)).toEqual([
      '<TRACK Key="1"/>',
      '<TRACK Key="2"/>',
      '<TRACK Key="3"/>',
    ])
    expect(xml).toContain('Location="file://localhost/Users/andrei/Music/Set/a1%20mix.wav"')
    expect(xml).toContain('<TEMPO Inizio="0.000" Bpm="122.00" Metro="4/4" Battito="1"/>')
  })

  it('puts a memory cue where the next track starts and a hot cue where it is cued', () => {
    // A bar 48 at 122 BPM: 47 bars of 4 beats.
    const playSec = ((47 * 4 * 60) / 122).toFixed(3)
    expect(xml).toContain(`Name="1: start deep b1" Type="0" Start="${playSec}" Num="-1"`)
    const cueSec = ((15 * 4 * 60) / 123).toFixed(3)
    expect(xml).toContain(`Name="1: in from deep a1" Type="0" Start="${cueSec}" Num="0"`)
    expect(xml).toContain('Comments="→ deep b1: PLAY it on 48.1"')
    expect(xml).toMatch(/Comments="← deep a1: cued at 16.1; → tool a2: no version yet"/)
  })

  it('makes file locations on every system', () => {
    expect(fileLocation('C:\\Users\\Lena\\Music', 'Track #1.aiff')).toBe(
      'file://localhost/C:/Users/Lena/Music/Track%20%231.aiff',
    )
    expect(fileLocation('/home/lena/', 'a.wav')).toBe('file://localhost/home/lena/a.wav')
  })
})
