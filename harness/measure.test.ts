import { describe, expect, it } from 'vitest'
import {
  dftMagnitude,
  fft,
  logFrequencies,
  maxJump,
  maxOnsetOffset,
  onsets,
  rms,
  rmsEnvelope,
  powerSpectrum,
  spectralCentroid,
  truePeak,
} from './measure'
import { clickPositions, clickTrack, sine, whiteNoise } from './signals'

describe('synthetic signals', () => {
  it('places clicks on the beat grid', () => {
    const opts = { sampleRate: 48000, seconds: 4, bpm: 120, firstBeatSec: 0.25 }
    const data = clickTrack(opts)
    expect(clickPositions(opts)).toEqual([
      12000, 36000, 60000, 84000, 108000, 132000, 156000, 180000,
    ])
    expect(data[12000]).toBe(1)
    expect(data[11999]).toBe(0)
  })

  it('generates identical noise for the same seed', () => {
    expect(whiteNoise(8000, 0.1, 1, 7)).toEqual(whiteNoise(8000, 0.1, 1, 7))
    expect(whiteNoise(8000, 0.1, 1, 7)).not.toEqual(whiteNoise(8000, 0.1, 1, 8))
  })

  it('generates a sine with the expected RMS', () => {
    expect(rms(sine(48000, 1, 1000, 1))).toBeCloseTo(Math.SQRT1_2, 3)
  })
})

describe('measurements', () => {
  it('finds click onsets exactly on synthetic clicks', () => {
    const opts = { sampleRate: 44100, seconds: 10, bpm: 124, firstBeatSec: 0.3 }
    const found = onsets(clickTrack(opts))
    const expected = clickPositions(opts)
    expect(found.length).toBe(expected.length)
    // A step from 0 to 1 crosses 0.5 halfway between the two samples.
    expect(maxOnsetOffset(found, expected)).toBeLessThanOrEqual(0.5)
  })

  it('interpolates sub-sample crossings', () => {
    const data = new Float32Array([0, 0, 0.25, 0.75, 1])
    expect(onsets(data, 0.5)).toEqual([2.5])
  })

  it('computes windowed RMS and jumps', () => {
    const data = new Float32Array([1, -1, 1, -1, 0, 0, 0, 0])
    expect(rmsEnvelope(data, 4)).toEqual([1, 0])
    expect(maxJump(data)).toBe(2)
  })

  it('measures the magnitude of one frequency', () => {
    const data = sine(44100, 1, 1000, 0.5)
    // A sine of amplitude a over N samples has DFT magnitude a·N/2 at its own frequency.
    expect(dftMagnitude(data, 1000, 44100) / (0.5 * 22050)).toBeCloseTo(1, 4)
    expect(dftMagnitude(data, 3000, 44100) / (0.5 * 22050)).toBeLessThan(1e-3)
  })

  it('spaces frequencies on a log scale', () => {
    const f = logFrequencies(20, 20000, 4)
    expect(f.map(Math.round)).toEqual([20, 200, 2000, 20000])
  })

  it('computes an FFT', () => {
    const n = 16
    const re = Float64Array.from({ length: n }, (_, i) => Math.cos((2 * Math.PI * 3 * i) / n))
    const im = new Float64Array(n)
    fft(re, im)
    expect(re[3]).toBeCloseTo(n / 2, 9)
    expect(re[n - 3]).toBeCloseTo(n / 2, 9)
    expect(Math.abs(re[2]!) + Math.abs(im[2]!)).toBeLessThan(1e-9)
  })

  it('finds the spectral centroid of a tone', () => {
    const frame = sine(44100, 4096 / 44100, 2000).subarray(0, 4096)
    expect(spectralCentroid(frame, 44100)).toBeCloseTo(2000, -1)
  })

  it('scales the power spectrum to the mean square', () => {
    const frame = sine(44100, 1, 1000, 0.5).subarray(0, 8192)
    const total = powerSpectrum(frame).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(0.125, 2)
  })

  it('finds peaks between samples', () => {
    // A sine at a quarter of the sample rate, sampled 45° off its peaks: samples reach
    // only 0.707, the waveform reaches 1.
    const sr = 44100
    const data = Float32Array.from({ length: 4096 }, (_, i) =>
      Math.sin((2 * Math.PI * (sr / 4) * i) / sr + Math.PI / 4),
    )
    expect(Math.max(...data.map(Math.abs))).toBeCloseTo(Math.SQRT1_2, 5)
    expect(truePeak(data)).toBeCloseTo(1, 2)
    expect(truePeak(sine(sr, 0.1, 100, 0.5))).toBeCloseTo(0.5, 3)
  })
})
