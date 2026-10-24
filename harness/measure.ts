/** Measurements on rendered audio. Pure functions, usable in Node and the browser. */

/**
 * Onset times in (fractional) samples: the first upward crossing of `threshold`,
 * linearly interpolated between samples, at least `minGap` samples apart.
 */
export function onsets(data: Float32Array, threshold = 0.5, minGap = 1000): number[] {
  const out: number[] = []
  let last = -Infinity
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]!
    const cur = data[i]!
    if (prev < threshold && cur >= threshold && i - last >= minGap) {
      out.push(i - 1 + (threshold - prev) / (cur - prev))
      last = i
    }
  }
  if (data.length > 0 && data[0]! >= threshold) out.unshift(0)
  return out
}

/** RMS over consecutive windows of `windowSize` samples. */
export function rmsEnvelope(data: Float32Array, windowSize: number): number[] {
  const out: number[] = []
  for (let start = 0; start + windowSize <= data.length; start += windowSize) {
    let sum = 0
    for (let i = start; i < start + windowSize; i++) sum += data[i]! * data[i]!
    out.push(Math.sqrt(sum / windowSize))
  }
  return out
}

export function rms(data: Float32Array): number {
  let sum = 0
  for (const v of data) sum += v * v
  return data.length ? Math.sqrt(sum / data.length) : 0
}

/** Largest absolute difference between consecutive samples (a click detector). */
export function maxJump(data: Float32Array): number {
  let max = 0
  for (let i = 1; i < data.length; i++) max = Math.max(max, Math.abs(data[i]! - data[i - 1]!))
  return max
}

/** Largest pairwise distance between two onset lists, matched in order. */
export function maxOnsetOffset(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  let max = 0
  for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(a[i]! - b[i]!))
  return max
}

/** Magnitude of one frequency in a signal (a single-bin DFT, not normalized). */
export function dftMagnitude(data: Float32Array, freqHz: number, sampleRate: number): number {
  const w = (2 * Math.PI * freqHz) / sampleRate
  // Rotate a phasor instead of calling sin/cos per sample; renormalize to stop drift.
  const cw = Math.cos(w)
  const sw = Math.sin(w)
  let c = 1
  let s = 0
  let re = 0
  let im = 0
  for (let i = 0; i < data.length; i++) {
    re += data[i]! * c
    im -= data[i]! * s
    const next = c * cw - s * sw
    s = s * cw + c * sw
    c = next
    if ((i & 1023) === 1023) {
      const n = Math.hypot(c, s)
      c /= n
      s /= n
    }
  }
  return Math.hypot(re, im)
}

/** `count` frequencies spaced evenly on a log scale from `from` to `to`, both included. */
export function logFrequencies(from: number, to: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from * (to / from) ** (i / (count - 1)))
}

/** In-place radix-2 FFT; the length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const a = i + k
        const b = a + len / 2
        const xr = re[b]! * wr - im[b]! * wi
        const xi = re[b]! * wi + im[b]! * wr
        re[b] = re[a]! - xr
        im[b] = im[a]! - xi
        re[a] = re[a]! + xr
        im[a] = im[a]! + xi
      }
    }
  }
}

/**
 * Power spectrum of a Hann-windowed frame (length a power of two), bins 0…n/2, scaled
 * so that the sum over bins is the mean square of the frame.
 */
export function powerSpectrum(frame: Float32Array): Float64Array {
  const n = frame.length
  const re = new Float64Array(n)
  const im = new Float64Array(n)
  let windowPower = 0
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)
    re[i] = frame[i]! * w
    windowPower += w * w
  }
  fft(re, im)
  const out = new Float64Array(n / 2 + 1)
  for (let k = 0; k <= n / 2; k++) {
    const twoSided = k === 0 || k === n / 2 ? 1 : 2
    out[k] = (twoSided * (re[k]! ** 2 + im[k]! ** 2)) / (n * windowPower)
  }
  return out
}

/** Power-weighted mean frequency of a power spectrum from `powerSpectrum`. */
export function centroidOf(power: Float64Array, sampleRate: number): number {
  const n = 2 * (power.length - 1)
  let num = 0
  let den = 0
  for (let k = 1; k < power.length; k++) {
    num += power[k]! * ((k * sampleRate) / n)
    den += power[k]!
  }
  return den > 0 ? num / den : 0
}

/** Power-weighted mean frequency of a Hann-windowed frame (length a power of two). */
export function spectralCentroid(frame: Float32Array, sampleRate: number): number {
  return centroidOf(powerSpectrum(frame), sampleRate)
}

/**
 * Largest absolute value of the signal including the peaks between samples, estimated
 * by 4× oversampling with a Hann-windowed sinc (in the spirit of ITU-R BS.1770 true peak).
 */
export function truePeak(data: Float32Array, oversample = 4, halfTaps = 16): number {
  const kernels = Array.from({ length: oversample - 1 }, (_, k) => {
    const frac = (k + 1) / oversample
    return Array.from({ length: 2 * halfTaps }, (_, j) => {
      const x = j - halfTaps + 1 - frac // distance from sample i + j − halfTaps + 1
      const sinc = Math.sin(Math.PI * x) / (Math.PI * x)
      const win = 0.5 + 0.5 * Math.cos((Math.PI * x) / halfTaps)
      return sinc * win
    })
  })
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]!))
    if (i < halfTaps - 1 || i + halfTaps >= data.length) continue
    for (const kernel of kernels) {
      let v = 0
      for (let j = 0; j < kernel.length; j++) v += data[i + j - halfTaps + 1]! * kernel[j]!
      peak = Math.max(peak, Math.abs(v))
    }
  }
  return peak
}
