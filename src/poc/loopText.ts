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

const times = (n: number, t: Translate) =>
  n === 1 ? t('auto.once') : n === 2 ? t('auto.twice') : t('auto.times', { n })

/** A position on track A, as `A 25.1`. */
function onA(timing: TransitionTiming, beat: number): string {
  return `A ${formatBarBeat(toBarBeat(timing.gridA, transitionBeatToDeckBeat(timing, 'A', beat)))}`
}

/** The loop of a timing, in words: what repeats, where, and what it changes. */
export function describeLoop(timing: TransitionTiming, t: Translate = english): string | null {
  const loop = loopSchedule(timing)
  if (!loop) return null
  const grid = loop.deck === 'A' ? timing.gridA : timing.gridB
  const from = loop.startBeat / grid.beatsPerBar + 1
  const to = from + loop.lengthBeats / grid.beatsPerBar - 1
  const extraBars = (loop.repeats * loop.lengthBeats) / grid.beatsPerBar
  const what = t('loop.what', {
    deck: loop.deck,
    from,
    to,
    times: times(loop.passes, t),
    start: onA(timing, loop.from),
    end: onA(timing, loop.to),
  })
  const entry = (deck: DeckId) =>
    formatBarBeat(
      toBarBeat(
        deck === 'A' ? timing.gridA : timing.gridB,
        transitionBeatToDeckBeat(timing, deck, 0),
      ),
    )
  if (loop.side === 'after') {
    return t(loop.deck === 'A' ? 'loop.afterA' : 'loop.afterB', {
      what,
      bar: to + 1,
      extra: extraBars,
    })
  }
  return loop.deck === 'B'
    ? t('loop.beforeB', { what, extra: extraBars, entry: entry('B') })
    : t('loop.beforeA', { what, entry: entry('A') })
}

/** How to play the loop on a DJ controller with rekordbox (DDJ-400 and alike). */
export function practiceLoop(timing: TransitionTiming, t: Translate = english): string | null {
  const loop = loopSchedule(timing)
  if (!loop) return null
  const grid = loop.deck === 'A' ? timing.gridA : timing.gridB
  const from = loop.startBeat / grid.beatsPerBar + 1
  const bars = loop.lengthBeats / grid.beatsPerBar
  const set = t('loop.set', { beats: loop.lengthBeats, bars, deck: loop.deck, from })
  const exit = t('loop.exit', { pass: loop.passes, at: onA(timing, loop.to) })
  if (loop.deck === 'B') {
    // Bar 1 of B plays where its first run reaches deck beat 0, before any pass.
    const startB = -deckRuns(timing, 'B')[0]!.offset
    return t('loop.practiceB', { at: onA(timing, startB), set, exit })
  }
  return t('loop.practiceA', { set, at: onA(timing, loop.from), exit })
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
