import { describe, expect, it } from 'vitest'
import {
  arcPath,
  crossfaderCapX,
  CROSSFADER_CAP,
  CROSSFADER_WIDTH,
  faderCapY,
  FADER_LENGTH,
  knobAngle,
  polar,
  unitOf,
  valueArc,
} from './geometry'

describe('mixer geometry', () => {
  it('maps control ranges onto the 270° knob sweep', () => {
    expect(knobAngle(unitOf('A.eqLow', 0))).toBe(-135)
    expect(knobAngle(unitOf('A.eqLow', 0.5))).toBe(0)
    expect(knobAngle(unitOf('A.eqLow', 1))).toBe(135)
    expect(knobAngle(unitOf('A.filter', -1))).toBe(-135)
    expect(knobAngle(unitOf('B.trim', 0))).toBe(0)
    expect(unitOf('A.eqHigh', 2)).toBe(1)
  })

  it('places points clockwise from the top', () => {
    const [x, y] = polar(19, 90)
    expect(x).toBeCloseTo(43, 9)
    expect(y).toBeCloseTo(24, 9)
  })

  it('draws the value arc from the neutral position, and nothing at neutral', () => {
    expect(valueArc('A.eqMid', 0.5)).toBe('')
    // A killed low band: from the top, counter-clockwise to the lower left (as in the mockup).
    expect(valueArc('B.eqLow', 0)).toBe('M24.00 5.00A19 19 0 0 0 10.56 37.44')
    expect(arcPath(-135, 135)).toBe('M10.56 37.44A19 19 0 1 1 37.44 37.44')
  })

  it('moves the fader and crossfader caps over their whole travel', () => {
    expect(faderCapY(1)).toBe(0)
    expect(faderCapY(0)).toBe(FADER_LENGTH)
    expect(crossfaderCapX(0)).toBe(0)
    expect(crossfaderCapX(1)).toBe(CROSSFADER_WIDTH - CROSSFADER_CAP)
  })
})
