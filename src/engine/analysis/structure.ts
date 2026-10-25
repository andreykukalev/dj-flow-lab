import { isPhraseStart } from '../grid'
import type { BeatGrid } from '../model'
import { beatToSec, barToBeat, secToBeat, beatToBar } from '../time'

// A first look at a whole track's structure (#29, #8), from three simple features per
// bar: overall level, low end (below about 150 Hz: kick and bass) and highs (above about
// 4 kHz: hats and cymbals). From them the analysis finds the bars where the music
// changes, checks whether the phrase grid lines up with those changes, and proposes
// likely sections with the structure terms of docs/MUSICAL_LANGUAGE.md. Everything here
// is _likely_ (brief §10): a starting point the user listens to and corrects. Musical
// functions are not derived here; a section name never implies one.

/** Mean squares of the signal and two bands, per hop. */
export interface FrameFeatures {
  hopSec: number
  total: Float32Array
  low: Float32Array
  high: Float32Array
}

export interface BarFeatures {
  /** 1-based bar. */
  bar: number
  energyDb: number
  lowDb: number
  highDb: number
}

export type StructureTerm = 'INTRO' | 'GROOVE' | 'BREAKDOWN' | 'BUILD-UP' | 'DROP' | 'OUTRO'

export interface LikelySection {
  term: StructureTerm
  /** First and last bar, inclusive. */
  fromBar: number
  toBar: number
  /** What the term rests on, in words, for the user to check by ear. */
  reasons: string[]
}

export interface Change {
  /** The first bar after the change. */
  bar: number
  /** Size of the change, in dB summed over the features. */
  size: number
}

export interface PhraseCheck {
  phraseBars: 8
  changes: number
  /** Changes that fall on a phrase line of the current grid. */
  onLines: number
  /** A phrase offset that would put clearly more changes on phrase lines. */
  suggestedOffsetBars?: number
  suggestedOnLines?: number
}

export interface TrackStructure {
  bars: BarFeatures[]
  changes: Change[]
  phraseCheck: PhraseCheck
  sections: LikelySection[]
}

const HOP = 1024
const LOW_HZ = 150
const HIGH_HZ = 4000
const FLOOR_DB = -100
const PHRASE_BARS = 8

/** Features below this many dB summed over the 2-bar windows are not a change. */
export const CHANGE_DB = 6
/** A block quieter than the main part by this much is reduced. */
const QUIET_DB = 6
/** A block whose low end is this far below the main part has (mostly) no kick or bass. */
const LOW_ABSENT_DB = 12
/** At the start or end of a track, a block with this much less low end or highs is thinner. */
const THIN_DB = 6
/** Level rise over a block that makes it a build-up. */
const RISE_DB = 3

const db = (meanSquare: number) => Math.max(FLOOR_DB, 10 * Math.log10(meanSquare + 1e-12))

/** One pass over the audio: mean squares of the mono signal, its low band and its highs. */
export function frameFeatures(
  channels: readonly Float32Array[],
  sampleRate: number,
): FrameFeatures {
  const n = channels[0]?.length ?? 0
  const frames = Math.ceil(n / HOP)
  const total = new Float32Array(frames)
  const low = new Float32Array(frames)
  const high = new Float32Array(frames)
  const aLow = 1 - Math.exp((-2 * Math.PI * LOW_HZ) / sampleRate)
  const aHigh = 1 - Math.exp((-2 * Math.PI * HIGH_HZ) / sampleRate)
  let low1 = 0
  let low2 = 0
  let smooth1 = 0
  let smooth2 = 0
  for (let f = 0; f < frames; f++) {
    let t = 0
    let l = 0
    let h = 0
    const end = Math.min(n, (f + 1) * HOP)
    for (let i = f * HOP; i < end; i++) {
      let x = 0
      for (const c of channels) x += c[i]!
      x /= channels.length
      low1 += aLow * (x - low1)
      low2 += aLow * (low1 - low2)
      // Two one-pole high-passes in a row, so kick and bass stay well out of the highs.
      smooth1 += aHigh * (x - smooth1)
      const hi1 = x - smooth1
      smooth2 += aHigh * (hi1 - smooth2)
      const hi = hi1 - smooth2
      t += x * x
      l += low2 * low2
      h += hi * hi
    }
    const count = end - f * HOP
    total[f] = t / count
    low[f] = l / count
    high[f] = h / count
  }
  return { hopSec: HOP / sampleRate, total, low, high }
}

/** Level, low end and highs of every full bar from bar 1, in dB. */
export function barFeatures(frames: FrameFeatures, grid: BeatGrid): BarFeatures[] {
  const durationSec = frames.total.length * frames.hopSec
  const lastBar = beatToBar(grid, Math.floor(secToBeat(grid, durationSec))) - 1
  const bars: BarFeatures[] = []
  for (let bar = 1; bar <= lastBar; bar++) {
    const f0 = Math.round(beatToSec(grid, barToBeat(grid, bar)) / frames.hopSec)
    const f1 = Math.round(beatToSec(grid, barToBeat(grid, bar + 1)) / frames.hopSec)
    let t = 0
    let l = 0
    let h = 0
    for (let f = f0; f < f1; f++) {
      t += frames.total[f] ?? 0
      l += frames.low[f] ?? 0
      h += frames.high[f] ?? 0
    }
    const count = Math.max(1, f1 - f0)
    bars.push({ bar, energyDb: db(t / count), lowDb: db(l / count), highDb: db(h / count) })
  }
  return bars
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

function percentile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return FLOOR_DB
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!
}

/**
 * Bars where the music changes: the features of the two bars before and the two bars
 * from the bar differ by at least CHANGE_DB, and more than at the neighbouring bars.
 */
export function findChanges(bars: readonly BarFeatures[]): Change[] {
  const novelty = bars.map((_, k) => {
    if (k < 2 || k > bars.length - 2) return 0
    const before = [bars[k - 2]!, bars[k - 1]!]
    const after = [bars[k]!, bars[k + 1]!]
    const d = (key: 'energyDb' | 'lowDb' | 'highDb') =>
      Math.abs(mean(after.map((b) => b[key])) - mean(before.map((b) => b[key])))
    return d('energyDb') + d('lowDb') + 0.5 * d('highDb')
  })
  const changes: Change[] = []
  for (let k = 0; k < bars.length; k++) {
    const size = novelty[k]!
    if (size < CHANGE_DB) continue
    let peak = true
    for (let j = Math.max(0, k - 2); j <= Math.min(bars.length - 1, k + 2); j++) {
      if (j !== k && (novelty[j]! > size || (novelty[j] === size && j < k))) peak = false
    }
    if (peak) changes.push({ bar: bars[k]!.bar, size })
  }
  return changes
}

const residue = (bar: number) => (((bar - 1) % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS

/** How many changes fall on the grid's 8-bar phrase lines, and an offset that fits better. */
export function checkPhrases(changes: readonly Change[], grid: BeatGrid): PhraseCheck {
  const offset = residue(grid.phraseOffsetBars + 1)
  const counts = new Array<number>(PHRASE_BARS).fill(0)
  for (const c of changes) counts[residue(c.bar)]!++
  const onLines = counts[offset]!
  const check: PhraseCheck = { phraseBars: PHRASE_BARS, changes: changes.length, onLines }
  const best = counts.indexOf(Math.max(...counts))
  const bestCount = counts[best]!
  // Suggest only with enough changes, most of them agreeing, and clearly better.
  if (
    best !== offset &&
    bestCount >= 3 &&
    bestCount >= 0.6 * changes.length &&
    bestCount > onLines + 1
  ) {
    check.suggestedOffsetBars = best
    check.suggestedOnLines = bestCount
  }
  return check
}

/** How a stretch of bars compares with the main part of the track. */
interface Stretch {
  fromBar: number
  toBar: number
  quietByDb: number
  lowByDb: number
  highsByDb: number
  /** Level of the last two bars over the first two. */
  riseDb: number
  lowAbsent: boolean
  /** Quieter, or without kick and bass: a breakdown in the middle of a track. */
  reduced: boolean
  /** Fewer elements than the main part: enough for an intro or outro, not for a breakdown. */
  thin: boolean
}

/** Likely sections, one decision per 8-bar phrase of the grid, merged where they agree. */
export function likelySections(bars: readonly BarFeatures[], grid: BeatGrid): LikelySection[] {
  if (bars.length === 0) return []
  const main = {
    energy: percentile(
      bars.map((b) => b.energyDb),
      0.9,
    ),
    low: percentile(
      bars.map((b) => b.lowDb),
      0.9,
    ),
    high: percentile(
      bars.map((b) => b.highDb),
      0.9,
    ),
  }

  const measure = (bs: readonly BarFeatures[]): Stretch => {
    const edge = Math.min(2, Math.floor(bs.length / 2))
    const quietByDb = main.energy - mean(bs.map((b) => b.energyDb))
    const lowByDb = main.low - mean(bs.map((b) => b.lowDb))
    const highsByDb = main.high - mean(bs.map((b) => b.highDb))
    const lowAbsent = lowByDb >= LOW_ABSENT_DB
    const reduced = lowAbsent || quietByDb >= QUIET_DB
    return {
      fromBar: bs[0]!.bar,
      toBar: bs.at(-1)!.bar,
      quietByDb,
      lowByDb,
      highsByDb,
      riseDb:
        edge > 0
          ? mean(bs.slice(-edge).map((b) => b.energyDb)) -
            mean(bs.slice(0, edge).map((b) => b.energyDb))
          : 0,
      lowAbsent,
      reduced,
      thin: reduced || lowByDb >= THIN_DB || highsByDb >= THIN_DB,
    }
  }

  // One block per phrase of the grid; a first block before the first phrase line is shorter.
  const groups: BarFeatures[][] = []
  for (const b of bars) {
    if (groups.length === 0 || isPhraseStart(grid, b.bar, PHRASE_BARS)) groups.push([])
    groups.at(-1)!.push(b)
  }
  const blocks = groups.map(measure)

  const terms = blocks.map((): StructureTerm => 'GROOVE')
  let first = 0
  while (first < blocks.length && blocks[first]!.thin) terms[first++] = 'INTRO'
  let last = blocks.length - 1
  while (last >= first && blocks[last]!.thin) terms[last--] = 'OUTRO'
  for (let k = first; k <= last; k++) {
    const b = blocks[k]!
    const next = blocks[k + 1]
    if (b.reduced)
      terms[k] = b.riseDb >= RISE_DB && next && !next.reduced ? 'BUILD-UP' : 'BREAKDOWN'
    else if (k > first && blocks[k - 1]!.reduced) terms[k] = 'DROP'
  }

  // Merge neighbours with the same term (a drop is one phrase), then give the reasons
  // for each section as a whole.
  const merged: { term: StructureTerm; bars: BarFeatures[] }[] = []
  groups.forEach((g, k) => {
    const term = terms[k]!
    const prev = merged.at(-1)
    if (prev && prev.term === term && term !== 'DROP') prev.bars.push(...g)
    else merged.push({ term, bars: [...g] })
  })

  const fewer = (x: Stretch) => {
    const reasons: string[] = []
    if (x.lowAbsent) reasons.push('low end mostly absent')
    else if (x.lowByDb >= THIN_DB) reasons.push(`${Math.round(x.lowByDb)} dB less low end`)
    if (x.quietByDb >= QUIET_DB)
      reasons.push(`${Math.round(x.quietByDb)} dB quieter than the main part`)
    if (x.highsByDb >= THIN_DB)
      reasons.push(`${Math.round(x.highsByDb)} dB less highs (hats, cymbals)`)
    return reasons
  }

  return merged.map(({ term, bars: bs }, k) => {
    const x = measure(bs)
    let reasons: string[]
    if (term === 'GROOVE') reasons = ['full level, low end present']
    else if (term === 'BUILD-UP') reasons = [`level rises ${Math.round(x.riseDb)} dB`, ...fewer(x)]
    else if (term === 'DROP') {
      const prev = measure(merged[k - 1]!.bars)
      reasons = []
      if (prev.lowAbsent) reasons.push('low end returns')
      const back = prev.quietByDb - x.quietByDb
      if (back >= 1) reasons.push(`level back up ${Math.round(back)} dB`)
    } else reasons = fewer(x)
    return { term, fromBar: x.fromBar, toBar: x.toBar, reasons }
  })
}

export function analyseStructure(frames: FrameFeatures, grid: BeatGrid): TrackStructure {
  const bars = barFeatures(frames, grid)
  const changes = findChanges(bars)
  return {
    bars,
    changes,
    phraseCheck: checkPhrases(changes, grid),
    sections: likelySections(bars, grid),
  }
}
