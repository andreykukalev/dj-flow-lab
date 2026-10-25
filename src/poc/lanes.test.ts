import { describe, expect, it } from 'vitest'
import { compile } from '../engine/plan/compile'
import { longBlendPlan } from '../engine/plan/longBlend'
import { applyTake } from '../engine/plan/take'
import type { Segment } from '../engine/plan/compile'
import type { BeatGrid } from '../engine/model'
import {
  areaPath,
  curvePoints,
  direction,
  formatValue,
  laneY,
  linePath,
  movesOf,
  sameCurve,
} from './lanes'

const grid: BeatGrid = {
  bpm: 124,
  anchorSec: 0,
  beatsPerBar: 4,
  phraseOffsetBars: 0,
  source: 'user',
}
const plan = longBlendPlan(
  { A: { trackFingerprint: 'a', grid }, B: { trackFingerprint: 'b', grid } },
  { exitBarA: 9, entryBarB: 1 },
)
const compiled = compile(plan)
const SR = 48000

describe('movesOf', () => {
  it('finds the long blend moves on each control, from the compiled plan', () => {
    expect(movesOf(compiled.controls['A.eqLow'])).toEqual([{ b0: 64, b1: 64, from: 0.5, to: 0 }])
    expect(movesOf(compiled.controls['B.eqLow'])).toEqual([{ b0: 64, b1: 64, from: 0, to: 0.5 }])
    expect(movesOf(compiled.controls['A.filter'])).toEqual([{ b0: 32, b1: 64, from: 0, to: 0.35 }])
    expect(movesOf(compiled.controls['B.eqHigh'])).toEqual([{ b0: 0, b1: 64, from: 0.25, to: 0.5 }])
    expect(movesOf(compiled.controls['A.fader'])).toEqual([{ b0: 96, b1: 128, from: 1, to: 0 }])
  })

  it('finds no move on a control the plan leaves alone', () => {
    expect(movesOf(compiled.controls['B.filter'])).toEqual([])
    expect(movesOf(compiled.controls['A.trim'])).toEqual([])
  })

  it('joins ramps in one direction and splits at a turn', () => {
    const take = applyTake(plan, {
      id: 't',
      control: 'B.filter',
      points: [
        { beat: 80, value: 0 },
        { beat: 90, value: -0.3 },
        { beat: 100, value: -0.6 },
        { beat: 120, value: 0 },
      ],
    })
    expect(movesOf(compile(take).controls['B.filter'])).toEqual([
      { b0: 80, b1: 100, from: 0, to: -0.6 },
      { b0: 100, b1: 120, from: -0.6, to: 0 },
    ])
  })

  it('counts a jump right before a ramp as part of the move', () => {
    const segments: Segment[] = [
      { b0: 0, b1: 4, v0: 0.5, v1: 0.5, curve: 'hold' },
      { b0: 4, b1: 8, v0: 0.4, v1: 0.2, curve: 'linear' },
      { b0: 8, b1: 16, v0: 0.2, v1: 0.2, curve: 'hold' },
    ]
    expect(movesOf(segments)).toEqual([{ b0: 4, b1: 8, from: 0.5, to: 0.2 }])
  })
})

describe('direction', () => {
  it('is the sign of the change', () => {
    expect(direction({ b0: 0, b1: 1, from: 0.5, to: 0 })).toBe(-1)
    expect(direction({ b0: 0, b1: 1, from: 0, to: 0.35 })).toBe(1)
    expect(direction({ b0: 0, b1: 1, from: 0.3, to: 0.3 })).toBe(0)
  })
})

describe('curvePoints', () => {
  it('draws holds and linear ramps by their ends and a jump on one beat', () => {
    expect(curvePoints(compiled.controls['A.eqLow'], -32, 160)).toEqual([
      [-32, 0.5],
      [64, 0.5],
      [64, 0],
      [160, 0],
    ])
    expect(curvePoints(compiled.controls['B.fader'], -32, 160)).toEqual([
      [-32, 0],
      [0, 0],
      [32, 1],
      [160, 1],
    ])
  })

  it('samples a smooth ramp at its exact values', () => {
    const points = curvePoints(compiled.controls['A.filter'], -32, 160)
    const mid = points.find(([b]) => b === 48)!
    expect(mid[1]).toBeCloseTo(0.35 / 2, 12)
    expect(points.at(-1)).toEqual([160, 0.35])
    for (const [b, v] of points) if (b > 32 && b < 64) expect(v).toBeGreaterThan(0)
  })
})

describe('sameCurve', () => {
  it('tells a take from the original only on the controls it changed', () => {
    const take = compile(
      applyTake(plan, {
        id: 't',
        control: 'A.eqLow',
        points: [
          { beat: 16, value: 0.5 },
          { beat: 30, value: 0.15 },
        ],
      }),
    )
    expect(sameCurve(take.controls['A.eqLow'], compiled.controls['A.eqLow'])).toBe(false)
    expect(sameCurve(take.controls['A.eqMid'], compiled.controls['A.eqMid'])).toBe(true)
  })
})

describe('lane geometry', () => {
  it('puts neutral in the middle, up for boost and high-pass, down for cut and low-pass', () => {
    expect(laneY('A.eqLow', 0.5, 32)).toBe(16)
    expect(laneY('A.eqLow', 0, 32)).toBe(30)
    expect(laneY('A.eqLow', 1, 32)).toBe(2)
    expect(laneY('A.filter', 0, 32)).toBe(16)
    expect(laneY('A.filter', 1, 32)).toBe(2)
    expect(laneY('A.filter', -1, 32)).toBe(30)
  })

  it('writes paths in beats from the span start', () => {
    const points = [
      [-32, 0.5],
      [64, 0.5],
      [64, 0],
    ] as const
    const y = (v: number) => laneY('A.eqLow', v, 32)
    expect(linePath(points, -32, y)).toBe('M0 16L96 16L96 30')
    expect(areaPath(points, -32, y, 16)).toBe('M0 16L0 16L96 16L96 30L96 16Z')
  })
})

describe('formatValue', () => {
  it('shows EQ in dB, and kill at the bottom', () => {
    expect(formatValue('A.eqLow', 0.5, SR)).toBe('0 dB')
    expect(formatValue('A.eqLow', 0, SR)).toBe('kill')
    expect(formatValue('A.eqMid', 0.25, SR)).toBe('−12 dB')
    expect(formatValue('A.eqHigh', 1, SR)).toBe('+6 dB')
  })

  it('shows the filter as its cutoff', () => {
    expect(formatValue('A.filter', 0, SR)).toBe('off')
    expect(formatValue('A.filter', 0.35, SR)).toBe('HP 60 Hz')
    expect(formatValue('A.filter', 1, SR)).toBe('HP 8.0 kHz')
    expect(formatValue('A.filter', -1, SR)).toBe('LP 100 Hz')
  })

  it('shows faders, trim and crossfader', () => {
    expect(formatValue('A.fader', 1, SR)).toBe('0 dB')
    expect(formatValue('A.fader', 0.5, SR)).toBe('−12 dB')
    expect(formatValue('B.fader', 0, SR)).toBe('off')
    expect(formatValue('A.trim', 0.25, SR)).toBe('+3 dB')
    expect(formatValue('mixer.crossfader', 0.5, SR)).toBe('centre')
    expect(formatValue('mixer.crossfader', 0.2, SR)).toBe('A 60%')
  })
})
