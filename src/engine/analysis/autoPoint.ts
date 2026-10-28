import { isPhraseStart } from '../grid'
import { english, type Translate } from '../../i18n'
import type { BeatGrid } from '../model'
import { fitArea, type AreaRequest, type FittedArea } from '../plan/area'
import { areaContextFor, loopToFill, resolveLoop, type LoopRequest } from '../plan/loop'
import { barToBeat, type TransitionTiming } from '../time'
import { mainLevels, type BarFeatures, type TrackStructure } from './structure'

// Auto transition point (#77): candidate blend starts for the long blend, ranked from
// what the structure analysis actually measures. A candidate is a phrase line of A
// lined up with a phrase line of B, with the transition area around it; the long blend
// brings B in before it, swaps the bass on it and takes A out after it (#75).
//
// What a candidate is scored on, all per bar on the user's grids:
// - phrase lines that the music confirms: a measured change at the line in A or B;
// - the bass handoff: B has low end after the swap, ideally arriving right on it;
// - room: B layers in over its sparser bars, A leaves over its sparser bars;
// - energy across the swap: steady, or lifting with the "lift" preference;
// - where it sits: late in A, early in B, and the area fits both without trimming.
// Levels are compared within each track, relative to its main part, never between
// tracks: two masters differ in loudness. Vocals, key and melody are not analysed, so
// nothing here claims anything about them (AUTO_LIMITS). A candidate is a suggestion
// with its reasons, for the user to hear and change; the ranking is not a verdict.
//
// Loop-assisted alternative (#81): where a pairing's area had to be trimmed because one
// track has no music there, Auto also tries the loop that gives the bars back (B's first
// bars before the blend start, or A's bars from it). The pairing ranks by its better
// form, the loop paying a small cost, but the straight form is always the one put in
// place first; the loop is offered beside it. Auto never claims a loop sounds better.

export type AutoLength = 'short' | 'medium' | 'long'
export type AutoEnergy = 'steady' | 'lift'

/** What the user would like the transition to do; anything left out uses the defaults. */
export interface AutoPreferences {
  /** The transition area; without it, the area the user already has. */
  length?: AutoLength
  /** Keep the energy steady across the swap (default), or lift it into B. */
  energy?: AutoEnergy
}

/** Bars on each side of the blend start for each length. */
export const LENGTH_BARS: Record<AutoLength, number> = { short: 4, medium: 8, long: 16 }

export interface AutoTrack {
  structure: TrackStructure
  grid: BeatGrid
  /** Track beats of music from bar 1 to the end of the file. */
  beats: number
}

/** The same pairing with a loop that fills what the straight form had to trim. */
export interface LoopAlternative {
  loop: LoopRequest
  fitted: FittedArea
  score: number
  /** What the loop gives back, measured in bars. */
  reasons: string[]
  cautions: string[]
}

export interface AutoCandidate {
  exitBarA: number
  entryBarB: number
  area: AreaRequest
  fitted: FittedArea
  score: number
  /** Why it may work, from what was measured. */
  reasons: string[]
  /** The bars it blends: the last of `reasons`, which the loop form restates. */
  blends: string
  /** What to listen for, or what Auto could not check. */
  cautions: string[]
  /** A loop-assisted form of the same pairing, when a loop gives back trimmed bars. */
  alternative?: LoopAlternative
}

/** What a loop costs in the ranking: a straight form wins when the two are equal. */
export const LOOP_COST = 0.5

export const AUTO_LIMITS =
  'Auto reads level, low end and highs per bar on your grids. It does not hear vocals, key or melody, so listen for clashes.'

const PHRASE = 8
/** Weak low end: about the threshold the structure analysis uses for "mostly absent". */
const LOW_ABSENT_DB = 12

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const dB = (x: number) => `${Math.round(Math.abs(x))} dB`

/** A stretch of bars compared with its track's main part; positive "by" values are less. */
interface Part {
  fromBar: number
  toBar: number
  /** Level relative to the main part: 0 at full level, negative when quieter. */
  level: number
  lowBy: number
  highsBy: number
  /** 0 as full as the main part, 1 clearly sparser (12 dB or more less of something). */
  thin: number
}

function measure(
  bars: readonly BarFeatures[],
  main: ReturnType<typeof mainLevels>,
  fromBar: number,
  toBar: number,
): Part | null {
  const bs = bars.slice(Math.max(0, fromBar - 1), Math.max(0, toBar))
  if (bs.length === 0) return null
  const level = mean(bs.map((b) => b.energyDb)) - main.energy
  const lowBy = main.low - mean(bs.map((b) => b.lowDb))
  const highsBy = main.high - mean(bs.map((b) => b.highDb))
  return {
    fromBar,
    toBar,
    level,
    lowBy,
    highsBy,
    thin: clamp01(Math.max(-level, lowBy, highsBy) / 12),
  }
}

function sectionAt(s: TrackStructure, bar: number): string | undefined {
  return s.sections.find((x) => x.fromBar <= bar && bar <= x.toBar)?.term
}

/** "B's bars 1–16 (likely INTRO)" or "B's bars 1–16". */
function barsName(deck: 'A' | 'B', s: TrackStructure, w: Part, t: Translate): string {
  const term = sectionAt(s, w.fromBar)
  const same = term !== undefined && term === sectionAt(s, w.toBar)
  const params = { deck, from: w.fromBar, to: w.toBar, term: term ?? '' }
  return t(same ? 'auto.barsNamed' : 'auto.deckBars', params)
}

/** What is sparser about a window, in words. */
function sparser(w: Part, t: Translate): string {
  const parts: string[] = []
  if (w.lowBy >= 6) parts.push(t('auto.lessLow', { db: dB(w.lowBy) }))
  if (w.highsBy >= 6) parts.push(t('auto.lessHighs', { db: dB(w.highsBy) }))
  if (-w.level >= 6) parts.push(t('auto.quieter', { db: dB(w.level) }))
  return parts.length > 0 ? parts.join(', ') : t('auto.sparser')
}

const hasChangeNear = (s: TrackStructure, bar: number) =>
  s.changes.some((c) => Math.abs(c.bar - bar) <= 1)

/** A deck's phrase lines miss most of its changes: its grid may be off. */
function gridDoubt(s: TrackStructure): boolean {
  const { changes, onLines } = s.phraseCheck
  return changes >= 3 && onLines < changes / 2
}

function phraseLines(t: AutoTrack): number[] {
  const lines: number[] = []
  for (let bar = 1; bar <= t.structure.bars.length; bar++)
    if (isPhraseStart(t.grid, bar, PHRASE)) lines.push(bar)
  return lines
}

/** The area a preference asks for. */
export function areaFor(prefs: AutoPreferences, current: AreaRequest): AreaRequest {
  if (!prefs.length) return current
  const bars = LENGTH_BARS[prefs.length]
  return { beforeBars: bars, afterBars: bars, linked: true }
}

/**
 * Up to `count` candidate blend starts, best first. Each one pairs a different bar of A
 * with a different bar of B, so the next idea is not the same idea moved by a phrase.
 */
export function suggestBlendStarts(
  a: AutoTrack,
  b: AutoTrack,
  current: AreaRequest,
  prefs: AutoPreferences = {},
  count = 3,
  t: Translate = english,
): AutoCandidate[] {
  const area = areaFor(prefs, current)
  const lift = prefs.energy === 'lift'
  const mainA = mainLevels(a.structure.bars)
  const mainB = mainLevels(b.structure.bars)
  const nA = a.structure.bars.length
  const nB = b.structure.bars.length
  if (nA === 0 || nB === 0) return []
  const wantBeats = Math.round(area.beforeBars * 4) + Math.round(area.afterBars * 4)

  const scored: AutoCandidate[] = []
  for (const exitBarA of phraseLines(a)) {
    for (const entryBarB of phraseLines(b)) {
      const fitted = fitArea(
        area,
        {
          startBeatA: barToBeat(a.grid, exitBarA),
          entryBeatB: barToBeat(b.grid, entryBarB),
          beatsA: a.beats,
          beatsB: b.beats,
        },
        t,
      )
      if (fitted.tooShort) continue
      const before = Math.floor(fitted.beforeBeats / 4)
      const after = Math.floor(fitted.afterBeats / 4)
      // A carries while B comes in; B carries after the swap while A leaves.
      const aIn = measure(a.structure.bars, mainA, exitBarA - before, exitBarA - 1)
      const aOut = measure(a.structure.bars, mainA, exitBarA, exitBarA + after - 1)
      const bIn = measure(b.structure.bars, mainB, entryBarB - before, entryBarB - 1)
      const bOut = measure(b.structure.bars, mainB, entryBarB, entryBarB + after - 1)

      const confirmA = hasChangeNear(a.structure, exitBarA) ? 1 : 0
      const confirmB = hasChangeNear(b.structure, entryBarB) ? 1 : 0
      const arrive = bIn && bOut ? clamp01((bIn.lowBy - bOut.lowBy) / 12) : 0
      const bassMissing = bOut !== null && bOut.lowBy >= LOW_ABSENT_DB
      const bass = bassMissing ? 0 : 0.5 + 0.5 * arrive
      const room = mean([bIn?.thin ?? 0, aOut?.thin ?? 0])
      const flow = aIn && bOut ? bOut.level - aIn.level : 0
      const energy = lift ? 0.6 * clamp01(flow / 6) + 0.4 * arrive : 1 - clamp01(Math.abs(flow) / 9)
      // DJs usually play most of the outgoing track and bring the next one in from near
      // its start: the blend ends late in A and starts early in B.
      const late = clamp01(((exitBarA + after - 1) / nA - 0.5) / 0.4)
      const early = 1 - clamp01(((entryBarB - before - 1) / nB - 0.1) / 0.4)
      // The area the user asked for matters more than a better spot: trimming costs a lot.
      const fit = wantBeats > 0 ? clamp01((fitted.beforeBeats + fitted.afterBeats) / wantBeats) : 1

      const score =
        0.5 * confirmA +
        0.5 * confirmB +
        1.5 * bass +
        (lift ? 0.5 : 1) * room +
        (lift ? 2 : 1) * energy +
        2 * late +
        2 * early +
        3 * fit * fit

      const reasons = [t('auto.phrase', { a: exitBarA, b: entryBarB })]
      const cautions: string[] = []
      if (confirmA) reasons.push(t('auto.changesA', { bar: exitBarA }))
      if (confirmB) reasons.push(t('auto.changesB', { bar: entryBarB }))
      if (bOut && arrive >= 0.5)
        reasons.push(t('auto.lowArrives', { bar: entryBarB, db: dB(bIn!.lowBy - bOut.lowBy) }))
      if (bassMissing) cautions.push(t('auto.lowMissing', { bar: entryBarB }))
      if (aIn && aIn.lowBy >= LOW_ABSENT_DB && !bassMissing)
        reasons.push(t('auto.lowOutA', { bar: exitBarA }))
      if (bIn && bIn.thin >= 0.5)
        reasons.push(
          t('auto.sparserB', { bars: barsName('B', b.structure, bIn, t), how: sparser(bIn, t) }),
        )
      if (aOut && aOut.thin >= 0.5)
        reasons.push(
          t('auto.sparserA', { bars: barsName('A', a.structure, aOut, t), how: sparser(aOut, t) }),
        )
      if (room < 0.25 && (bIn || aOut)) cautions.push(t('auto.full'))
      if (aIn && bOut) {
        if (lift && flow >= 3) reasons.push(t('auto.lifts', { db: dB(flow) }))
        else if (!lift && Math.abs(flow) < 3) reasons.push(t('auto.similar'))
        else if (!lift && Math.abs(flow) >= 6)
          cautions.push(t(flow > 0 ? 'auto.levelRises' : 'auto.levelDrops', { db: dB(flow) }))
        else if (lift && flow < 3) cautions.push(t('auto.noLift'))
      }
      const tailB = Math.max(0, nB - (entryBarB + after - 1))
      const blends = t('auto.blends', {
        fromA: exitBarA - before,
        toA: exitBarA + after - 1,
        nA,
        fromB: entryBarB - before,
        toB: entryBarB + after - 1,
        tail: tailB,
      })
      reasons.push(blends)
      if (late < 0.25) cautions.push(t('auto.leavesEarly', { bar: exitBarA, n: nA }))
      if (early < 0.25) cautions.push(t('auto.comesLate', { bar: entryBarB, n: nB }))
      cautions.push(...fitted.trimmed)

      const alternative =
        loopAlternative(a, b, exitBarA, entryBarB, area, fitted, wantBeats, t) ?? undefined
      if (alternative) alternative.score += score - 3 * fit * fit
      scored.push({
        exitBarA,
        entryBarB,
        area,
        fitted,
        score,
        reasons,
        blends,
        cautions,
        alternative,
      })
    }
  }

  const rank = (c: AutoCandidate) => Math.max(c.score, c.alternative?.score ?? -Infinity)
  scored.sort((x, y) => rank(y) - rank(x) || y.exitBarA - x.exitBarA || x.entryBarB - y.entryBarB)
  const picked: AutoCandidate[] = []
  for (const c of scored) {
    if (picked.length >= count) break
    if (picked.some((p) => p.exitBarA === c.exitBarA || p.entryBarB === c.entryBarB)) continue
    picked.push(c)
  }

  // Cautions that hold for every candidate: the grids and how much structure was found.
  const shared: string[] = []
  if (gridDoubt(a.structure)) shared.push(t('auto.gridDoubt', { deck: 'A' }))
  if (gridDoubt(b.structure)) shared.push(t('auto.gridDoubt', { deck: 'B' }))
  if (a.structure.changes.length === 0 && b.structure.changes.length === 0)
    shared.push(t('auto.noChanges'))
  for (const c of picked) {
    c.cautions.push(...shared)
    if (c.alternative) {
      const deck = c.alternative.loop.deck
      if (gridDoubt((deck === 'A' ? a : b).structure))
        c.alternative.cautions.push(t('auto.loopGrid', { deck }))
    }
  }
  return picked
}

/**
 * The loop that fills what this pairing's area had to trim, with its fitted area and the
 * part of the score that changes (the fit, less the loop's cost), or null.
 */
function loopAlternative(
  a: AutoTrack,
  b: AutoTrack,
  exitBarA: number,
  entryBarB: number,
  area: AreaRequest,
  straight: FittedArea,
  wantBeats: number,
  t: Translate,
): LoopAlternative | null {
  if (straight.trimmed.length === 0) return null
  const timing: TransitionTiming = { gridA: a.grid, gridB: b.grid, exitBarA, entryBarB }
  const beats = { A: a.beats, B: b.beats }
  const request = loopToFill(area, timing, beats)
  if (!request) return null
  const on = request.deck === 'A' ? a : b
  const entryBeat = barToBeat(on.grid, request.deck === 'A' ? exitBarA : entryBarB)
  const resolved = resolveLoop(request, { grid: on.grid, entryBeat, beats: on.beats })
  if ('error' in resolved) return null
  const fitted = fitArea(area, areaContextFor({ ...timing, loop: resolved.loop }, beats), t)
  const gained = fitted.beforeBeats + fitted.afterBeats - straight.beforeBeats - straight.afterBeats
  if (gained < 4 || fitted.tooShort) return null
  const fit = wantBeats > 0 ? clamp01((fitted.beforeBeats + fitted.afterBeats) / wantBeats) : 1

  const { loop } = resolved
  const fromBar = loop.startBeat / 4 + 1
  const toBar = fromBar + request.bars - 1
  const deckBars = t('auto.deckBars', { deck: request.deck, from: fromBar, to: toBar })
  const reasons: string[] = []
  const cautions: string[] = []
  const times = request.passes === 2 ? t('auto.twice') : t('auto.times', { n: request.passes })
  if (request.deck === 'B') {
    reasons.push(
      t('auto.loopB', {
        n: Math.floor(straight.beforeBeats / 4),
        bar: entryBarB,
        bars: deckBars,
        times,
        m: Math.floor(fitted.beforeBeats / 4),
      }),
    )
  } else {
    reasons.push(
      t('auto.loopA', {
        n: Math.floor(straight.afterBeats / 4),
        bar: exitBarA,
        bars: deckBars,
        times,
        m: Math.floor(fitted.afterBeats / 4),
      }),
    )
  }
  cautions.push(t('auto.loopJump', { to: toBar + 1, from: fromBar }))
  cautions.push(...fitted.trimmed)
  return { loop: request, fitted, score: 3 * fit * fit - LOOP_COST, reasons, cautions }
}
