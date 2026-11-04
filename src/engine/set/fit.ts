import { english, type Translate } from '../../i18n'
import { drive, sectionBars, type TrackProfile } from './profile'

// How well two neighbouring tracks of a set fit (the set planner for one DJ): the tempo
// step, the keys on the Camelot wheel, the room each track leaves for a blend, and the
// mixing technique that suits the pair, with the reasons in words. Tempo and room are
// measured; the key is the one the DJ typed (from rekordbox, Serato or by ear), never
// detected, so a pair without keys says that it could not check them. The technique is
// a starting point to try in the Lab, not a verdict.

/** A key on the Camelot wheel: 1–12, A minor, B major. */
export interface CamelotKey {
  n: number
  mode: 'A' | 'B'
}

const NOTES: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** Pitch class (0 = C) and mode to Camelot: A minor is 8A, C major is 8B, a fifth up is +1. */
function camelotOf(pc: number, minor: boolean): CamelotKey {
  const fromHome = ((((pc - (minor ? 9 : 0)) * 7) % 12) + 12) % 12
  return { n: ((fromHome + 7) % 12) + 1, mode: minor ? 'A' : 'B' }
}

/**
 * A key as DJ software writes it: Camelot (8A, 08A), Open Key (1m, 1d) or the musical
 * name (Am, A minor, F#m, Bbmaj, C). Null when it cannot be read.
 */
export function parseKey(text: string | undefined): CamelotKey | null {
  if (!text) return null
  const s = text.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  const camelot = /^0?(\d{1,2})\s*([ab])$/i.exec(s)
  if (camelot) {
    const n = Number(camelot[1])
    if (n >= 1 && n <= 12) return { n, mode: camelot[2]!.toUpperCase() as 'A' | 'B' }
  }
  const open = /^0?(\d{1,2})\s*([dm])$/i.exec(s)
  if (open) {
    const n = Number(open[1])
    if (n >= 1 && n <= 12)
      return { n: ((n - 1 + 7) % 12) + 1, mode: open[2]!.toLowerCase() === 'm' ? 'A' : 'B' }
  }
  const named = /^([a-g])\s*(#|b)?\s*(m|min|minor|moll|maj|major|dur)?$/i.exec(s)
  if (named) {
    const accidental = named[2] === '#' ? 1 : named[2] === 'b' ? -1 : 0
    const pc = (NOTES[named[1]!.toLowerCase()]! + accidental + 12) % 12
    const mode = named[3] ?? ''
    // "m" alone is minor; "M" alone is major, as in Am / AM.
    const minor = mode === 'm' || /^(min|minor|moll)$/i.test(mode)
    return camelotOf(pc, minor)
  }
  return null
}

export const camelotText = (k: CamelotKey) => `${k.n}${k.mode}`

export type KeyRelation =
  'same' | 'neighbour' | 'relative' | 'diagonal' | 'twoSteps' | 'semitone' | 'clash' | 'unknown'

export type KeyGrade = 'compatible' | 'workable' | 'clash' | 'unknown'

export function keyRelation(a: CamelotKey | null, b: CamelotKey | null): KeyRelation {
  if (!a || !b) return 'unknown'
  const step = (((b.n - a.n) % 12) + 12) % 12
  const sameMode = a.mode === b.mode
  if (sameMode && step === 0) return 'same'
  if (sameMode && (step === 1 || step === 11)) return 'neighbour'
  if (!sameMode && step === 0) return 'relative'
  if (!sameMode && (step === 1 || step === 11)) return 'diagonal'
  if (sameMode && (step === 2 || step === 10)) return 'twoSteps'
  // +7 / −7 on the wheel is a semitone up or down: the classic key-change lift.
  if (sameMode && (step === 7 || step === 5)) return 'semitone'
  return 'clash'
}

export function keyGrade(relation: KeyRelation): KeyGrade {
  if (relation === 'unknown') return 'unknown'
  if (relation === 'same' || relation === 'neighbour' || relation === 'relative')
    return 'compatible'
  if (relation === 'clash') return 'clash'
  return 'workable'
}

/** Up to this tempo change, B can be matched to A without anyone hearing it. */
export const CLOSE_PERCENT = 2.5
/** Beyond this, a long overlap makes the stretched track audibly slower or faster. */
export const JUMP_PERCENT = 6

export type TempoGrade = 'close' | 'stretch' | 'double' | 'jump'

export interface TempoStep {
  from: number
  to: number
  /** B's tempo against A's, in percent: + faster. */
  percent: number
  grade: TempoGrade
}

export function tempoStep(from: number, to: number): TempoStep {
  const percent = ((to - from) / from) * 100
  const abs = Math.abs(percent)
  const ratio = to / from
  const double = Math.abs(ratio - 2) / 2 <= 0.03 || Math.abs(ratio - 0.5) / 0.5 <= 0.03
  const grade: TempoGrade =
    abs <= CLOSE_PERCENT ? 'close' : abs <= JUMP_PERCENT ? 'stretch' : double ? 'double' : 'jump'
  return { from, to, percent, grade }
}

/** Bars a track gives a blend: A's sparse bars at its end, B's at its start. */
export function roomOut(t: TrackProfile): number {
  const last = t.structure.sections.at(-1)
  return last?.term === 'OUTRO' ? sectionBars(last) : 0
}

export function roomIn(t: TrackProfile): number {
  const first = t.structure.sections[0]
  return first?.term === 'INTRO' ? sectionBars(first) : 0
}

/** The techniques of the Mixing techniques part a pair can be pointed to. */
export type FitTechnique = 'longBlend' | 'bassSwap' | 'midSwap' | 'cut' | 'loopIntro' | 'loopOutro'

export type FitGrade = 'smooth' | 'workable' | 'tricky'

export interface PairFit {
  from: string
  to: string
  tempo: TempoStep
  keys: { from: CamelotKey | null; to: CamelotKey | null; relation: KeyRelation; grade: KeyGrade }
  room: { out: number; in: number }
  /** How much harder B drives than A, −1..1, within the collection. */
  lift: number
  grade: FitGrade
  technique: FitTechnique
  /** Why this technique, in the DJ's language. */
  reasons: string[]
  /** What to check by ear or set on the deck. */
  cautions: string[]
}

const LONG_ROOM = 16
const SOME_ROOM = 8

function chooseTechnique(tempo: TempoStep, key: KeyGrade, out: number, inn: number): FitTechnique {
  if (tempo.grade === 'jump') return 'cut'
  if (key === 'clash') return out >= SOME_ROOM || inn >= SOME_ROOM ? 'midSwap' : 'cut'
  if (out < SOME_ROOM && inn < SOME_ROOM) return 'cut'
  if (inn < SOME_ROOM) return 'loopIntro'
  if (out < SOME_ROOM) return 'loopOutro'
  if (key === 'compatible' && out >= LONG_ROOM && inn >= LONG_ROOM) return 'longBlend'
  return 'bassSwap'
}

/** How A → B fits, given the collection the drive is measured within. */
export function pairFit(
  a: TrackProfile,
  b: TrackProfile,
  drives: Map<string, number>,
  t: Translate = english,
): PairFit {
  const tempo = tempoStep(a.grid.bpm, b.grid.bpm)
  const ka = parseKey(a.key)
  const kb = parseKey(b.key)
  const relation = keyRelation(ka, kb)
  const kg = keyGrade(relation)
  const out = roomOut(a)
  const inn = roomIn(b)
  const lift = (drives.get(b.id) ?? 0.5) - (drives.get(a.id) ?? 0.5)
  const technique = chooseTechnique(tempo, kg, out, inn)

  const grade: FitGrade =
    tempo.grade === 'jump' || kg === 'clash'
      ? 'tricky'
      : tempo.grade === 'close' && kg === 'compatible'
        ? 'smooth'
        : 'workable'

  const pct = `${tempo.percent >= 0 ? '+' : '−'}${Math.abs(tempo.percent).toFixed(1)}`
  const reasons: string[] = [t(`fit.tempo.${tempo.grade}`, { pct })]
  if (ka && kb)
    reasons.push(t(`fit.key.${relation}`, { from: camelotText(ka), to: camelotText(kb) }))
  reasons.push(t('fit.room', { out, in: inn }))
  reasons.push(t(`fit.why.${technique}`, { out, in: inn }))

  const cautions: string[] = []
  if (!ka || !kb) cautions.push(t('fit.caution.noKey'))
  if (tempo.grade === 'stretch' || tempo.grade === 'jump') cautions.push(t('fit.caution.keyLock'))
  if (tempo.grade === 'jump') cautions.push(t('fit.caution.bridge'))
  if (lift <= -0.35) cautions.push(t('fit.caution.drop'))

  return {
    from: a.id,
    to: b.id,
    tempo,
    keys: { from: ka, to: kb, relation, grade: kg },
    room: { out, in: inn },
    lift,
    grade,
    technique,
    reasons,
    cautions,
  }
}

/** Every neighbouring pair of an order. */
export function orderFits(
  order: readonly string[],
  tracks: readonly TrackProfile[],
  t: Translate = english,
): PairFit[] {
  const byId = new Map(tracks.map((x) => [x.id, x]))
  const drives = drive(tracks)
  const out: PairFit[] = []
  for (let k = 1; k < order.length; k++) {
    const a = byId.get(order[k - 1]!)
    const b = byId.get(order[k]!)
    if (a && b) out.push(pairFit(a, b, drives, t))
  }
  return out
}

// ---------------------------------------------------------------- The order that flows

/** What a step from A to B costs: tempo, key and a drop in drive. Lower flows better. */
export function stepCost(a: TrackProfile, b: TrackProfile, drives: Map<string, number>): number {
  const tempo = tempoStep(a.grid.bpm, b.grid.bpm)
  const abs = Math.abs(tempo.percent)
  const tempoCost =
    tempo.grade === 'jump' ? 4 + abs / 10 : tempo.grade === 'double' ? 2 : abs / CLOSE_PERCENT
  // A slower next track is a step back in a set that climbs: a little dearer.
  const slower = tempo.percent < -0.5 ? 0.5 : 0
  const key = keyGrade(keyRelation(parseKey(a.key), parseKey(b.key)))
  const keyCost = { compatible: 0, workable: 1, clash: 3, unknown: 0.4 }[key]
  const lift = (drives.get(b.id) ?? 0.5) - (drives.get(a.id) ?? 0.5)
  const dropCost = lift < 0 ? -lift * 3 : 0
  return tempoCost + slower + keyCost + dropCost
}

function pathCost(order: readonly number[], cost: number[][]): number {
  let sum = 0
  for (let k = 1; k < order.length; k++) sum += cost[order[k - 1]!]![order[k]!]!
  return sum
}

/**
 * The order of the tracks with the smallest total step cost: each next track close in
 * tempo and key and not a step down in drive. `first`, when given, stays the opener.
 * Nearest neighbour from every allowed start, then moving single tracks while it helps.
 */
export function flowOrder(tracks: readonly TrackProfile[], first?: string): string[] {
  const n = tracks.length
  if (n <= 1) return tracks.map((x) => x.id)
  const drives = drive(tracks)
  const cost = tracks.map((a) => tracks.map((b) => (a === b ? 0 : stepCost(a, b, drives))))
  const fixed = first === undefined ? -1 : tracks.findIndex((x) => x.id === first)
  const starts = fixed >= 0 ? [fixed] : tracks.map((_, i) => i)
  let best: number[] = []
  let bestCost = Infinity
  for (const s of starts) {
    const order = [s]
    const left = new Set(tracks.map((_, i) => i).filter((i) => i !== s))
    while (left.size > 0) {
      const last = order.at(-1)!
      let pick = -1
      for (const i of left) if (pick < 0 || cost[last]![i]! < cost[last]![pick]!) pick = i
      order.push(pick)
      left.delete(pick)
    }
    improve(order, cost, fixed >= 0 ? 1 : 0)
    const c = pathCost(order, cost)
    if (c < bestCost - 1e-9) {
      best = order
      bestCost = c
    }
  }
  return best.map((i) => tracks[i]!.id)
}

/** Moves one track at a time to wherever it lowers the cost, until nothing does. */
function improve(order: number[], cost: number[][], from: number): void {
  let better = true
  let rounds = 0
  while (better && rounds++ < 50) {
    better = false
    for (let i = from; i < order.length; i++) {
      for (let j = from; j < order.length; j++) {
        if (i === j) continue
        const moved = [...order]
        const [x] = moved.splice(i, 1)
        moved.splice(j, 0, x!)
        if (pathCost(moved, cost) < pathCost(order, cost) - 1e-9) {
          order.splice(0, order.length, ...moved)
          better = true
        }
      }
    }
  }
}

/** A short summary of an order's fits: how many pairs are smooth, workable and tricky. */
export function fitTally(fits: readonly PairFit[]): Record<FitGrade, number> {
  const tally: Record<FitGrade, number> = { smooth: 0, workable: 0, tricky: 0 }
  for (const f of fits) tally[f.grade]++
  return tally
}
