import {
  FILTER_HP_MIN_HZ,
  FILTER_Q,
  MASTER_GAIN_DB,
  crossfaderGains,
  dbToGain,
  eqGain,
  faderGain,
  filterCutoffs,
  trimGain,
  type ControlKey,
  type ControlState,
  type DeckControl,
} from '../engine/mixer'
import { DECK_IDS, type DeckId } from '../engine/model'

// The D-11 signal chain built from native Web Audio nodes (D-02):
//
//   source → trim → isolator EQ → low-pass → high-pass → fader → gate → crossfader ─┐
//                                                                                    ├→ master (−9 dB) → meter → out
//   (deck B, same chain) ───────────────────────────────────────────────────────────┘
//
// The gate is the transport's own fade for starts, stops and seeks (D-15); plans
// never touch it.

/** Isolator crossover frequencies (D-12): set in S3 so the low kill reaches 40 dB up to 100 Hz. */
export const CROSSOVER_LOW_HZ = 320
export const CROSSOVER_HIGH_HZ = 3200
const BUTTERWORTH_Q = Math.SQRT1_2

export interface MixerGraphOptions {
  /** Isolator crossovers, low and high, in Hz. Tests compare alternatives with this. */
  crossoverHz: readonly [number, number]
}

export interface DeckChain {
  /** Sources connect here. */
  input: GainNode
  trim: GainNode
  low: GainNode
  mid: GainNode
  high: GainNode
  lowpass: BiquadFilterNode
  highpass: BiquadFilterNode
  fader: GainNode
  gate: GainNode
  crossfader: GainNode
  /** End of the deck's chain, before the master. Tests can tap each deck here. */
  output: GainNode
}

/** An audio parameter driven by one control, with the mapping from control position. */
export interface ParamTarget {
  param: AudioParam
  map: (position: number) => number
}

export class MixerGraph {
  readonly decks: Record<DeckId, DeckChain>
  readonly master: GainNode
  readonly meter: AnalyserNode
  readonly ctx: BaseAudioContext
  readonly options: MixerGraphOptions
  private readonly targets: Record<ControlKey, ParamTarget[]>

  constructor(
    ctx: BaseAudioContext,
    destination: AudioNode = ctx.destination,
    options: Partial<MixerGraphOptions> = {},
  ) {
    this.ctx = ctx
    this.options = { crossoverHz: [CROSSOVER_LOW_HZ, CROSSOVER_HIGH_HZ], ...options }
    this.master = new GainNode(ctx, { gain: dbToGain(MASTER_GAIN_DB) })
    this.meter = new AnalyserNode(ctx, { fftSize: 2048 })
    this.master.connect(this.meter).connect(destination)
    this.decks = { A: this.buildDeck(), B: this.buildDeck() }

    const sampleRate = ctx.sampleRate
    const targets = {} as Record<ControlKey, ParamTarget[]>
    for (const deck of DECK_IDS) {
      const d = this.decks[deck]
      const deckTargets: Record<DeckControl, ParamTarget[]> = {
        trim: [{ param: d.trim.gain, map: trimGain }],
        eqLow: [{ param: d.low.gain, map: eqGain }],
        eqMid: [{ param: d.mid.gain, map: eqGain }],
        eqHigh: [{ param: d.high.gain, map: eqGain }],
        filter: [
          { param: d.lowpass.frequency, map: (x) => filterCutoffs(x, sampleRate).lowpassHz },
          { param: d.highpass.frequency, map: (x) => filterCutoffs(x, sampleRate).highpassHz },
        ],
        fader: [{ param: d.fader.gain, map: faderGain }],
      }
      for (const [control, list] of Object.entries(deckTargets)) {
        targets[`${deck}.${control as DeckControl}`] = list
      }
    }
    targets['mixer.crossfader'] = DECK_IDS.map((deck) => ({
      param: this.decks[deck].crossfader.gain,
      map: (x: number) => crossfaderGains(x)[deck],
    }))
    this.targets = targets
  }

  /** The audio parameters a control drives. */
  targetsOf(key: ControlKey): readonly ParamTarget[] {
    return this.targets[key]
  }

  /** Sets every parameter to a control state right now (outside playback). */
  applyState(state: ControlState): void {
    for (const [key, list] of Object.entries(this.targets)) {
      for (const t of list) t.param.value = t.map(state[key as ControlKey])
    }
  }

  private buildDeck(): DeckChain {
    const ctx = this.ctx
    const gain = (value = 1) => new GainNode(ctx, { gain: value })
    // Q is linear here. Web Audio takes the Q of low-pass and high-pass biquads in dB
    // (and of all-pass biquads as a plain ratio), so convert.
    const biquad = (type: BiquadFilterType, frequency: number, q = BUTTERWORTH_Q) =>
      new BiquadFilterNode(ctx, {
        type,
        frequency,
        Q: type === 'lowpass' || type === 'highpass' ? 20 * Math.log10(q) : q,
      })
    // A 4th-order Linkwitz–Riley slope is two cascaded Butterworth biquads.
    const lr4 = (type: 'lowpass' | 'highpass', frequency: number): [AudioNode, AudioNode] => {
      const first = biquad(type, frequency)
      const second = biquad(type, frequency)
      first.connect(second)
      return [first, second]
    }

    const input = gain()
    const trim = gain()
    input.connect(trim)

    // Isolator: low = LP320 · AP3200, mid = HP320 · LP3200, high = HP320 · HP3200.
    // The all-pass gives the low band the same phase as the 2.5 kHz crossover, so the
    // three bands sum to an all-pass (flat magnitude) at unity.
    const [lowHz, highHz] = this.options.crossoverHz
    const [lowIn, lowOut] = lr4('lowpass', lowHz)
    const lowAllpass = biquad('allpass', highHz)
    const [restIn, restOut] = lr4('highpass', lowHz)
    const [midIn, midOut] = lr4('lowpass', highHz)
    const [highIn, highOut] = lr4('highpass', highHz)
    const low = gain()
    const mid = gain()
    const high = gain()
    const sum = gain()
    trim.connect(lowIn)
    lowOut.connect(lowAllpass).connect(low).connect(sum)
    trim.connect(restIn)
    restOut.connect(midIn)
    restOut.connect(highIn)
    midOut.connect(mid).connect(sum)
    highOut.connect(high).connect(sum)

    const lowpass = biquad('lowpass', filterCutoffs(0, ctx.sampleRate).lowpassHz, FILTER_Q)
    const highpass = biquad('highpass', FILTER_HP_MIN_HZ, FILTER_Q)
    const fader = gain()
    const gateNode = gain(0)
    const crossfader = gain()
    sum.connect(lowpass).connect(highpass).connect(fader).connect(gateNode).connect(crossfader)
    crossfader.connect(this.master)

    return {
      input,
      trim,
      low,
      mid,
      high,
      lowpass,
      highpass,
      fader,
      gate: gateNode,
      crossfader,
      output: crossfader,
    }
  }
}
