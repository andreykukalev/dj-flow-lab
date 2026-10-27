import { english, type Translate } from '../../i18n'
import { controlSpec, type ControlKey } from '../mixer'
import type { DeckId } from '../model'
import { planTiming } from '../plan/loop'
import type { ControlEvent, TransitionPlanV1 } from '../plan/types'
import {
  formatBarBeat,
  loopSchedule,
  toBarBeat,
  transitionBeatToDeckBeat,
  type TransitionTiming,
} from '../time'
import type { DjId, TrackProfile } from './profile'
import { pairKey, transitions, type SetPlan } from './spine'
import { agreed, type TransitionVersion, type TransitionWork } from './versions'

// The set sheet (#95): who plays when, and each transition as steps at bars in the
// controller's names (DDJ-400 first), generated from the version the DJs agreed on, each
// with its reason in one line. Bars are counted on the track playing out, as a DJ counts
// them. Nothing on the sheet is new information: it is the plan, written for the night.

export type PhysicalDeck = 1 | 2

export interface SheetSlot {
  trackId: string
  deck: PhysicalDeck
  player: DjId
}

export interface SheetStep {
  /** `bar.beat` of the outgoing track, or a range "47.1–55.1". */
  at: string
  /** The transition beat the step starts on, for ordering. */
  beat: number
  deck: PhysicalDeck
  action: string
  why: string
}

export interface SheetTransition {
  index: number
  from: string
  to: string
  outDeck: PhysicalDeck
  inDeck: PhysicalDeck
  mixedBy: DjId
  version: TransitionVersion | null
  /** Why this version, or what is missing. */
  note: string
  /** Where the incoming track is cued: its `bar.beat`, and the outgoing bar to press PLAY on. */
  cue: { inAt: string; playAt: string; playBeat: number } | null
  steps: SheetStep[]
}

export interface SetSheet {
  slots: SheetSlot[]
  transitions: SheetTransition[]
}

/** Decks alternate: the first track on deck 1, the next on deck 2, and so on. */
export const deckOf = (index: number): PhysicalDeck => (index % 2 === 0 ? 1 : 2)

/** The controller's own names for its knobs: the same in every language. */
const KNOB_NAMES: Record<string, string> = {
  eqLow: 'LOW',
  eqMid: 'MID',
  eqHigh: 'HI',
  trim: 'TRIM',
  filter: 'CFX (filter)',
}

/** A knob position as the hour its pointer shows, 7 o'clock to 5 o'clock, 12 in the middle. */
export function clock(key: ControlKey, value: number, t: Translate = english): string {
  const { min, max } = controlSpec(key)
  const hour = Math.round(7 + (10 * (value - min)) / (max - min))
  const h = hour > 12 ? hour - 12 : hour
  return t(hour === 7 ? 'sheet.clockMin' : hour === 17 ? 'sheet.clockMax' : 'sheet.clock', { h })
}

function faderWords(value: number, t: Translate): string {
  if (value <= 0.01) return t('sheet.faderDown')
  if (value >= 0.99) return t('sheet.faderUp')
  return t('sheet.faderTo', { pct: Math.round(value * 100) })
}

/** The reasons of the long blend's events, by event id. */
const WHY_IDS = new Set([
  'b-in',
  'b-mid',
  'b-high',
  'a-hp',
  'a-low',
  'b-low',
  'a-mid',
  'a-high',
  'a-out',
])

function describe(e: ControlEvent, deck: PhysicalDeck, t: Translate): string {
  const [, control] = e.control.split('.') as [string, string]
  const words = faderWords(e.to, t)
  if (control === 'fader') return t('sheet.channelFader', { deck, words })
  if (e.control === 'mixer.crossfader') return t('sheet.crossfader', { words })
  const name = KNOB_NAMES[control] ?? control
  return t(e.kind === 'ramp' ? 'sheet.knobRamp' : 'sheet.knobStep', {
    name,
    deck,
    clock: clock(e.control, e.to, t),
  })
}

/** The version a transition is played with: the agreed one, else the latest saved. */
export function versionFor(
  work: TransitionWork | undefined,
  t: Translate = english,
): {
  version: TransitionVersion | null
  note: string
} {
  if (!work || work.versions.length === 0) return { version: null, note: t('sheet.note.none') }
  const both = agreed(work)
  const byId = (id: string) => work.versions.find((v) => v.id === id) ?? null
  if (both && both !== 'both') return { version: byId(both), note: t('sheet.note.agreed') }
  const latest = work.versions.at(-1)!
  if (both === 'both') return { version: latest, note: t('sheet.note.both') }
  return { version: latest, note: t('sheet.note.latest') }
}

function steps(
  plan: TransitionPlanV1,
  timing: TransitionTiming,
  out: PhysicalDeck,
  into: PhysicalDeck,
  t: Translate,
): SheetStep[] {
  const barA = (beat: number) =>
    formatBarBeat(toBarBeat(timing.gridA, transitionBeatToDeckBeat(timing, 'A', beat)))
  const physical = (deck: DeckId) => (deck === 'A' ? out : into)
  const list: SheetStep[] = plan.events.map((e) => {
    const deck = e.control === 'mixer.crossfader' ? out : physical(e.control[0] as DeckId)
    const at =
      e.kind === 'ramp' && e.untilBeat !== undefined
        ? `${barA(e.atBeat)}–${barA(e.untilBeat)}`
        : barA(e.atBeat)
    return {
      at,
      beat: e.atBeat,
      deck,
      action: describe(e, deck, t),
      why:
        e.source === 'user' ? t('sheet.takeWhy') : WHY_IDS.has(e.id) ? t(`sheet.why.${e.id}`) : '',
    }
  })
  const loop = loopSchedule(timing)
  if (loop) {
    const deck = physical(loop.deck)
    const grid = loop.deck === 'A' ? timing.gridA : timing.gridB
    const startBar = formatBarBeat(toBarBeat(grid, loop.startBeat))
    list.push({
      at: barA(loop.from),
      beat: loop.from,
      deck,
      action: t('sheet.loop', {
        deck,
        start: startBar,
        bars: loop.lengthBeats / 4,
        at: barA(loop.to),
        passes: loop.passes,
      }),
      why: t(loop.side === 'before' ? 'sheet.loopWhy.before' : 'sheet.loopWhy.after'),
    })
  }
  return list.sort((a, b) => a.beat - b.beat)
}

/** Where to cue the incoming track, and the bar of the outgoing one to press PLAY on. */
function cueOf(plan: TransitionPlanV1, timing: TransitionTiming): SheetTransition['cue'] {
  const bIn = plan.events.find((e) => e.control === 'B.fader')
  const playBeat = Math.max(plan.span.startBeat, (bIn?.atBeat ?? 0) - 4)
  const bBeat = Math.max(0, transitionBeatToDeckBeat(timing, 'B', playBeat))
  const barA = toBarBeat(timing.gridA, transitionBeatToDeckBeat(timing, 'A', playBeat))
  return {
    inAt: formatBarBeat(toBarBeat(timing.gridB, bBeat)),
    playAt: formatBarBeat(barA),
    playBeat,
  }
}

export function setSheet(
  plan: SetPlan,
  tracks: readonly TrackProfile[],
  t: Translate = english,
): SetSheet {
  const owner = new Map(tracks.map((x) => [x.id, x.owner]))
  const slots = plan.order.map((trackId, k) => ({
    trackId,
    deck: deckOf(k),
    player: owner.get(trackId) ?? 'dj1',
  }))
  const list = transitions(plan, tracks).map((tr, k): SheetTransition => {
    const { version, note } = versionFor(plan.work[pairKey(tr.from, tr.to)], t)
    const out = deckOf(k)
    const into = deckOf(k + 1)
    const base = {
      index: k,
      from: tr.from,
      to: tr.to,
      outDeck: out,
      inDeck: into,
      mixedBy: tr.mixedBy,
    }
    if (!version) return { ...base, version, note, cue: null, steps: [] }
    const timing = planTiming(version.plan)
    return {
      ...base,
      version,
      note,
      cue: cueOf(version.plan, timing),
      steps: steps(version.plan, timing, out, into, t),
    }
  })
  return { slots, transitions: list }
}
