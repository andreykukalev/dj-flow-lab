import type { DeckId, TransitionPoints } from '../model'
import type { BlendArea } from './area'
import type { PlanDeck, TransitionPlanV1 } from './types'

// The long-blend plan used by the proof of concept (TECHNICAL_SPIKES.md), generated
// for a transition area around the blend start (#75). It is data, not a strategy: the
// area is where both decks play, and every move is placed inside it.
//
//   pre-roll        A alone before the area (replay starts here)
//   first half      B fades in over its first half with its bass cut; B's mids and
//                   highs come up; a high-pass opens on A over its second half
//   handoff         bass swap: A's low out, B's low in. On the blend start when the
//                   area reaches both sides of it, otherwise in the middle of the area
//   second half     A's mids and highs go down over its first half; A fades out
//                   over its second half
//   tail            B alone after the area
//
// The default area is the original hand-written plan: B in at beat 0, the bass swap at
// 64, A gone at 128, with 8 bars of pre-roll and tail.

export const LEGACY_AREA: BlendArea = {
  beforeBeats: 0,
  afterBeats: 128,
  preRollBeats: 32,
  tailBeats: 32,
}

/** Halfway between two beats, on the 1/4-beat event grid. */
function mid(a: number, b: number): number {
  return Math.round(((a + b) / 2) * 4) / 4
}

/** The handoff beat for an area: the blend start when the area has a bar or more on both sides of it. */
export function handoffBeat(area: BlendArea): number {
  const s = 0 - area.beforeBeats // not -0
  const e = area.afterBeats
  if (area.beforeBeats >= 4 && area.afterBeats >= 4) return 0
  const bar = Math.round((s + e) / 8) * 4
  return bar > s && bar < e ? bar : mid(s, e)
}

export function longBlendPlan(
  decks: Record<DeckId, PlanDeck>,
  points: TransitionPoints,
  area: BlendArea = LEGACY_AREA,
): TransitionPlanV1 {
  const s = 0 - area.beforeBeats // not -0, which plans and tests would carry
  const e = area.afterBeats
  const h = handoffBeat(area)
  const bIn = mid(s, h)
  const aOut = mid(h, e)
  const bars = (beats: number) => Math.round((beats / 4) * 100) / 100
  return {
    schemaVersion: 1,
    id: 'poc-long-blend',
    strategy: {
      id: 'long-blend',
      version: 1,
      params: {
        overlapBars: bars(e - s),
        handoffBar: bars(h - s) + 1,
        beforeBars: bars(area.beforeBeats),
        afterBars: bars(area.afterBeats),
      },
    },
    decks,
    points,
    tempo: { master: 'A' },
    span: { startBeat: s - area.preRollBeats, endBeat: e + area.tailBeats },
    initial: {
      'A.fader': 1,
      'B.fader': 0,
      'B.eqLow': 0,
      'B.eqMid': 0.25,
      'B.eqHigh': 0.25,
    },
    events: [
      {
        id: 'b-in',
        control: 'B.fader',
        kind: 'ramp',
        atBeat: s,
        untilBeat: bIn,
        to: 1,
        annotationId: 'bring-in',
      },
      {
        id: 'b-mid',
        control: 'B.eqMid',
        kind: 'ramp',
        atBeat: s,
        untilBeat: h,
        to: 0.5,
        annotationId: 'bring-in',
      },
      {
        id: 'b-high',
        control: 'B.eqHigh',
        kind: 'ramp',
        atBeat: s,
        untilBeat: h,
        to: 0.5,
        annotationId: 'bring-in',
      },
      {
        id: 'a-hp',
        control: 'A.filter',
        kind: 'ramp',
        atBeat: bIn,
        untilBeat: h,
        to: 0.35,
        curve: 'smooth',
        annotationId: 'thin-out',
      },
      {
        id: 'a-low',
        control: 'A.eqLow',
        kind: 'set',
        atBeat: h,
        to: 0,
        annotationId: 'bass-swap',
      },
      {
        id: 'b-low',
        control: 'B.eqLow',
        kind: 'set',
        atBeat: h,
        to: 0.5,
        annotationId: 'bass-swap',
      },
      {
        id: 'a-mid',
        control: 'A.eqMid',
        kind: 'ramp',
        atBeat: h,
        untilBeat: aOut,
        to: 0.25,
        annotationId: 'hand-over',
      },
      {
        id: 'a-high',
        control: 'A.eqHigh',
        kind: 'ramp',
        atBeat: h,
        untilBeat: aOut,
        to: 0.25,
        annotationId: 'hand-over',
      },
      {
        id: 'a-out',
        control: 'A.fader',
        kind: 'ramp',
        atBeat: aOut,
        untilBeat: e,
        to: 0,
        annotationId: 'fade-out',
      },
    ],
    annotations: [
      {
        id: 'bring-in',
        atBeat: s,
        untilBeat: h,
        layer: 'instruction',
        titleKey: 'longBlend.bringIn.title',
        bodyKey: 'longBlend.bringIn.body',
        vars: { bars: bars(bIn - s) },
      },
      {
        id: 'thin-out',
        atBeat: bIn,
        untilBeat: h,
        layer: 'instruction',
        titleKey: 'longBlend.thinOut.title',
        bodyKey: 'longBlend.thinOut.body',
        vars: { bars: bars(h - bIn) },
      },
      {
        id: 'bass-swap',
        atBeat: h,
        layer: 'instruction',
        titleKey: 'longBlend.bassSwap.title',
        bodyKey: 'longBlend.bassSwap.body',
        vars: { bar: bars(h - s) + 1 },
      },
      {
        id: 'hand-over',
        atBeat: h,
        untilBeat: aOut,
        layer: 'instruction',
        titleKey: 'longBlend.handOver.title',
        bodyKey: 'longBlend.handOver.body',
        vars: { bars: bars(aOut - h) },
      },
      {
        id: 'fade-out',
        atBeat: aOut,
        untilBeat: e,
        layer: 'instruction',
        titleKey: 'longBlend.fadeOut.title',
        bodyKey: 'longBlend.fadeOut.body',
        vars: { bars: bars(e - aOut) },
      },
    ],
  }
}
