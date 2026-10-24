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
