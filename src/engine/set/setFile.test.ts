import { describe, expect, it } from 'vitest'
import { frameFeatures } from '../analysis/structure'
import { arrangement, full, SR } from '../analysis/arrangement'
import { grid } from '../test-helpers'
import {
  decodeFloats,
  decodeFrames,
  encodeFloats,
  encodeFrames,
  matchTrack,
  parseSet,
  SET_FORMAT,
  type SavedSet,
} from './setFile'

describe('the set file', () => {
  it('keeps the analysis features exactly', () => {
    const values = Float32Array.from([0, 1.5, -2.25, 1e-12, 3.4e38])
    expect(Array.from(decodeFloats(encodeFloats(values)))).toEqual(Array.from(values))
    const frames = frameFeatures([arrangement([{ bars: 8, ...full }])], SR)
    const back = decodeFrames(JSON.parse(JSON.stringify(encodeFrames(frames))))
    expect(back.hopSec).toBe(frames.hopSec)
    expect(Array.from(back.low)).toEqual(Array.from(frames.low))
    // A long track still encodes (no call-stack limit on big arrays).
    expect(decodeFloats(encodeFloats(new Float32Array(200_000))).length).toBe(200_000)
  })

  it('reads its own format and says why it will not read others', () => {
    const set: SavedSet = {
      format: SET_FORMAT,
      version: 1,
      savedAt: '2026-10-25T22:00:00Z',
      djs: { dj1: 'Andrei', dj2: 'Lena' },
      tracks: [
        {
          id: 't1',
          owner: 'dj1',
          fileName: 'a.wav',
          fingerprint: 'ab',
          durationSec: 120,
          grid: grid(122, 0),
          tempo: 'yours',
          frames: { hopSec: 0.064, total: '', low: '', high: '' },
        },
      ],
      reading: null,
      plan: null,
      dismissed: [],
    }
    expect(parseSet(JSON.stringify(set))).toEqual(set)
    expect(parseSet('nope')).toEqual({ error: 'This is not a set file: it is not JSON.' })
    expect(parseSet('{"format":"x"}')).toEqual({ error: 'This is not a DJ Flow Lab set file.' })
    expect(parseSet(JSON.stringify({ ...set, version: 2 }))).toMatchObject({
      error: expect.stringMatching(/version 2/),
    })
    expect(parseSet(JSON.stringify({ ...set, tracks: [{ id: 't1' }] }))).toMatchObject({
      error: expect.stringMatching(/missing its analysis/),
    })
  })

  it('matches a file by fingerprint, then by name and length', () => {
    const saved = [
      { id: 't1', fileName: 'a.wav', fingerprint: 'aa', durationSec: 120 },
      { id: 't2', fileName: 'b.wav', fingerprint: 'bb', durationSec: 200 },
    ]
    expect(matchTrack(saved, { name: 'renamed.wav', fingerprint: 'bb' })).toEqual({
      id: 't2',
      by: 'fingerprint',
    })
    expect(matchTrack(saved, { name: 'a.wav', fingerprint: 'zz' })).toBeNull()
    expect(matchTrack(saved, { name: 'a.wav', fingerprint: 'zz', durationSec: 120.04 })).toEqual({
      id: 't1',
      by: 'name and length',
    })
    expect(matchTrack(saved, { name: 'a.wav', fingerprint: 'zz', durationSec: 121 })).toBeNull()
  })
})
