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

const KNOB_NAMES: Record<string, string> = {
  eqLow: 'LOW',
  eqMid: 'MID',
  eqHigh: 'HI',
  trim: 'TRIM',
  filter: 'CFX (filter)',
}

/** A knob position as the hour its pointer shows, 7 o'clock to 5 o'clock, 12 in the middle. */
export function clock(key: ControlKey, value: number): string {
  const { min, max } = controlSpec(key)
  const hour = Math.round(7 + (10 * (value - min)) / (max - min))
  const h = hour > 12 ? hour - 12 : hour
  const word = hour === 7 ? ' (all the way down)' : hour === 17 ? ' (all the way up)' : ''
  return `${h} o’clock${word}`
}

function faderWords(value: number): string {
  if (value <= 0.01) return 'down'
  if (value >= 0.99) return 'up'
  return `to ${Math.round(value * 100)} %`
}

const WHY: Record<string, string> = {
  'b-in': 'The next track comes in under this one, its bass still cut.',
  'b-mid': 'Its mids come up as it settles in.',
  'b-high': 'Its highs come up as it settles in.',
  'a-hp': 'This track thins out to make room.',
  'a-low': 'Bass swap: one low end at a time.',
  'b-low': 'Bass swap: the new low end takes over.',
  'a-mid': 'This track steps back.',
  'a-high': 'This track steps back.',
  'a-out': 'This track leaves.',
}

function describe(e: ControlEvent, deck: PhysicalDeck): string {
  const [, control] = e.control.split('.') as [string, string]
  if (control === 'fader') return `Channel ${deck} fader ${faderWords(e.to)}`
  if (e.control === 'mixer.crossfader') return `Crossfader ${faderWords(e.to)}`
  const name = KNOB_NAMES[control] ?? control
  return `${name} on deck ${deck} ${e.kind === 'ramp' ? 'to' : 'at'} ${clock(e.control, e.to)}`
}

/** The version a transition is played with: the agreed one, else the latest saved. */
export function versionFor(work: TransitionWork | undefined): {
  version: TransitionVersion | null
  note: string
} {
  if (!work || work.versions.length === 0)
    return { version: null, note: 'No version saved yet: open it in the Lab and save one.' }
  const both = agreed(work)
  const byId = (id: string) => work.versions.find((v) => v.id === id) ?? null
  if (both && both !== 'both') return { version: byId(both), note: 'Agreed by both.' }
  const latest = work.versions.at(-1)!
  if (both === 'both')
    return { version: latest, note: 'Kept both to choose on the night; this is the latest.' }
  return { version: latest, note: 'Not agreed yet; this is the latest version.' }
}

function steps(
  plan: TransitionPlanV1,
  timing: TransitionTiming,
  out: PhysicalDeck,
  into: PhysicalDeck,
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
      action: describe(e, deck),
      why: e.source === 'user' ? 'Your take: a move you played in the Lab.' : (WHY[e.id] ?? ''),
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
      action: `LOOP IN on deck ${deck} at its ${startBar}, LOOP OUT ${loop.lengthBeats / 4} bars later; EXIT at ${barA(loop.to)} after ${loop.passes} passes`,
      why:
        loop.side === 'before'
          ? 'The loop gives the next track’s intro the bars it is short of.'
          : 'The loop holds this track’s bars while the next one comes in.',
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

export function setSheet(plan: SetPlan, tracks: readonly TrackProfile[]): SetSheet {
  const owner = new Map(tracks.map((t) => [t.id, t.owner]))
  const slots = plan.order.map((trackId, k) => ({
    trackId,
    deck: deckOf(k),
    player: owner.get(trackId) ?? 'dj1',
  }))
  const list = transitions(plan, tracks).map((t, k): SheetTransition => {
    const { version, note } = versionFor(plan.work[pairKey(t.from, t.to)])
    const out = deckOf(k)
    const into = deckOf(k + 1)
    const base = {
      index: k,
      from: t.from,
      to: t.to,
      outDeck: out,
      inDeck: into,
      mixedBy: t.mixedBy,
    }
    if (!version) return { ...base, version, note, cue: null, steps: [] }
    const timing = planTiming(version.plan)
    return {
      ...base,
      version,
      note,
      cue: cueOf(version.plan, timing),
      steps: steps(version.plan, timing, out, into),
    }
  })
  return { slots, transitions: list }
}
