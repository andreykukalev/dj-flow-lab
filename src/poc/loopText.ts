import type { DeckId } from '../engine/model'
import { english, type Translate } from '../i18n'
import type { LoopRequest } from '../engine/plan/loop'
import {
  deckRuns,
  formatBarBeat,
  loopSchedule,
  toBarBeat,
  transitionBeatToDeckBeat,
  type TransitionTiming,
} from '../engine/time'

// What a loop does, in words (#81): which bars repeat and how often, where that falls on
// track A, what it changes about the pairing, and how to play it on a controller. Musical
// effect first, the button presses after it.

/** The two common uses, and the two other sides, for the loop picker. */
export const LOOP_KINDS: { id: string; deck: DeckId; side: 'before' | 'after'; label: string }[] = [
  { id: 'A-after', deck: 'A', side: 'after', label: 'Hold A after the blend start' },
  { id: 'B-before', deck: 'B', side: 'before', label: "Stretch B's run-in before it" },
  { id: 'A-before', deck: 'A', side: 'before', label: 'Loop A before the blend start' },
  { id: 'B-after', deck: 'B', side: 'after', label: 'Loop B after the blend start' },
]

const TIMES = ['', 'once', 'twice']
const times = (n: number) => TIMES[n] ?? `${n} times`

/** A position on track A, as `A 25.1`. */
function onA(timing: TransitionTiming, beat: number): string {
  return `A ${formatBarBeat(toBarBeat(timing.gridA, transitionBeatToDeckBeat(timing, 'A', beat)))}`
}

/** The loop of a timing, in words: what repeats, where, and what it changes. */
export function describeLoop(timing: TransitionTiming): string | null {
  const loop = loopSchedule(timing)
  if (!loop) return null
  const grid = loop.deck === 'A' ? timing.gridA : timing.gridB
  const from = loop.startBeat / grid.beatsPerBar + 1
  const to = from + loop.lengthBeats / grid.beatsPerBar - 1
  const extraBars = (loop.repeats * loop.lengthBeats) / grid.beatsPerBar
  const what = `${loop.deck} plays its bars ${from}–${to} ${times(loop.passes)}, from ${onA(timing, loop.from)} to ${onA(timing, loop.to)}`
  const entry = (deck: DeckId) =>
    formatBarBeat(
      toBarBeat(
        deck === 'A' ? timing.gridA : timing.gridB,
        transitionBeatToDeckBeat(timing, deck, 0),
      ),
    )
  if (loop.side === 'after') {
    return loop.deck === 'A'
      ? `${what}: A holds this groove while B plays on, and A's bar ${to + 1} comes ${extraBars} bars later.`
      : `${what}: B repeats this idea before moving on, and B's bar ${to + 1} comes ${extraBars} bars later.`
  }
  return loop.deck === 'B'
    ? `${what}: B starts ${extraBars} bars earlier and still has its bar ${entry('B')} on the blend start.`
    : `${what}: A stays on this groove before the blend start, and its bar ${entry('A')} still meets the blend start.`
}

/** How to play the loop on a DJ controller with rekordbox (DDJ-400 and alike). */
export function practiceLoop(timing: TransitionTiming): string | null {
  const loop = loopSchedule(timing)
  if (!loop) return null
  const grid = loop.deck === 'A' ? timing.gridA : timing.gridB
  const from = loop.startBeat / grid.beatsPerBar + 1
  const bars = loop.lengthBeats / grid.beatsPerBar
  const set = `with Quantize on, set a ${loop.lengthBeats}-beat (${bars}-bar) loop on deck ${loop.deck} at its bar ${from} (LOOP IN there, LOOP OUT ${bars} bars later, or a Beat Loop pad)`
  const exit = `press RELOOP/EXIT during pass ${loop.passes}, before ${onA(timing, loop.to)}`
  if (loop.deck === 'B') {
    // Bar 1 of B plays where its first run reaches deck beat 0, before any pass.
    const startB = -deckRuns(timing, 'B')[0]!.offset
    return `On the controller: start B from its bar 1 at ${onA(timing, startB)}, ${set}, and ${exit}.`
  }
  return `On the controller: ${set} as A reaches ${onA(timing, loop.from)}, and ${exit}, or let A fade out inside the loop.`
}

/** "B bars 1–4 × 3", for the folded loop section. */
export function loopName(
  request: LoopRequest,
  timing: TransitionTiming,
  t: Translate = english,
): string {
  const loop = loopSchedule(timing)
  if (!loop)
    return t('poc.loopNameRequest', {
      deck: request.deck,
      bars: request.bars,
      passes: request.passes,
    })
  const per = loop.deck === 'A' ? timing.gridA.beatsPerBar : timing.gridB.beatsPerBar
  const from = loop.startBeat / per + 1
  return t('poc.loopName', {
    deck: loop.deck,
    from,
    to: from + request.bars - 1,
    passes: loop.passes,
  })
}
