import type { ControlKey } from '../mixer'
import type { BeatGrid, DeckId, Layer, TransitionPoints } from '../model'

// Transition plan schema v1 (D-16). A plan is data: strategies produce it, the
// compiler turns it into per-control segments, and the scheduler and UI read those.

export const PLAN_SCHEMA_VERSION = 1

export interface PlanDeck {
  trackFingerprint: string
  /** The grid the plan was made with. Plans are in beats, so this makes them reproducible. */
  grid: BeatGrid
}

export interface ControlEvent {
  id: string
  control: ControlKey
  /** `set` jumps at `atBeat` (with a 5 ms declick); `ramp` moves until `untilBeat`. */
  kind: 'set' | 'ramp'
  /** Start, in transition beats. */
  atBeat: number
  /** Ramp end, in transition beats. Required for ramps. */
  untilBeat?: number
  /** Target control position. A ramp starts from the value at `atBeat`. */
  to: number
  /** Ramps only. `smooth` is a cosine ease in control space. Default `linear`. */
  curve?: 'linear' | 'smooth'
  annotationId?: string
  /** Who wrote the event: a strategy (default) or the user, by taking over a control (#68). */
  source?: 'strategy' | 'user'
}

/** The musical reason behind an action, shown in time with playback. */
export interface Annotation {
  id: string
  atBeat: number
  untilBeat?: number
  layer: Layer
  titleKey: string
  bodyKey: string
  vars: Record<string, string | number>
}

export interface TransitionPlanV1 {
  schemaVersion: 1
  id: string
  strategy: { id: string; version: number; params: Record<string, number | string | boolean> }
  decks: Record<DeckId, PlanDeck>
  /** 1-based bars. */
  points: TransitionPoints
  /** Deck B's rate is derived from the grids, never stored. */
  tempo: { master: 'A' }
  /** Transition beats covered by the plan, e.g. a pre-roll before 0 to a tail after the overlap. */
  span: { startBeat: number; endBeat: number }
  /** State at `span.startBeat`. Controls left out start at their default. */
  initial: Partial<Record<ControlKey, number>>
  events: ControlEvent[]
  annotations: Annotation[]
}
