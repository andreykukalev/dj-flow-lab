import { describe, expect, it } from 'vitest'
import { heardBeat } from './loop'

describe('heard beat', () => {
  const anchor = { ctxTime: 10, beat: 32, bpm: 120 }

  it('follows the anchor while playing', () => {
    expect(heardBeat({ kind: 'playing', anchor }, 11, -32)).toBeCloseTo(34, 9)
  })

  it('shows the started beat while the start is still in the output', () => {
    expect(heardBeat({ kind: 'playing', anchor }, 9.97, -32)).toBe(32)
  })

  it('holds the paused beat and the start of the span when stopped', () => {
    expect(heardBeat({ kind: 'paused', beat: 40.5 }, 99, -32)).toBe(40.5)
    expect(heardBeat({ kind: 'stopped' }, 99, -32)).toBe(-32)
  })
})
