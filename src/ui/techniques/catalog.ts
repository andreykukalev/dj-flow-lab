import type { ControlKey } from '../../engine/mixer'
import type { DeckId, TransitionPoints } from '../../engine/model'
import type { AreaRequest, BlendArea } from '../../engine/plan/area'
import type { LoopRequest } from '../../engine/plan/loop'
import type { Annotation, ControlEvent, PlanDeck, TransitionPlanV1 } from '../../engine/plan/types'
import type { PairId } from './tracks'

// The mixing techniques, from the basics to the advanced, with faders, EQ and loops only:
// the base a DJ masters before effects, which come on top of it later. Each technique is
// a plan on a pair of lesson tracks, at a moment chosen so its reason can be heard, and
// most have a version without the technique on the same moment, to hear what it solves.
// Plans are data like every other plan in the app, so the mixing line, the mixer and
// the audio all follow them, and any control can be taken over while it plays. The
// words (what the floor hears, why it works, when to use it, which of your own tracks to
// practise on, each step) live in the dictionaries under `tech.<id>.…`.

export type Level = 'basics' | 'intermediate' | 'loops' | 'advanced'

export const LEVELS: readonly Level[] = ['basics', 'intermediate', 'loops', 'advanced']

export type Tool = 'faders' | 'eq' | 'loop'

/** With the technique, or the same moment without it, to hear what it changes. */
export type Mode = 'with' | 'without'

/** Where a technique plays: the pair of tracks, the blend start, the area and the loop. */
export interface Setting {
  pair: PairId
  points: TransitionPoints
  area: AreaRequest
  loop: LoopRequest | null
}

export interface Technique {
  id: string
  level: Level
  setting: Setting
  /** The setting of the version without the technique, when it differs. */
  without?: Partial<Setting>
  /** Whether there is a version without the technique to compare with. */
  compare: boolean
  /** The plan's events for the area that fits; `without` leaves the technique out. */
  events: (area: Span, mode: Mode) => ControlEvent[]
  /** Initial positions that differ from the controls' defaults. */
  initial: (mode: Mode) => Partial<Record<ControlKey, number>>
  /** The steps, in the order they happen; only the version with the technique has them. */
  steps: (area: Span) => { id: string; at: number; until?: number }[]
}

/** The fitted area in transition beats: `s` where it starts (≤ 0), `e` where it ends. */
export interface Span {
  s: number
  e: number
}

const area = (beforeBars: number, afterBars: number): AreaRequest => ({
  beforeBars,
  afterBars,
  linked: beforeBars === afterBars,
})

function ramp(
  id: string,
  control: ControlKey,
  atBeat: number,
  untilBeat: number,
  to: number,
  annotationId?: string,
  curve?: 'smooth',
): ControlEvent {
  return {
    id,
    control,
    kind: 'ramp',
    atBeat,
    untilBeat,
    to,
    ...(annotationId && { annotationId }),
    ...(curve && { curve }),
  }
}

function set(
  id: string,
  control: ControlKey,
  atBeat: number,
  to: number,
  annotationId?: string,
): ControlEvent {
  return { id, control, kind: 'set', atBeat, to, ...(annotationId && { annotationId }) }
}

/** One deck's bass out and the other's in, on one beat. */
const bassSwap = (at: number, from: DeckId, note?: string): ControlEvent[] => {
  const to = from === 'A' ? 'B' : 'A'
  return [
    set(`${from.toLowerCase()}-low-out`, `${from}.eqLow`, at, 0, note),
    set(`${to.toLowerCase()}-low-in`, `${to}.eqLow`, at, 0.5, note),
  ]
}

/** Halfway between two beats, on a whole bar from the first. */
const half = (a: number, b: number) => a + Math.max(4, Math.floor((b - a) / 8) * 4)

export const TECHNIQUES: readonly Technique[] = [
  // ---------------------------------------------------------------- Basics
  {
    id: 'phraseEntry',
    level: 'basics',
    setting: {
      pair: 'friendly',
      points: { exitBarA: 57, entryBarB: 9 },
      area: area(8, 8),
      loop: null,
    },
    // Two bars off the phrase: B's bar 1 under A's bar 51 instead of 49.
    without: { points: { exitBarA: 57, entryBarB: 7 } },
    compare: true,
    initial: () => ({}),
    events: ({ s, e }, mode) => [
      ramp('b-in', 'B.fader', s, 0, 1, mode === 'with' ? 'in' : undefined, 'smooth'),
      ramp('a-out', 'A.fader', 0, e, 0, mode === 'with' ? 'out' : undefined, 'smooth'),
    ],
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: 0 },
      { id: 'phrase', at: 0 },
      { id: 'out', at: 0, until: e },
    ],
  },
  {
    id: 'bassSwap',
    level: 'basics',
    setting: {
      pair: 'friendly',
      points: { exitBarA: 49, entryBarB: 17 },
      area: area(8, 8),
      loop: null,
    },
    compare: true,
    initial: (mode) => (mode === 'with' ? { 'B.eqLow': 0 } : {}),
    events: ({ s, e }, mode) => [
      ramp('b-in', 'B.fader', s, s + 8, 1, mode === 'with' ? 'in' : undefined),
      ...(mode === 'with' ? bassSwap(0, 'A', 'bass-swap') : []),
      ramp('a-out', 'A.fader', half(0, e), e, 0, mode === 'with' ? 'out' : undefined),
    ],
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: s + 8 },
      { id: 'bass-swap', at: 0 },
      { id: 'out', at: half(0, e), until: e },
    ],
  },
  {
    id: 'cut',
    level: 'basics',
    setting: {
      pair: 'melodic',
      points: { exitBarA: 33, entryBarB: 41 },
      area: area(0, 1),
      loop: null,
    },
    // The smooth version needs room to blend: four bars on each side.
    without: { area: area(4, 4) },
    compare: true,
    initial: () => ({}),
    events: ({ s, e }, mode) =>
      mode === 'with'
        ? [set('a-cut', 'A.fader', 0, 0, 'cut'), set('b-cut', 'B.fader', 0, 1, 'cut')]
        : [ramp('b-in', 'B.fader', s, 0, 1), ramp('a-out', 'A.fader', 0, e, 0)],
    steps: () => [
      { id: 'wait', at: -32, until: 0 },
      { id: 'cut', at: 0 },
    ],
  },

  // ---------------------------------------------------------------- Intermediate
  {
    id: 'longBlend',
    level: 'intermediate',
    setting: {
      pair: 'friendly',
      points: { exitBarA: 49, entryBarB: 17 },
      area: area(16, 16),
      loop: null,
    },
    compare: true,
    initial: (mode) => (mode === 'with' ? { 'B.eqLow': 0, 'B.eqMid': 0.25, 'B.eqHigh': 0.25 } : {}),
    events: ({ s, e }, mode) => {
      const bIn = half(s, 0)
      const aOut = half(0, e)
      if (mode === 'without')
        return [ramp('b-in', 'B.fader', s, bIn, 1), ramp('a-out', 'A.fader', aOut, e, 0)]
      return [
        ramp('b-in', 'B.fader', s, bIn, 1, 'in'),
        ramp('b-mid', 'B.eqMid', s, 0, 0.5, 'in'),
        ramp('b-high', 'B.eqHigh', s, 0, 0.5, 'in'),
        ...bassSwap(0, 'A', 'bass-swap'),
        ramp('a-mid', 'A.eqMid', 0, aOut, 0.25, 'handOver'),
        ramp('a-high', 'A.eqHigh', 0, aOut, 0.25, 'handOver'),
        ramp('a-out', 'A.fader', aOut, e, 0, 'out'),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: 0 },
      { id: 'bass-swap', at: 0 },
      { id: 'handOver', at: 0, until: half(0, e) },
      { id: 'out', at: half(0, e), until: e },
    ],
  },
  {
    id: 'staircase',
    level: 'intermediate',
    setting: {
      pair: 'friendly',
      points: { exitBarA: 49, entryBarB: 25 },
      area: area(16, 8),
      loop: null,
    },
    compare: true,
    initial: (mode) => (mode === 'with' ? { 'B.eqLow': 0, 'B.eqMid': 0 } : {}),
    events: ({ s, e }, mode) => {
      if (mode === 'without')
        return [ramp('b-in', 'B.fader', s, s + 4, 1), ramp('a-out', 'A.fader', 0, e, 0)]
      const mid = half(s, 0)
      return [
        ramp('b-in', 'B.fader', s, s + 4, 1, 'high'),
        ramp('a-high', 'A.eqHigh', s, mid, 0.2, 'high', 'smooth'),
        set('b-mid-in', 'B.eqMid', mid, 0.5, 'mid'),
        set('a-mid-out', 'A.eqMid', mid, 0.2, 'mid'),
        ...bassSwap(0, 'A', 'bass-swap'),
        ramp('a-out', 'A.fader', 0, e, 0, 'out'),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'high', at: s, until: half(s, 0) },
      { id: 'mid', at: half(s, 0) },
      { id: 'bass-swap', at: 0 },
      { id: 'out', at: 0, until: e },
    ],
  },
  {
    id: 'midSwap',
    level: 'intermediate',
    setting: {
      pair: 'melodic',
      points: { exitBarA: 41, entryBarB: 25 },
      area: area(8, 8),
      loop: null,
    },
    compare: true,
    initial: (mode) => (mode === 'with' ? { 'B.eqLow': 0, 'B.eqMid': 0 } : { 'B.eqLow': 0 }),
    events: ({ s, e }, mode) => {
      const swapBass = half(s, 0)
      const note = (id: string) => (mode === 'with' ? id : undefined)
      return [
        ramp('b-in', 'B.fader', s, s + 4, 1, note('in')),
        ...bassSwap(swapBass, 'A', note('bass-swap')),
        ...(mode === 'with'
          ? [set('a-mid-out', 'A.eqMid', 0, 0, 'mid'), set('b-mid-in', 'B.eqMid', 0, 0.5, 'mid')]
          : []),
        ramp('a-out', 'A.fader', 0, half(0, e), 0, note('out')),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: s + 4 },
      { id: 'bass-swap', at: half(s, 0) },
      { id: 'mid', at: 0 },
      { id: 'out', at: 0, until: half(0, e) },
    ],
  },

  // ---------------------------------------------------------------- Loops
  {
    id: 'loopIntro',
    level: 'loops',
    setting: {
      pair: 'awkward',
      points: { exitBarA: 33, entryBarB: 5 },
      area: area(8, 8),
      loop: { deck: 'B', side: 'before', bars: 4, passes: 2, gapBars: 0 },
    },
    without: { loop: null },
    compare: true,
    initial: () => ({ 'B.eqLow': 0 }),
    events: ({ s, e }, mode) => {
      const note = (id: string) => (mode === 'with' ? id : undefined)
      return [
        ramp('b-in', 'B.fader', s, s + 4, 1, note('loop')),
        ...bassSwap(0, 'A', note('bass-swap')),
        ramp('a-out', 'A.fader', half(0, e), e, 0, note('out')),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'loop', at: s, until: 0 },
      { id: 'bass-swap', at: 0 },
      { id: 'out', at: half(0, e), until: e },
    ],
  },
  {
    id: 'loopOutro',
    level: 'loops',
    setting: {
      pair: 'awkward',
      points: { exitBarA: 33, entryBarB: 13 },
      area: area(8, 12),
      loop: { deck: 'A', side: 'after', bars: 8, passes: 2, gapBars: 0 },
    },
    without: { loop: null },
    compare: true,
    initial: () => ({ 'B.eqLow': 0 }),
    events: ({ s, e }, mode) => {
      const note = (id: string) => (mode === 'with' ? id : undefined)
      return [
        ramp('b-in', 'B.fader', s, s + 4, 1, note('in')),
        ...bassSwap(0, 'A', note('bass-swap')),
        ramp('a-out', 'A.fader', Math.max(half(0, e), e - 16), e, 0, note('out')),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: s + 4 },
      { id: 'bass-swap', at: 0 },
      { id: 'loop', at: 0, until: e },
      { id: 'out', at: Math.max(half(0, e), e - 16), until: e },
    ],
  },

  // ---------------------------------------------------------------- Advanced
  {
    id: 'tension',
    level: 'advanced',
    setting: {
      pair: 'melodic',
      points: { exitBarA: 49, entryBarB: 41 },
      area: area(8, 0),
      loop: null,
    },
    compare: true,
    initial: () => ({ 'B.eqLow': 0 }),
    events: ({ s }, mode) => {
      const note = (id: string) => (mode === 'with' ? id : undefined)
      return [
        ramp('b-in', 'B.fader', s, s + 8, 1, note('in')),
        ramp('a-mid', 'A.eqMid', s, s + 8, 0.1, note('in')),
        set('a-low-out', 'A.eqLow', mode === 'with' ? -16 : 0, 0, note('cut')),
        set('b-low-in', 'B.eqLow', 0, 0.5, note('drop')),
        set('a-gone', 'A.fader', 0, 0, note('drop')),
      ]
    },
    steps: ({ s }) => [
      { id: 'in', at: s, until: s + 8 },
      { id: 'cut', at: -16, until: 0 },
      { id: 'drop', at: 0 },
    ],
  },
  {
    id: 'teaser',
    level: 'advanced',
    setting: {
      pair: 'friendly',
      points: { exitBarA: 49, entryBarB: 17 },
      area: area(8, 8),
      loop: null,
    },
    compare: true,
    initial: () => ({ 'B.eqLow': 0 }),
    events: ({ s, e }, mode) => {
      const note = (id: string) => (mode === 'with' ? id : undefined)
      // On the fourth beat of two bars, B's bass for one beat instead of A's.
      const teasers =
        mode === 'with'
          ? [-17, -9].flatMap((at, k) => [
              set(`tease-${k}-b`, 'B.eqLow', at, 0.5, 'tease'),
              set(`tease-${k}-a`, 'A.eqLow', at, 0, 'tease'),
              set(`back-${k}-b`, 'B.eqLow', at + 1, 0, 'tease'),
              set(`back-${k}-a`, 'A.eqLow', at + 1, 0.5, 'tease'),
            ])
          : []
      return [
        ramp('b-in', 'B.fader', s, s + 8, 1, note('in')),
        ...teasers,
        ...bassSwap(0, 'A', note('bass-swap')),
        ramp('a-out', 'A.fader', half(0, e), e, 0, note('out')),
      ]
    },
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: s + 8 },
      { id: 'tease', at: -17, until: -8 },
      { id: 'bass-swap', at: 0 },
      { id: 'out', at: half(0, e), until: e },
    ],
  },
  {
    id: 'loopBridge',
    level: 'advanced',
    setting: {
      pair: 'melodic',
      points: { exitBarA: 45, entryBarB: 33 },
      area: area(8, 8),
      loop: { deck: 'A', side: 'after', bars: 4, passes: 2, gapBars: 0 },
    },
    compare: false,
    initial: () => ({ 'B.eqLow': 0, 'B.eqMid': 0 }),
    events: ({ s, e }) => [
      ramp('b-in', 'B.fader', s, s + 4, 1, 'in'),
      set('a-mid-out', 'A.eqMid', 0, 0, 'bridge'),
      set('b-mid-in', 'B.eqMid', 0, 0.5, 'bridge'),
      set('a-low-out', 'A.eqLow', half(0, e), 0, 'cut'),
      set('b-low-in', 'B.eqLow', e, 0.5, 'drop'),
      set('a-gone', 'A.fader', e, 0, 'drop'),
    ],
    steps: ({ s, e }) => [
      { id: 'in', at: s, until: s + 4 },
      { id: 'bridge', at: 0, until: half(0, e) },
      { id: 'cut', at: half(0, e), until: e },
      { id: 'drop', at: e },
    ],
  },
]

export function techniqueById(id: string): Technique | undefined {
  return TECHNIQUES.find((x) => x.id === id)
}

/** The setting a technique plays in for a mode. */
export function settingOf(technique: Technique, mode: Mode): Setting {
  return mode === 'without' && technique.compare
    ? { ...technique.setting, ...technique.without }
    : technique.setting
}

/** The plan of a technique on two decks, for the area that fits them. */
export function techniquePlan(
  technique: Technique,
  mode: Mode,
  decks: Record<DeckId, PlanDeck>,
  points: TransitionPoints,
  fitted: BlendArea,
): TransitionPlanV1 {
  const span: Span = { s: 0 - fitted.beforeBeats, e: fitted.afterBeats }
  const events = technique.events(span, mode)
  const annotations: Annotation[] =
    mode === 'with'
      ? technique.steps(span).map((step) => ({
          id: step.id,
          atBeat: step.at,
          ...(step.until !== undefined && { untilBeat: step.until }),
          layer: 'instruction',
          titleKey: `tech.${technique.id}.${step.id}.title`,
          bodyKey: `tech.${technique.id}.${step.id}.body`,
          vars: {},
        }))
      : []
  return {
    schemaVersion: 1,
    id: `technique-${technique.id}-${mode}`,
    strategy: { id: `technique.${technique.id}`, version: 1, params: { mode } },
    decks,
    points,
    tempo: { master: 'A' },
    span: { startBeat: span.s - fitted.preRollBeats, endBeat: span.e + fitted.tailBeats },
    initial: { 'A.fader': 1, 'B.fader': 0, ...technique.initial(mode) },
    events,
    annotations,
  }
}

/** The tools a technique's plan uses, read from the plan itself. */
export function toolsOf(plan: TransitionPlanV1): Tool[] {
  const controls = new Set(plan.events.map((e) => e.control.split('.')[1]))
  const tools: Tool[] = ['faders']
  if ([...controls].some((c) => c?.startsWith('eq'))) tools.push('eq')
  if (plan.loop) tools.push('loop')
  return tools
}

/** The tools a technique uses, whichever version is playing. */
export function techniqueTools(technique: Technique): Tool[] {
  const events = technique.events({ s: -32, e: 32 }, 'with')
  const eq = events.some((e) => e.control.split('.')[1]?.startsWith('eq'))
  return [
    'faders',
    ...(eq ? (['eq'] as const) : []),
    ...(technique.setting.loop ? (['loop'] as const) : []),
  ]
}
