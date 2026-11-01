import type { DeckId } from '../../engine/model'
import type { Translate } from '../../i18n'
import {
  createSession,
  type DeckSource,
  type PlanBuilder,
  type PocSession,
} from '../../poc/session'
import {
  settingOf,
  techniqueById,
  techniquePlan,
  TECHNIQUES,
  type Mode,
  type Technique,
} from './catalog'
import { LESSON_PAIRS, renderLessonTrack, type PairId } from './tracks'

// The mixing techniques section: one Transition Builder session on the lesson tracks,
// the technique on it, with or without the technique, and which ones the DJ has
// practised. Only the pair in use is kept decoded; switching pairs renders the next one.

const DONE_KEY = 'dj-flow-lab.techniques.done'
const CURRENT_KEY = 'dj-flow-lab.techniques.current'

function load(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Kept for this visit only.
  }
}

function sources(pair: PairId, sampleRate: number): Record<DeckId, DeckSource> {
  const tracks = LESSON_PAIRS[pair]
  const source = (deck: DeckId): DeckSource => {
    const data = renderLessonTrack(tracks[deck], sampleRate)
    const buffer = new AudioBuffer({ length: data.length, sampleRate })
    buffer.copyToChannel(data, 0)
    return { name: tracks[deck].name, buffer, grid: tracks[deck].grid }
  }
  return { A: source('A'), B: source('B') }
}

const builderFor =
  (technique: Technique, mode: Mode): PlanBuilder =>
  (decks, points, area) =>
    techniquePlan(technique, mode, decks, points, area)

export class TechniqueSchool {
  readonly session: PocSession
  technique: Technique
  mode: Mode = 'with'
  pair: PairId
  done: ReadonlySet<string>
  version = 0
  private readonly listeners = new Set<() => void>()

  constructor(t: Translate) {
    this.technique = techniqueById(load(CURRENT_KEY) ?? '') ?? TECHNIQUES[0]!
    const setting = settingOf(this.technique, 'with')
    this.pair = setting.pair
    const pair = this.pair
    this.session = createSession({
      sources: (sampleRate) => sources(pair, sampleRate),
      builder: builderFor(this.technique, 'with'),
      points: setting.points,
      area: setting.area,
      loop: setting.loop,
    })
    this.session.setTranslate(t)
    this.done = new Set((load(DONE_KEY) ?? '').split(',').filter((id) => techniqueById(id)))
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Another technique, with the technique on, cued at its pre-roll. */
  select(id: string): void {
    const technique = techniqueById(id)
    if (!technique || technique === this.technique) return
    this.session.transport.stop()
    this.technique = technique
    this.mode = 'with'
    save(CURRENT_KEY, id)
    this.apply()
    this.session.transport.cue(this.session.compiled.span.startBeat)
  }

  /** With or without the technique; playing goes on at the same bar. */
  setMode(mode: Mode): void {
    if (mode === this.mode || (mode === 'without' && !this.technique.compare)) return
    this.mode = mode
    this.apply()
  }

  toggleDone(id: string): void {
    const done = new Set(this.done)
    if (done.has(id)) done.delete(id)
    else done.add(id)
    this.done = done
    save(DONE_KEY, [...done].join(','))
    this.notify()
  }

  setTranslate(t: Translate): void {
    this.session.setTranslate(t)
  }

  /** Stops playing, when the DJs leave the section. */
  pause(): void {
    const { transport } = this.session
    if (transport.state.kind === 'playing') transport.pause()
  }

  async close(): Promise<void> {
    await this.session.close()
  }

  private apply(): void {
    const setting = settingOf(this.technique, this.mode)
    const decks =
      setting.pair === this.pair ? undefined : sources(setting.pair, this.session.ctx.sampleRate)
    const ok = this.session.arrange({
      decks,
      builder: builderFor(this.technique, this.mode),
      points: setting.points,
      area: setting.area,
      loop: setting.loop,
    })
    if (ok) this.pair = setting.pair
    this.notify()
  }

  private notify(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}
