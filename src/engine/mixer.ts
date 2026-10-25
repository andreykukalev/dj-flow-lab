import type { DeckId } from './model'

// Controls of the generic two-channel mixer (D-14). Plans and the UI use normalized
// control positions; the mapping functions here are the only conversion to audio
// units, shared by the scheduler and the UI.

export const DECK_CONTROLS = ['trim', 'eqLow', 'eqMid', 'eqHigh', 'filter', 'fader'] as const

export type DeckControl = (typeof DECK_CONTROLS)[number]

export type ControlKey = `${DeckId}.${DeckControl}` | 'mixer.crossfader'

export const CONTROL_KEYS: readonly ControlKey[] = [
  ...DECK_CONTROLS.map((c) => `A.${c}` as const),
  ...DECK_CONTROLS.map((c) => `B.${c}` as const),
  'mixer.crossfader',
]

export function isControlKey(value: string): value is ControlKey {
  return (CONTROL_KEYS as readonly string[]).includes(value)
}

export interface ControlSpec {
  min: number
  max: number
  default: number
}

const DECK_SPECS: Record<DeckControl, ControlSpec> = {
  trim: { min: -1, max: 1, default: 0 },
  eqLow: { min: 0, max: 1, default: 0.5 },
  eqMid: { min: 0, max: 1, default: 0.5 },
  eqHigh: { min: 0, max: 1, default: 0.5 },
  filter: { min: -1, max: 1, default: 0 },
  fader: { min: 0, max: 1, default: 1 },
}

export function controlSpec(key: ControlKey): ControlSpec {
  if (key === 'mixer.crossfader') return { min: 0, max: 1, default: 0.5 }
  if (key === 'B.fader') return { ...DECK_SPECS.fader, default: 0 }
  return DECK_SPECS[key.slice(2) as DeckControl]
}

/** A position for every control. */
export type ControlState = Record<ControlKey, number>

export function defaultState(): ControlState {
  return Object.fromEntries(CONTROL_KEYS.map((k) => [k, controlSpec(k).default])) as ControlState
}

// ---------------------------------------------------------------------------
// Mappings to audio units

export function dbToGain(db: number): number {
  return 10 ** (db / 20)
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(gain)
}

/** Fixed master gain, headroom for two loud tracks at full level (D-11, set in S3). */
export const MASTER_GAIN_DB = -9

/** Trim −1…+1 → −12…+12 dB. */
export function trimGain(p: number): number {
  return dbToGain(12 * p)
}

/** EQ band 0…1: up to 0.5 the gain is (2p)² (0 = kill); above, up to +6 dB, linear in dB. */
export function eqGain(p: number): number {
  return p <= 0.5 ? (2 * p) ** 2 : dbToGain(((p - 0.5) / 0.5) * 6)
}

/** Fader 0…1 → gain p² (provisional taper). */
export function faderGain(p: number): number {
  return p * p
}

/** Dipless crossfader: both decks at unity in the centre. 0 = A only, 1 = B only. */
export function crossfaderGains(x: number): Record<DeckId, number> {
  return { A: Math.min(1, 2 * (1 - x)), B: Math.min(1, 2 * x) }
}

export const FILTER_DEAD_ZONE = 0.02
/** Filter resonance as a linear Q (D-13, provisional). */
export const FILTER_Q = 0.9
export const FILTER_LP_MIN_HZ = 100
/**
 * Highest low-pass cutoff, used at rest, as a fraction of Nyquist. Firefox switches to
 * a pass-through at exactly Nyquist, and sweeping away from or back to it clicked
 * (S3); at 0.95 the response is within 0.2 dB up to 18 kHz.
 */
export const FILTER_LP_MAX_NYQUIST = 0.95
/** Lowest high-pass cutoff, used at rest (S3: 10 Hz lifted 20 Hz by 0.6 dB at this Q). */
export const FILTER_HP_MIN_HZ = 5
export const FILTER_HP_MAX_HZ = 8000

/**
 * Bipolar filter (D-13). Both biquads stay in the chain; in the centre the low-pass
 * sits at 0.95 × Nyquist and the high-pass at 5 Hz, which together keep the response
 * within 0.25 dB from 20 Hz to 18 kHz. Negative positions lower the low-pass cutoff
 * towards 100 Hz, positive positions raise the high-pass cutoff towards 8 kHz, both
 * log-mapped.
 *
 * Neither rests at its exact pass-through (0 Hz, Nyquist): engines switch coefficient
 * forms there, and a sweep leaving or reaching it clicked (Chromium at 0 Hz, Firefox
 * at Nyquist).
 */
export function filterCutoffs(
  x: number,
  sampleRate: number,
): { lowpassHz: number; highpassHz: number } {
  const maxHz = (FILTER_LP_MAX_NYQUIST * sampleRate) / 2
  const u = Math.max(0, (Math.abs(x) - FILTER_DEAD_ZONE) / (1 - FILTER_DEAD_ZONE))
  if (x < 0) {
    return {
      lowpassHz: maxHz * (FILTER_LP_MIN_HZ / maxHz) ** u,
      highpassHz: FILTER_HP_MIN_HZ,
    }
  }
  return {
    lowpassHz: maxHz,
    highpassHz: FILTER_HP_MIN_HZ * (FILTER_HP_MAX_HZ / FILTER_HP_MIN_HZ) ** u,
  }
}
