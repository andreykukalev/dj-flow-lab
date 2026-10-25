import { describe, expect, it } from 'vitest'
import { HeardClock, heardTime } from './clock'

describe('heard time', () => {
  it('carries the output timestamp forward to the frame time', () => {
    const h = heardTime(
      { currentTime: 10, outputTimestamp: { contextTime: 9.95, performanceTime: 1000 } },
      1020,
    )
    expect(h.source).toBe('outputTimestamp')
    expect(h.time).toBeCloseTo(9.97, 9)
    expect(h.latencySec).toBeCloseTo(0.03, 9)
  })

  it('subtracts the reported latency from a timestamp that tracks the rendering clock', () => {
    // Firefox (S5): the timestamp lags currentTime by the output latency, but its
    // performance time lags performance.now() by the same amount.
    const h = heardTime(
      {
        currentTime: 10,
        outputTimestamp: { contextTime: 9.969, performanceTime: 969 },
        outputLatency: 0.031,
        baseLatency: 0,
      },
      1000,
    )
    expect(h.source).toBe('outputTimestamp+latency')
    expect(h.time).toBeCloseTo(9.969, 9)
  })

  it('judges the timestamp at the moment of reading, not at a late frame time', () => {
    // A frame whose timestamp is 25 ms older than the reading (main thread busy).
    const reading = {
      currentTime: 10,
      performanceNow: 1000,
      outputTimestamp: { contextTime: 9.969, performanceTime: 969 },
      outputLatency: 0.031,
      baseLatency: 0,
    }
    expect(heardTime(reading, 975).source).toBe('outputTimestamp+latency')
  })

  it('keeps a timestamp that already includes the latency (Chromium)', () => {
    const h = heardTime(
      {
        currentTime: 10,
        outputTimestamp: { contextTime: 9.959, performanceTime: 1000 },
        outputLatency: 0.032,
        baseLatency: 0.01,
      },
      1002,
    )
    expect(h.source).toBe('outputTimestamp')
    expect(h.time).toBeCloseTo(9.961, 9)
  })

  it('falls back to output latency plus base latency, then base latency', () => {
    const r = { currentTime: 10, outputLatency: 0.04, baseLatency: 0.01 }
    expect(heardTime(r, 0)).toMatchObject({ source: 'outputLatency' })
    expect(heardTime(r, 0).time).toBeCloseTo(9.95, 9)
    const base = heardTime({ currentTime: 10, outputLatency: 0, baseLatency: 0.01 }, 0)
    expect(base.source).toBe('baseLatency')
    expect(base.time).toBeCloseTo(9.99, 9)
    expect(heardTime({ currentTime: 10 }, 0)).toEqual({ time: 10, source: 'none', latencySec: 0 })
  })

  it('applies the calibration offset after the estimate', () => {
    const h = heardTime({ currentTime: 10, baseLatency: 0.01 }, 0, 150)
    expect(h.time).toBeCloseTo(9.84, 9)
    expect(h.latencySec).toBeCloseTo(0.16, 9)
  })

  it('is never ahead of the rendering clock, even from a stale timestamp', () => {
    // A suspended context: the timestamp stops, the frame time keeps going.
    const h = heardTime(
      { currentTime: 10, outputTimestamp: { contextTime: 9.97, performanceTime: 1000 } },
      61_000,
    )
    expect(h.time).toBe(10)
  })
})

describe('heard clock', () => {
  // currentTime moving in 20 ms callback steps, read at 60 frames per second.
  const steppy = (ms: number) => ({ currentTime: Math.floor(ms / 20) * 0.02, baseLatency: 0.005 })

  it('smooths a clock that moves in callback steps', () => {
    const clock = new HeardClock()
    const times: number[] = []
    for (let i = 0; i < 600; i++)
      times.push(clock.read(steppy(1000 + i * 16.67), 1000 + i * 16.67).time)
    const steps = times.slice(301).map((t, i) => (t - times[300 + i]!) * 1000)
    expect(Math.max(...steps.map((d) => Math.abs(d - 16.67)))).toBeLessThan(5)
    // It stays on the raw estimate on average.
    const raw = heardTime(steppy(1000 + 599 * 16.67), 0).time
    expect(Math.abs(times[599]! - raw)).toBeLessThan(0.015)
  })

  it('takes the raw estimate after a gap or a jump', () => {
    const clock = new HeardClock()
    clock.read(steppy(1000), 1000)
    expect(clock.read(steppy(31_000), 31_000).time).toBe(heardTime(steppy(31_000), 0).time)
    const jumped = { currentTime: 99, baseLatency: 0.005 }
    expect(clock.read(jumped, 31_016).time).toBeCloseTo(98.995, 9)
  })
})
