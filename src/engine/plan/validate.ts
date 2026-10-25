import { sameGrid } from '../grid'
import {
  controlSpec,
  crossfaderGains,
  faderGain,
  isControlKey,
  type ControlKey,
  type ControlState,
} from '../mixer'
import { DECK_IDS, type BeatGrid, type DeckId } from '../model'
import { rateB, rateToSemitones, transitionBeatToDeckSec, type TransitionTiming } from '../time'
import { compile, stateAt } from './compile'
import { PLAN_SCHEMA_VERSION, type ControlEvent, type TransitionPlanV1 } from './types'

// Plan validation (D-19). Plans with errors are never compiled or scheduled.

export type ErrorCode =
  | 'schema-version'
  | 'non-finite'
  | 'invalid-grid'
  | 'span'
  | 'duplicate-id'
  | 'unknown-control'
  | 'out-of-range'
  | 'ramp-end'
  | 'outside-span'
  | 'overlap'
  | 'duplicate-set'
  | 'point-outside-track'
  | 'deck-b-ends-early'
  | 'missing-annotation'

export type WarningCode =
  | 'off-grid'
  | 'strategy-outdated'
  | 'pitch-change'
  | 'bass-clash'
  | 'poor-grid-fit'
  | 'grid-changed'

export interface PlanIssue<C extends string> {
  code: C
  message: string
  eventId?: string
  deck?: DeckId
}

export interface ValidationResult {
  errors: PlanIssue<ErrorCode>[]
  warnings: PlanIssue<WarningCode>[]
}

/** What the validator needs to know beyond the plan itself. Every field is optional. */
export interface ValidationContext {
  /** Decoded length of each deck's audio, in seconds. */
  durationSec?: Partial<Record<DeckId, number>>
  /** Each deck's grid now, to spot plans made with an older grid. */
  currentGrids?: Partial<Record<DeckId, BeatGrid>>
  /** Decks whose grid fit is poor (D-10). */
  poorGridFit?: Partial<Record<DeckId, boolean>>
  /** Current version of the plan's strategy. */
  strategyVersion?: number
}

/** Pitch change from the rate match at which a warning is shown (D-07, provisional). */
export const PITCH_WARNING_SEMITONES = 0.5
/** Events are expected on a 1/4-beat grid. */
export const EVENT_GRID_BEATS = 0.25
/** Low EQ position above which a deck's bass counts as "in" for the clash advisory. */
export const BASS_CLASH_EQ = 0.4
/** Deck gain (fader × crossfader) above which a deck counts as audible: −40 dB (provisional). */
export const AUDIBLE_GAIN = 0.01

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

export function validate(
  plan: TransitionPlanV1,
  context: ValidationContext = {},
): ValidationResult {
  const errors: PlanIssue<ErrorCode>[] = []
  const warnings: PlanIssue<WarningCode>[] = []
  const error = (code: ErrorCode, message: string, extra: Partial<PlanIssue<ErrorCode>> = {}) =>
    errors.push({ code, message, ...extra })
  const warn = (code: WarningCode, message: string, extra: Partial<PlanIssue<WarningCode>> = {}) =>
    warnings.push({ code, message, ...extra })

  if ((plan.schemaVersion as number) !== PLAN_SCHEMA_VERSION) {
    error(
      'schema-version',
      `Plan schema version ${String(plan.schemaVersion)} is not supported (expected ${PLAN_SCHEMA_VERSION})`,
    )
    return { errors, warnings }
  }

  // Numbers and grids
  const { startBeat, endBeat } = plan.span
  if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat)) {
    error('non-finite', 'The plan span must be finite numbers')
  } else if (endBeat <= startBeat) {
    error(
      'span',
      `The plan span ends at beat ${fmt(endBeat)}, not after its start ${fmt(startBeat)}`,
    )
  }
  for (const deck of DECK_IDS) {
    const g = plan.decks[deck].grid
    if (!(g.bpm > 0) || !Number.isFinite(g.bpm) || !Number.isFinite(g.anchorSec)) {
      error('invalid-grid', `Deck ${deck} has an invalid beat grid`, { deck })
    }
  }
  for (const [label, bar] of [
    ['exit bar of A', plan.points.exitBarA],
    ['entry bar of B', plan.points.entryBarB],
  ] as const) {
    if (!Number.isInteger(bar) || bar < 1) {
      error('point-outside-track', `The ${label} must be a whole bar from 1, got ${fmt(bar)}`)
    }
  }
  const exitBeat = plan.points.exitBeatA ?? 1
  const entryBeat = plan.points.entryBeatB ?? 1
  for (const [label, beat, deck] of [
    ['exit beat of A', exitBeat, 'A'],
    ['entry beat of B', entryBeat, 'B'],
  ] as const) {
    const perBar = plan.decks[deck].grid.beatsPerBar
    if (!Number.isInteger(beat) || beat < 1 || beat > perBar) {
      error(
        'point-outside-track',
        `The ${label} must be a whole beat from 1 to ${perBar}, got ${fmt(beat)}`,
      )
    }
  }

  // Initial state
  for (const [key, value] of Object.entries(plan.initial)) {
    if (!isControlKey(key)) {
      error('unknown-control', `Initial state sets unknown control "${key}"`)
    } else if (!Number.isFinite(value)) {
      error('non-finite', `Initial value of ${key} is not a finite number`)
    } else {
      checkRange(key, value, `Initial value of ${key}`, error)
    }
  }

  // Events
  const ids = new Set<string>()
  const annotationIds = new Set(plan.annotations.map((a) => a.id))
  const byControl = new Map<ControlKey, ControlEvent[]>()
  for (const e of plan.events) {
    const where = { eventId: e.id }
    const name = `Event "${e.id}"`
    if (ids.has(e.id)) error('duplicate-id', `${name} appears more than once`, where)
    ids.add(e.id)
    if (!isControlKey(e.control)) {
      error('unknown-control', `${name} uses unknown control "${String(e.control)}"`, where)
      continue
    }
    const numbers = [e.atBeat, e.to, ...(e.untilBeat === undefined ? [] : [e.untilBeat])]
    if (!numbers.every(Number.isFinite)) {
      error('non-finite', `${name} on ${e.control} has a value that is not a finite number`, where)
      continue
    }
    checkRange(e.control, e.to, `${name} on ${e.control}: target`, error, where)
    const end = e.kind === 'ramp' ? e.untilBeat : e.atBeat
    if (e.kind === 'ramp' && (e.untilBeat === undefined || e.untilBeat <= e.atBeat)) {
      error(
        'ramp-end',
        e.untilBeat === undefined
          ? `${name} on ${e.control} is a ramp without an end beat`
          : `${name} on ${e.control}: ramp ends at beat ${fmt(e.untilBeat)}, not after its start ${fmt(e.atBeat)}`,
        where,
      )
      continue
    }
    if (e.atBeat < startBeat || (end ?? e.atBeat) > endBeat) {
      error(
        'outside-span',
        `${name} on ${e.control} is outside the plan span ${fmt(startBeat)}…${fmt(endBeat)}`,
        where,
      )
    }
    if (e.annotationId !== undefined && !annotationIds.has(e.annotationId)) {
      error('missing-annotation', `${name} refers to missing annotation "${e.annotationId}"`, where)
    }
    if (!onGrid(e.atBeat) || (e.untilBeat !== undefined && !onGrid(e.untilBeat))) {
      warn('off-grid', `${name} on ${e.control} is not on a 1/4-beat grid`, where)
    }
    const list = byControl.get(e.control) ?? []
    list.push(e)
    byControl.set(e.control, list)
  }
  for (const [control, events] of byControl) checkOverlaps(control, events, error)

  // Tracks
  if (!errors.some((e) => e.code === 'invalid-grid' || e.code === 'point-outside-track')) {
    const timing: TransitionTiming = {
      gridA: plan.decks.A.grid,
      gridB: plan.decks.B.grid,
      ...plan.points,
    }
    const durations = context.durationSec ?? {}
    const startA = transitionBeatToDeckSec(timing, 'A', 0)
    const startB = transitionBeatToDeckSec(timing, 'B', 0)
    if (durations.A !== undefined && startA >= durations.A) {
      error(
        'point-outside-track',
        `Blend start ${plan.points.exitBarA}.${exitBeat} is after the end of track A`,
        {
          deck: 'A',
        },
      )
    }
    if (durations.B !== undefined && startB >= durations.B) {
      error(
        'point-outside-track',
        `Entry ${plan.points.entryBarB}.${entryBeat} is after the end of track B`,
        {
          deck: 'B',
        },
      )
    } else if (durations.B !== undefined && Number.isFinite(endBeat)) {
      const endB = transitionBeatToDeckSec(timing, 'B', endBeat)
      if (endB > durations.B) {
        error(
          'deck-b-ends-early',
          `Track B ends ${fmt(endB - durations.B)} s before the plan ends at beat ${fmt(endBeat)}`,
          { deck: 'B' },
        )
      }
    }
    const semitones = rateToSemitones(rateB(timing))
    if (Math.abs(semitones) >= PITCH_WARNING_SEMITONES) {
      warn(
        'pitch-change',
        `Matching the tempo shifts track B by ${semitones > 0 ? '+' : ''}${semitones.toFixed(2)} semitones`,
        { deck: 'B' },
      )
    }
  }

  // Context advisories
  if (context.strategyVersion !== undefined && plan.strategy.version < context.strategyVersion) {
    warn(
      'strategy-outdated',
      `Made with version ${plan.strategy.version} of strategy "${plan.strategy.id}"; the current version is ${context.strategyVersion}`,
    )
  }
  for (const deck of DECK_IDS) {
    if (context.poorGridFit?.[deck]) {
      warn('poor-grid-fit', `Deck ${deck}'s tempo may vary: long blends may drift`, { deck })
    }
    const current = context.currentGrids?.[deck]
    if (current && !sameGrid(current, plan.decks[deck].grid)) {
      warn('grid-changed', `Deck ${deck}'s beat grid changed since this plan was made`, { deck })
    }
  }

  if (errors.length === 0) {
    const clash = findBassClash(plan)
    if (clash) {
      warn(
        'bass-clash',
        `Both decks play full bass from beat ${fmt(clash.from)} to ${fmt(clash.to)}`,
      )
    }
  }

  return { errors, warnings }
}

function onGrid(beat: number): boolean {
  const steps = beat / EVENT_GRID_BEATS
  return Math.abs(steps - Math.round(steps)) < 1e-9
}

function checkRange(
  key: ControlKey,
  value: number,
  label: string,
  error: (code: ErrorCode, message: string, extra?: Partial<PlanIssue<ErrorCode>>) => void,
  extra: Partial<PlanIssue<ErrorCode>> = {},
) {
  const { min, max } = controlSpec(key)
  if (value < min || value > max) {
    error('out-of-range', `${label} ${fmt(value)} is outside ${min}…${max}`, extra)
  }
}

function checkOverlaps(
  control: ControlKey,
  events: ControlEvent[],
  error: (code: ErrorCode, message: string, extra?: Partial<PlanIssue<ErrorCode>>) => void,
) {
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < events.length; j++) {
      const a = events[i]!
      const b = events[j]!
      const where = { eventId: b.id }
      if (a.kind === 'set' && b.kind === 'set') {
        if (a.atBeat === b.atBeat) {
          error(
            'duplicate-set',
            `Events "${a.id}" and "${b.id}" both set ${control} at beat ${fmt(a.atBeat)}`,
            where,
          )
        }
        continue
      }
      // A set exactly at a ramp's end is allowed; anywhere else inside it is not.
      const aEnd = a.kind === 'ramp' ? a.untilBeat! : a.atBeat
      const bEnd = b.kind === 'ramp' ? b.untilBeat! : b.atBeat
      const overlap =
        a.kind === 'ramp' && b.kind === 'ramp'
          ? a.atBeat < bEnd && b.atBeat < aEnd
          : a.kind === 'ramp'
            ? b.atBeat >= a.atBeat && b.atBeat < aEnd
            : a.atBeat >= b.atBeat && a.atBeat < bEnd
      if (overlap) {
        error('overlap', `Events "${a.id}" and "${b.id}" overlap on ${control}`, where)
      }
    }
  }
}

function deckAudible(state: ControlState, deck: DeckId): boolean {
  return (
    faderGain(state[`${deck}.fader`]) * crossfaderGains(state['mixer.crossfader'])[deck] >
    AUDIBLE_GAIN
  )
}

/** First stretch longer than one beat where both decks are audible with their bass in. */
function findBassClash(plan: TransitionPlanV1): { from: number; to: number } | undefined {
  const compiled = compile(plan)
  const { startBeat, endBeat } = plan.span
  let from: number | undefined
  for (let beat = startBeat; beat <= endBeat; beat += EVENT_GRID_BEATS) {
    const s = stateAt(compiled, beat)
    const clash =
      s['A.eqLow'] > BASS_CLASH_EQ &&
      s['B.eqLow'] > BASS_CLASH_EQ &&
      deckAudible(s, 'A') &&
      deckAudible(s, 'B')
    if (clash) {
      from ??= beat
    } else if (from !== undefined) {
      if (beat - from > 1) return { from, to: beat }
      from = undefined
    }
  }
  if (from !== undefined && endBeat - from > 1) return { from, to: endBeat }
  return undefined
}
