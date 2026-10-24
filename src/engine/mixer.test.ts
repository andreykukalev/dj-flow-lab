import { describe, expect, it } from 'vitest'
import {
  CONTROL_KEYS,
  controlSpec,
  crossfaderGains,
  dbToGain,
  defaultState,
  eqGain,
  faderGain,
  filterCutoffs,
  gainToDb,
  isControlKey,
  trimGain,
} from './mixer'

describe('controls', () => {
  it('lists six controls per deck and the crossfader', () => {
    expect(CONTROL_KEYS).toHaveLength(13)
    expect(isControlKey('A.eqLow')).toBe(true)
    expect(isControlKey('mixer.crossfader')).toBe(true)
    expect(isControlKey('C.eqLow')).toBe(false)
    expect(isControlKey('A.crossfader')).toBe(false)
  })

  it('defaults to A up, B down, everything else neutral', () => {
    const s = defaultState()
    expect(s['A.fader']).toBe(1)
    expect(s['B.fader']).toBe(0)
    expect(s['A.eqLow']).toBe(0.5)
    expect(s['B.filter']).toBe(0)
    expect(s['mixer.crossfader']).toBe(0.5)
    expect(controlSpec('A.trim')).toEqual({ min: -1, max: 1, default: 0 })
  })
})

describe('mappings', () => {
  it('converts between dB and gain', () => {
    expect(dbToGain(0)).toBe(1)
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3)
    expect(gainToDb(dbToGain(-17.3))).toBeCloseTo(-17.3, 12)
  })

  it('maps trim to ±12 dB', () => {
    expect(trimGain(0)).toBe(1)
    expect(gainToDb(trimGain(1))).toBeCloseTo(12, 12)
    expect(gainToDb(trimGain(-0.5))).toBeCloseTo(-6, 12)
  })

  it('maps EQ to kill…unity…+6 dB, continuous at the centre', () => {
    expect(eqGain(0)).toBe(0)
    expect(eqGain(0.25)).toBeCloseTo(0.25, 12)
    expect(eqGain(0.5)).toBe(1)
    expect(eqGain(0.5 + 1e-9)).toBeCloseTo(1, 6)
    expect(gainToDb(eqGain(1))).toBeCloseTo(6, 12)
  })

  it('maps the fader with a square taper', () => {
    expect(faderGain(0)).toBe(0)
    expect(faderGain(0.5)).toBe(0.25)
    expect(faderGain(1)).toBe(1)
  })

  it('keeps both decks at unity in the crossfader centre', () => {
    expect(crossfaderGains(0.5)).toEqual({ A: 1, B: 1 })
    expect(crossfaderGains(0)).toEqual({ A: 1, B: 0 })
    expect(crossfaderGains(1)).toEqual({ A: 0, B: 1 })
    expect(crossfaderGains(0.75)).toEqual({ A: 0.5, B: 1 })
  })

  it('leaves the filter open in the centre and in the dead zone', () => {
    for (const x of [0, 0.01, -0.019, 0.02, -0.02]) {
      const c = filterCutoffs(x, 48000)
      expect(c.lowpassHz).toBeCloseTo(24000, 6)
      expect(c.highpassHz).toBeCloseTo(10, 9)
    }
  })

  it('sweeps the filter log-mapped to its limits', () => {
    expect(filterCutoffs(-1, 48000).lowpassHz).toBeCloseTo(100, 9)
    expect(filterCutoffs(1, 48000).highpassHz).toBeCloseTo(8000, 6)
    // Half way (in the mapped range) is the geometric mean.
    const mid = 0.02 + 0.98 / 2
    expect(filterCutoffs(mid, 48000).highpassHz).toBeCloseTo(Math.sqrt(10 * 8000), 6)
    expect(filterCutoffs(-mid, 44100).lowpassHz).toBeCloseTo(Math.sqrt(100 * 22050), 6)
  })

  it('moves the cutoff monotonically', () => {
    let prev = filterCutoffs(0, 48000)
    for (let i = 1; i <= 100; i++) {
      const hp = filterCutoffs(i / 100, 48000).highpassHz
      const lp = filterCutoffs(-i / 100, 48000).lowpassHz
      expect(hp).toBeGreaterThanOrEqual(prev.highpassHz)
      expect(lp).toBeLessThanOrEqual(prev.lowpassHz)
      prev = { highpassHz: hp, lowpassHz: lp }
    }
  })
})
