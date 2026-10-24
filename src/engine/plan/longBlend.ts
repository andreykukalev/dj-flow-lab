import type { DeckId, TransitionPoints } from '../model'
import type { PlanDeck, TransitionPlanV1 } from './types'

// The hand-written long-blend plan used by the proof of concept (TECHNICAL_SPIKES.md).
// It is data, not a strategy: a 32-bar overlap with a bass swap at the handoff.
//
//   beat −32…0   pre-roll, A alone (replay starts 8 bars before the exit)
//   beat 0…32    B fades in with its bass cut, mids and highs low
//   beat 0…64    B's mids and highs come up to neutral
//   beat 32…64   high-pass opens on A over the 8 bars before the handoff
//   beat 64      bass swap: A's low out, B's low in
//   beat 64…96   A's mids and highs go down
//   beat 96…128  A fades out
//   beat 128…160 tail, B alone

export const LONG_BLEND_HANDOFF_BEAT = 64

export function longBlendPlan(
  decks: Record<DeckId, PlanDeck>,
  points: TransitionPoints,
): TransitionPlanV1 {
  return {
    schemaVersion: 1,
    id: 'poc-long-blend',
    strategy: { id: 'long-blend', version: 1, params: { overlapBars: 32, handoffBar: 17 } },
    decks,
    points,
    tempo: { master: 'A' },
    span: { startBeat: -32, endBeat: 160 },
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
        atBeat: 0,
        untilBeat: 32,
        to: 1,
        annotationId: 'bring-in',
      },
      {
        id: 'b-mid',
        control: 'B.eqMid',
        kind: 'ramp',
        atBeat: 0,
        untilBeat: 64,
        to: 0.5,
        annotationId: 'bring-in',
      },
      {
        id: 'b-high',
        control: 'B.eqHigh',
        kind: 'ramp',
        atBeat: 0,
        untilBeat: 64,
        to: 0.5,
        annotationId: 'bring-in',
      },
      {
        id: 'a-hp',
        control: 'A.filter',
        kind: 'ramp',
        atBeat: 32,
        untilBeat: 64,
        to: 0.35,
        curve: 'smooth',
        annotationId: 'thin-out',
      },
      {
        id: 'a-low',
        control: 'A.eqLow',
        kind: 'set',
        atBeat: 64,
        to: 0,
        annotationId: 'bass-swap',
      },
      {
        id: 'b-low',
        control: 'B.eqLow',
        kind: 'set',
        atBeat: 64,
        to: 0.5,
        annotationId: 'bass-swap',
      },
      {
        id: 'a-mid',
        control: 'A.eqMid',
        kind: 'ramp',
        atBeat: 64,
        untilBeat: 96,
        to: 0.25,
        annotationId: 'hand-over',
      },
      {
        id: 'a-high',
        control: 'A.eqHigh',
        kind: 'ramp',
        atBeat: 64,
        untilBeat: 96,
        to: 0.25,
        annotationId: 'hand-over',
      },
      {
        id: 'a-out',
        control: 'A.fader',
        kind: 'ramp',
        atBeat: 96,
        untilBeat: 128,
        to: 0,
        annotationId: 'fade-out',
      },
    ],
    annotations: [
      {
        id: 'bring-in',
        atBeat: 0,
        untilBeat: 64,
        layer: 'instruction',
        titleKey: 'longBlend.bringIn.title',
        bodyKey: 'longBlend.bringIn.body',
        vars: { bars: 8 },
      },
      {
        id: 'thin-out',
        atBeat: 32,
        untilBeat: 64,
        layer: 'instruction',
        titleKey: 'longBlend.thinOut.title',
        bodyKey: 'longBlend.thinOut.body',
        vars: { bars: 8 },
      },
      {
        id: 'bass-swap',
        atBeat: 64,
        layer: 'instruction',
        titleKey: 'longBlend.bassSwap.title',
        bodyKey: 'longBlend.bassSwap.body',
        vars: { bar: 17 },
      },
      {
        id: 'hand-over',
        atBeat: 64,
        untilBeat: 96,
        layer: 'instruction',
        titleKey: 'longBlend.handOver.title',
        bodyKey: 'longBlend.handOver.body',
        vars: { bars: 8 },
      },
      {
        id: 'fade-out',
        atBeat: 96,
        untilBeat: 128,
        layer: 'instruction',
        titleKey: 'longBlend.fadeOut.title',
        bodyKey: 'longBlend.fadeOut.body',
        vars: { bars: 8 },
      },
    ],
  }
}
