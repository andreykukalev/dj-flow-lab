import { setBpm } from '../../engine/grid'
import { loadLang, saveLang, translatorFor, type Lang, type Translate } from '../../i18n'
import type { BeatGrid } from '../../engine/model'
import { observe, type Observation } from '../../engine/set/observations'
import {
  analyseAudio,
  structureOn,
  type Dj,
  type DjId,
  type TrackFeatures,
  type TrackProfile,
} from '../../engine/set/profile'
import { readings, type Reading } from '../../engine/set/readings'
import {
  addTrack,
  markTried,
  moveTrack,
  planFromReading,
  addAlternative,
  pairKey,
  removeAlternative,
  removeTrack,
  setArc,
  setWork,
  swapIn,
  type SetPlan,
} from '../../engine/set/spine'
import {
  addComment,
  addVersion,
  emptyWork,
  pick,
  removeVersion,
  type Pick,
  type TransitionWork,
} from '../../engine/set/versions'
import { barToBeat, beatToSec, secondsPerBar } from '../../engine/time'
import { createSession, decodeFile, deckPosition, type PocSession } from '../../poc/session'
import {
  decodeFrames,
  encodeFrames,
  matchTrack,
  SET_FORMAT,
  SET_VERSION,
  type SavedSet,
} from '../../engine/set/setFile'

/** SHA-256 of a file, in hex (D-22). */
async function fingerprintOf(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// The state of set planning (#87, slice 1): the two DJs and their tracks, the set
// being explored, and the screen. Every file stays on this device: it is decoded and
// analysed here, only its features are kept, and it is decoded again when someone
// listens. The Lab is the proof of concept's Transition Builder, with its own session.

export type Screen = 'music' | 'concepts' | 'set' | 'perform' | 'lab'

/** `missing`: known from a saved or passed set, its file not selected on this device yet. */
export type TrackStatus = 'waiting' | 'analysing' | 'ready' | 'failed' | 'missing'

export interface CollectionTrack {
  id: string
  owner: DjId
  /** The file on this device, or null until it is selected again. */
  file: File | null
  fileName: string
  /** SHA-256 of the file (D-22). */
  fingerprint?: string
  /** How a selected file was matched to a saved track. */
  matchedBy?: 'fingerprint' | 'name and length'
  status: TrackStatus
  error?: string
  features?: TrackFeatures
  profile?: TrackProfile
}

export interface LabOpen {
  from: string
  to: string
  index: number
}

/** Bars that "Hear it" plays. */
export const HEAR_BARS = 8
/** Decoded tracks kept for listening; the rest are decoded again. */
const KEEP_DECODED = 3

export class SetStore {
  djs: Record<DjId, Dj> = { dj1: { id: 'dj1', name: '' }, dj2: { id: 'dj2', name: '' } }
  tracks: CollectionTrack[] = []
  plan: SetPlan | null = null
  reading: Reading | null = null
  screen: Screen = 'music'
  lab: LabOpen | null = null
  labError: string | null = null
  /** What "Hear it" or "Hear the idea" is playing: the list, and the moment in it. */
  hearing: { key: string; trackId: string; bar: number; index: number; total: number } | null = null
  /** The saved set is read back (or there was none): tests and the UI wait for it. */
  ready = false
  /** A problem to show once, such as a file that must be selected again. */
  notice: string | null = null
  /** Which of the two DJs is at the screen: the author of versions, comments and picks. */
  me: DjId = 'dj1'
  /** The language of the screens and of everything the engine says; kept in this browser. */
  lang: Lang = loadLang()
  /** The transition the Lab opened last, so the Lab step can take the DJs back to it. */
  lastLab = 0
  /** Observations the DJs said do not sound like that. */
  dismissed: ReadonlySet<string> = new Set()
  version = 0

  private session: PocSession | null = null
  private nextId = 1
  private queue: Promise<void> = Promise.resolve()
  private readonly listeners = new Set<() => void>()
  private readonly decoded = new Map<string, AudioBuffer>()
  private hearSource: AudioBufferSourceNode | null = null
  private hearToken: object | null = null
  private stopTried: (() => void) | null = null
  private cache: { version: number; observations: Observation[]; readings: Reading[] } | null = null

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** The Transition Builder's session, made on first need: it owns the audio context. */
  get audio(): PocSession {
    this.session ??= createSession()
    return this.session
  }

  /** The words in the DJs' language. */
  get t(): Translate {
    return translatorFor(this.lang)
  }

  /** Changes the language of every screen; what the engine said is said again in it. */
  setLang(lang: Lang): void {
    if (lang === this.lang) return
    this.lang = lang
    saveLang(lang)
    this.notify()
  }

  /** "Andrei", or "DJ 1" before a name is typed. */
  djName(id: DjId): string {
    return this.djs[id].name.trim() || this.t(id === 'dj1' ? 'dj.1' : 'dj.2')
  }

  get names(): Record<DjId, string> {
    return { dj1: this.djName('dj1'), dj2: this.djName('dj2') }
  }

  /** The saved set has been read back, or there was none. */
  markReady(): void {
    this.ready = true
    this.notify()
  }

  setDjName(id: DjId, name: string): void {
    this.djs = { ...this.djs, [id]: { id, name } }
    this.notify()
  }

  get profiles(): TrackProfile[] {
    return this.tracks.flatMap((t) => (t.profile ? [t.profile] : []))
  }

  profile(id: string): TrackProfile | undefined {
    return this.tracks.find((t) => t.id === id)?.profile
  }

  get busy(): boolean {
    return this.tracks.some((t) => t.status === 'waiting' || t.status === 'analysing')
  }

  /** Observations and readings of the ready tracks, recomputed when anything changes. */
  get explored(): { observations: Observation[]; readings: Reading[] } {
    if (this.cache?.version !== this.version) {
      const profiles = this.profiles
      const observations = observe(profiles, this.names, this.t).filter(
        (o) => !this.dismissed.has(o.id),
      )
      this.cache = {
        version: this.version,
        observations,
        readings: readings(profiles, observations, this.t),
      }
    }
    return this.cache
  }

  /** "Doesn't sound like that": the observation is hidden, and readings resting on it go. */
  dismiss(observationId: string): void {
    this.dismissed = new Set([...this.dismissed, observationId])
    this.notify()
  }

  restoreDismissed(): void {
    this.dismissed = new Set()
    this.notify()
  }

  /** The DJs' own arc at one slot of the set. */
  setArc(index: number, value: number): void {
    if (!this.plan) return
    this.plan = setArc(this.plan, index, value)
    this.notify()
  }

  /** The set without its audio: what this browser keeps, and the file passed to the other DJ. */
  toSaved(): SavedSet {
    return {
      format: SET_FORMAT,
      version: SET_VERSION,
      savedAt: new Date().toISOString(),
      djs: { dj1: this.djs.dj1.name, dj2: this.djs.dj2.name },
      tracks: this.tracks.flatMap((t) => {
        if (!t.features || !t.profile || !t.fingerprint) return []
        const p = t.profile
        return [
          {
            id: t.id,
            owner: t.owner,
            fileName: t.fileName,
            fingerprint: t.fingerprint,
            durationSec: t.features.durationSec,
            grid: p.grid,
            tempo: p.tempo,
            ...(p.key ? { key: p.key } : {}),
            frames: encodeFrames(t.features.frames),
          },
        ]
      }),
      reading: this.reading,
      plan: this.plan,
      dismissed: [...this.dismissed],
    }
  }

  /** Puts a saved or passed set in place; its files are selected again to listen. */
  restore(saved: SavedSet): void {
    this.stopHearing()
    this.djs = {
      dj1: { id: 'dj1', name: saved.djs.dj1 ?? '' },
      dj2: { id: 'dj2', name: saved.djs.dj2 ?? '' },
    }
    this.tracks = saved.tracks.map((t) => {
      const features: TrackFeatures = {
        durationSec: t.durationSec,
        frames: decodeFrames(t.frames),
        grid: t.grid,
        tempo: t.tempo,
      }
      const track: CollectionTrack = {
        id: t.id,
        owner: t.owner,
        file: null,
        fileName: t.fileName,
        fingerprint: t.fingerprint,
        status: 'missing',
        features,
      }
      return { ...track, profile: this.profileOf(track, features, t.grid, t.tempo, t.key) }
    })
    const work = Object.values(saved.plan?.work ?? {})
    const ids = [
      ...saved.tracks.map((t) => t.id),
      ...work.flatMap((w) => [...w.versions.map((v) => v.id), ...w.comments.map((c) => c.id)]),
    ].map((id) => Number(id.replace(/\D/g, '')) || 0)
    this.nextId = Math.max(this.nextId, ...ids, 0) + 1
    this.reading = saved.reading
    this.plan = saved.plan
    this.dismissed = new Set(saved.dismissed)
    this.decoded.clear()
    this.lab = null
    this.screen = 'music'
    this.notify()
  }

  /** A new, empty set. */
  clear(): void {
    this.stopHearing()
    this.tracks = []
    this.plan = null
    this.reading = null
    this.dismissed = new Set()
    this.decoded.clear()
    this.lab = null
    this.screen = 'music'
    this.djs = { dj1: { id: 'dj1', name: '' }, dj2: { id: 'dj2', name: '' } }
    this.notify()
  }

  /** Adds local files for one DJ; they are analysed one after another. */
  addFiles(owner: DjId, files: readonly File[]): void {
    for (const file of files) {
      const track: CollectionTrack = {
        id: `t${this.nextId++}`,
        owner,
        file,
        fileName: file.name,
        status: 'waiting',
      }
      this.tracks = [...this.tracks, track]
      this.queue = this.queue.then(() => this.analyse(track.id))
    }
    this.notify()
  }

  /** Resolves when every file added so far is analysed. */
  settled(): Promise<void> {
    return this.queue
  }

  private async analyse(id: string): Promise<void> {
    const track = this.tracks.find((t) => t.id === id)
    const file = track?.file
    if (!track || !file) return
    this.update(id, { status: 'analysing' })
    // Let the list show the change before the analysis takes the main thread.
    await new Promise((r) => setTimeout(r, 0))
    try {
      const fingerprint = await fingerprintOf(file)
      // A file of a track the set already knows takes that track's place.
      if (this.attach(id, { name: file.name, fingerprint })) return
      const buffer = await decodeFile(this.audio.ctx, file)
      const durationSec = buffer.length / buffer.sampleRate
      if (this.attach(id, { name: file.name, fingerprint, durationSec })) return
      const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
        buffer.getChannelData(c),
      )
      const features = analyseAudio(channels, buffer.sampleRate)
      this.update(id, {
        status: 'ready',
        fingerprint,
        features,
        profile: this.profileOf(track, features),
      })
    } catch (e) {
      this.update(id, {
        status: 'failed',
        error: this.t('music.decodeError', {
          name: file.name,
          error: e instanceof Error ? e.message : String(e),
        }),
      })
    }
  }

  /**
   * Gives a selected file to the saved track it matches, by fingerprint or by name and
   * length, and drops the new entry it came in as. False when it matches none.
   */
  private attach(
    newId: string,
    file: { name: string; fingerprint: string; durationSec?: number },
  ): boolean {
    const missing = this.tracks.filter((t) => t.status === 'missing' && t.fingerprint)
    const match = matchTrack(
      missing.map((t) => ({
        id: t.id,
        fileName: t.fileName,
        fingerprint: t.fingerprint!,
        durationSec: t.features?.durationSec ?? 0,
      })),
      file,
    )
    if (!match) return false
    const incoming = this.tracks.find((t) => t.id === newId)!
    this.tracks = this.tracks
      .filter((t) => t.id !== newId)
      .map((t) =>
        t.id === match.id ? { ...t, file: incoming.file, status: 'ready', matchedBy: match.by } : t,
      )
    this.notify()
    return true
  }

  private profileOf(
    track: CollectionTrack,
    features: TrackFeatures,
    grid: BeatGrid = features.grid,
    tempo = features.tempo,
    key = track.profile?.key,
  ): TrackProfile {
    const on = structureOn(features.frames, grid, tempo)
    const profile: TrackProfile = {
      id: track.id,
      owner: track.owner,
      name: track.fileName.replace(/\.[^.]+$/, ''),
      durationSec: features.durationSec,
      grid: on.grid,
      tempo,
      structure: on.structure,
    }
    if (key) profile.key = key
    return profile
  }

  private update(id: string, change: Partial<CollectionTrack>): void {
    this.tracks = this.tracks.map((t) => (t.id === id ? { ...t, ...change } : t))
    this.notify()
  }

  /** The DJ's tempo: the bars are measured again on it, and it is theirs from now on. */
  setBpm(id: string, bpm: number): void {
    const track = this.tracks.find((t) => t.id === id)
    if (!track?.features || !track.profile || !(bpm > 0)) return
    this.setGrid(id, setBpm(track.profile.grid, bpm))
  }

  /** Keeps the estimate as it is, as the DJ's own. */
  confirmTempo(id: string): void {
    const track = this.tracks.find((t) => t.id === id)
    if (track?.profile) this.setGrid(id, { ...track.profile.grid, source: 'user' })
  }

  setGrid(id: string, grid: BeatGrid): void {
    const track = this.tracks.find((t) => t.id === id)
    if (!track?.features) return
    this.decoded.delete(id)
    this.update(id, { profile: this.profileOf(track, track.features, grid, 'yours') })
  }

  setKey(id: string, key: string): void {
    const track = this.tracks.find((t) => t.id === id)
    if (!track?.profile) return
    const profile = { ...track.profile }
    const k = key.trim()
    if (k) profile.key = k
    else delete profile.key
    this.update(id, { profile })
  }

  removeFromCollection(id: string): void {
    this.tracks = this.tracks.filter((t) => t.id !== id)
    this.decoded.delete(id)
    if (this.plan) {
      const index = this.plan.order.indexOf(id)
      if (index >= 0) this.plan = removeTrack(this.plan, index)
    }
    this.notify()
  }

  go(screen: Exclude<Screen, 'lab'>): void {
    this.stopHearing()
    if ((screen === 'set' || screen === 'perform') && !this.plan) return
    if (this.screen === 'lab') this.leaveLab()
    this.screen = screen
    this.notify()
  }

  /** "Explore the concept": the reading's order becomes the set. */
  choose(reading: Reading): void {
    this.reading = reading
    this.plan = planFromReading(reading)
    this.go('set')
  }

  move(index: number, delta: number): void {
    if (!this.plan) return
    this.plan = moveTrack(this.plan, index, delta)
    this.notify()
  }

  setMe(dj: DjId): void {
    this.me = dj
    this.notify()
  }

  addAlternative(index: number, id: string): void {
    if (!this.plan) return
    this.plan = addAlternative(this.plan, index, id)
    this.notify()
  }

  removeAlternative(index: number, id: string): void {
    if (!this.plan) return
    this.plan = removeAlternative(this.plan, index, id)
    this.notify()
  }

  swapIn(index: number, id: string): void {
    if (!this.plan) return
    this.plan = swapIn(this.plan, index, id)
    this.notify()
  }

  /** The versions, comments and picks of the transition open in the Lab. */
  get labWork(): TransitionWork {
    const key = this.lab && pairKey(this.lab.from, this.lab.to)
    return (key && this.plan?.work[key]) || emptyWork()
  }

  private changeWork(change: (work: TransitionWork) => TransitionWork): void {
    if (!this.plan || !this.lab) return
    const key = pairKey(this.lab.from, this.lab.to)
    this.plan = setWork(this.plan, key, change(this.labWork))
    this.notify()
  }

  /** "Save as a version": what is playing in the Lab, by the DJ at the screen. */
  saveVersion(name: string): void {
    const id = `v${this.nextId++}`
    const mine = this.labWork.versions.filter((v) => v.author === this.me).length
    const label =
      name.trim() || this.t('version.default', { name: this.djName(this.me), n: mine + 1 })
    const state = this.audio.snapshot()
    const plan = this.audio.plan
    this.changeWork((w) => addVersion(w, { id, name: label, author: this.me, state, plan }))
  }

  loadVersion(id: string): void {
    const version = this.labWork.versions.find((v) => v.id === id)
    if (version) this.audio.restore(version.state)
  }

  removeVersion(id: string): void {
    this.changeWork((w) => removeVersion(w, id))
  }

  /** The bar of the outgoing track at the cursor. */
  get cursorBar(): number {
    const session = this.audio
    const state = session.transport.state
    const beat =
      state.kind === 'playing'
        ? session.transport.beatAt()
        : state.kind === 'paused'
          ? state.beat
          : 0
    return deckPosition(session.timing, 'A', beat).bar
  }

  /** A comment pinned to the bar of the outgoing track at the cursor. */
  comment(text: string): void {
    const t = text.trim()
    if (!t) return
    const comment = { id: `c${this.nextId++}`, author: this.me, bar: this.cursorBar, text: t }
    this.changeWork((w) => addComment(w, comment))
  }

  /** The DJ at the screen picks a version, keeps both, or (null) takes their pick back. */
  pick(value: Pick | null): void {
    this.changeWork((w) => pick(w, this.me, value))
  }

  remove(index: number): void {
    if (!this.plan) return
    this.plan = removeTrack(this.plan, index)
    this.notify()
  }

  add(id: string): void {
    if (!this.plan) return
    this.plan = addTrack(this.plan, id)
    this.notify()
  }

  private async buffer(id: string): Promise<AudioBuffer> {
    const cached = this.decoded.get(id)
    if (cached) return cached
    const track = this.tracks.find((t) => t.id === id)
    if (!track) throw new Error(this.t('store.noTrack'))
    if (!track.file) throw new Error(this.t('store.selectAgain', { name: track.fileName }))
    const buffer = await decodeFile(this.audio.ctx, track.file)
    this.decoded.set(id, buffer)
    while (this.decoded.size > KEEP_DECODED) this.decoded.delete(this.decoded.keys().next().value!)
    return buffer
  }

  /** Plays HEAR_BARS bars of a track from `bar`; again on the same bars stops it. */
  hear(trackId: string, bar: number): Promise<void> {
    return this.hearAll(`${trackId}@${bar}`, [{ trackId, bar }])
  }

  /** "Hear the idea": one moment of each track of a reading, in its order. */
  hearIdea(key: string, list: readonly { trackId: string; bar: number }[]): Promise<void> {
    return this.hearAll(`idea:${key}`, list)
  }

  /** Whether `key` is what is playing. */
  isHearing(key: string): boolean {
    return this.hearing?.key === key
  }

  /**
   * Plays a list of 8-bar moments one after another; asking again for the same list
   * stops it. The next track is decoded while one plays.
   */
  private async hearAll(key: string, list: readonly { trackId: string; bar: number }[]) {
    try {
      await this.hearList(key, list)
    } catch (e) {
      this.stopHearing()
      this.say(e instanceof Error ? e.message : String(e))
    }
  }

  say(notice: string | null): void {
    this.notice = notice
    this.notify()
  }

  private async hearList(key: string, list: readonly { trackId: string; bar: number }[]) {
    const same = this.hearing?.key === key
    this.stopHearing()
    if (same || list.length === 0) return
    const { ctx } = this.audio
    const token = {}
    this.hearToken = token
    if (ctx.state !== 'running') await ctx.resume()
    for (let index = 0; index < list.length; index++) {
      const { trackId, bar } = list[index]!
      const profile = this.profile(trackId)
      if (!profile) continue
      this.hearing = { key, trackId, bar, index, total: list.length }
      this.notify()
      const buffer = await this.buffer(trackId)
      if (this.hearToken !== token) return
      const next = list[index + 1]
      if (next) void this.buffer(next.trackId).catch(() => undefined)
      await this.play(buffer, profile, bar)
      if (this.hearToken !== token) return
    }
    this.hearToken = null
    this.hearing = null
    this.notify()
  }

  /** Plays HEAR_BARS bars and resolves when they end or are stopped. */
  private play(buffer: AudioBuffer, profile: TrackProfile, bar: number): Promise<void> {
    const { ctx } = this.audio
    const source = ctx.createBufferSource()
    source.buffer = buffer
    const gain = ctx.createGain()
    source.connect(gain).connect(ctx.destination)
    const from = Math.max(0, beatToSec(profile.grid, barToBeat(profile.grid, bar)))
    const length = HEAR_BARS * secondsPerBar(profile.grid)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + 0.02)
    gain.gain.setValueAtTime(1, now + length - 0.05)
    gain.gain.linearRampToValueAtTime(0, now + length)
    this.hearSource = source
    return new Promise((resolve) => {
      source.onended = () => {
        if (this.hearSource === source) this.hearSource = null
        resolve()
      }
      source.start(now, from, length)
    })
  }

  stopHearing(): void {
    this.hearToken = null
    const source = this.hearSource
    this.hearSource = null
    source?.stop()
    if (this.hearing) {
      this.hearing = null
      this.notify()
    }
  }

  /** Loads a transition's two tracks into the Transition Builder, with Auto's blend start. */
  async openLab(index: number): Promise<void> {
    const plan = this.plan
    const from = plan?.order[index]
    const to = plan?.order[index + 1]
    const a = from ? this.profile(from) : undefined
    const b = to ? this.profile(to) : undefined
    if (!from || !to || !a || !b) return
    this.stopHearing()
    this.labError = null
    this.lab = { from, to, index }
    this.lastLab = index
    this.notify()
    const session = this.audio
    try {
      const [bufferA, bufferB] = [await this.buffer(from), await this.buffer(to)]
      session.transport.stop()
      const sourceA = { name: a.name, buffer: bufferA, grid: a.grid }
      session.setDeck('A', sourceA)
      session.setDeck('B', { name: b.name, buffer: bufferB, grid: b.grid })
      // A first track can be refused next to the previous second one; it fits the new one.
      if (session.decks.A.buffer !== bufferA) session.setDeck('A', sourceA)
      if (session.decks.A.buffer !== bufferA || session.decks.B.buffer !== bufferB)
        throw new Error(session.errors.join('; ') || this.t('store.labLoad'))
      session.suggestBlend()
    } catch (e) {
      this.lab = null
      this.labError = e instanceof Error ? e.message : String(e)
      this.notify()
      return
    }
    // The pair counts as tried once it plays.
    this.stopTried?.()
    this.stopTried = session.transport.subscribe(() => {
      if (session.transport.state.kind !== 'playing' || !this.plan || !this.lab) return
      this.plan = markTried(this.plan, this.lab.from, this.lab.to)
      this.notify()
    })
    this.screen = 'lab'
    this.notify()
  }

  /** Leaves the Lab; a grid corrected there becomes the track's own. */
  private leaveLab(): void {
    const session = this.session
    const lab = this.lab
    this.stopTried?.()
    this.stopTried = null
    this.lab = null
    if (!session || !lab) return
    session.transport.stop()
    for (const [deck, id] of [
      ['A', lab.from],
      ['B', lab.to],
    ] as const) {
      const grid = session.decks[deck].grid
      const profile = this.profile(id)
      if (profile && grid.source === 'user' && grid !== profile.grid) this.setGrid(id, grid)
    }
  }

  private notify(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}
