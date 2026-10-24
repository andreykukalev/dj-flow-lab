/**
 * Core data model for DJ Flow Lab. Pure types, no runtime dependencies.
 *
 * Conventions:
 * - Bars and beats are 0-based in the engine (bar 0 starts at the first downbeat).
 *   The UI shows bars 1-based, like DJ software.
 * - A transition's own timeline is measured in beats from the exit point:
 *   beat 0 is the first beat of the outgoing track's exit bar.
 * - Every value shown to the user carries the knowledge layer it belongs to
 *   (see product brief §10).
 */

/** The knowledge layers from product brief §10. */
export type Layer = 'measured' | 'hypothesis' | 'interpretation' | 'preference' | 'instruction'

/** Who produced a value. User corrections always win over analysis. */
export type Source = 'analysis' | 'user' | 'strategy' | 'model'

export interface Labeled<T> {
  value: T
  layer: Layer
  source: Source
  /** 0..1, present when the value is an estimate. */
  confidence?: number
}

export type DeckId = 'A' | 'B'

export interface BeatGrid {
  bpm: Labeled<number>
  /** Position of the first downbeat ("the 1") in the track's audio, in seconds. */
  firstDownbeatSec: Labeled<number>
  beatsPerBar: 4
}

export type SectionKind = 'intro' | 'groove' | 'breakdown' | 'build' | 'drop' | 'outro' | 'unknown'

export interface Section {
  startBar: number
  /** Exclusive. */
  endBar: number
  kind: Labeled<SectionKind>
}

export interface Track {
  id: string
  /** Stable fingerprint of the file contents, used to remember analysis. */
  fingerprint: string
  name: string
  durationSec: number
  grid: BeatGrid
  sections: Section[]
  /** Musical key, e.g. "8A" or "A minor". Entered by the user in the MVP. */
  key?: Labeled<string>
}

/** Controls of the generic two-channel mixer (product brief §9a). */
export type Control = 'trim' | 'eqHigh' | 'eqMid' | 'eqLow' | 'filter' | 'fader' | 'crossfader'

export type LaneTarget = DeckId | 'master'

export type Curve = 'step' | 'linear' | 'exp'

export interface AutomationPoint {
  /** Transition beat (0 = first beat of the exit bar). */
  beat: number
  value: number
  /** How the value moves from the previous point to this one. */
  curve: Curve
}

export interface Lane {
  target: LaneTarget
  control: Control
  /** Sorted by beat. */
  points: AutomationPoint[]
}

/** The musical reason behind a key action, shown in time with playback. */
export interface Annotation {
  atBeat: number
  untilBeat?: number
  controls: { target: LaneTarget; control: Control }[]
  title: string
  why: string
  layer: Layer
}

export interface TransitionPoints {
  /** Bar in the outgoing track where the transition starts. */
  exitBarA: number
  /** Bar in the incoming track that lines up with exitBarA. */
  entryBarB: number
}

export interface TransitionPlan extends TransitionPoints {
  id: string
  strategyId: string
  params: Record<string, number | string | boolean>
  /** Bars during which both tracks are audible. */
  overlapBars: number
  /** Transition bar at which the musical lead moves from A to B. */
  handoffBar: number
  tempo: {
    /** The deck whose tempo is kept. Always A in the MVP. */
    masterDeck: 'A'
    /** Playback rate applied to deck B so its beats match deck A. */
    rateB: number
  }
  lanes: Lane[]
  annotations: Annotation[]
  intention?: Labeled<string>
}

/** One of several plans kept side by side for the same pair of tracks. */
export interface Variant {
  id: string
  name: string
  plan: TransitionPlan
  note?: string
}
