import { random } from '../test-helpers'

// Synthetic arrangements for the analysis tests: kick, off-beat bass, hats and a pad,
// part by part, at 120 BPM from file time 0.

export const SR = 16000
export const BPM = 120

export type Part = { bars: number; kick: boolean; bass: boolean; hats: boolean; rise?: boolean }

export const full = { kick: true, bass: true, hats: true }

/** A synthetic arrangement: kick, off-beat bass, hats and a pad, part by part. */
export function arrangement(parts: Part[]): Float32Array {
  const beat = 60 / BPM
  const totalBars = parts.reduce((n, p) => n + p.bars, 0)
  const out = new Float32Array(Math.ceil((totalBars * 4 * beat + 0.5) * SR))
  const rnd = random(11)
  let bar0 = 0
  for (const part of parts) {
    const start = Math.round(bar0 * 4 * beat * SR)
    const end = Math.round((bar0 + part.bars) * 4 * beat * SR)
    for (let i = start; i < end; i++) {
      const t = i / SR
      const inBeat = t % beat
      const progress = (i - start) / (end - start)
      let v = 0.05 * Math.sin(2 * Math.PI * 330 * t) // pad, always
      if (part.kick) v += 0.5 * Math.sin(2 * Math.PI * 55 * inBeat) * Math.exp(-inBeat / 0.15)
      const off = (t + beat / 2) % beat
      if (part.bass) v += 0.3 * Math.sin(2 * Math.PI * 45 * off) * Math.exp(-off / 0.2)
      if (part.hats) v += 0.1 * (rnd() * 2 - 1) * Math.exp(-(t % (beat / 2)) / 0.02)
      if (part.rise) v += 0.25 * progress * (rnd() * 2 - 1) // a noise riser
      out[i] = v
    }
    bar0 += part.bars
  }
  return out
}
