// The transition area (#75): how much music around the blend start the blend uses.
// The user asks for bars before and after the blend start; `fitArea` keeps that inside
// the music both tracks have, and says what it had to trim. The fitted area is what
// the plan is generated for, so the highlighted area and the blend cannot disagree.

/** The area the user asked for, in bars around the blend start. */
export interface AreaRequest {
  beforeBars: number
  afterBars: number
  /** The same number of bars on both sides (the default), or each side on its own. */
  linked: boolean
}

/** An area that fits both tracks, in transition beats. */
export interface BlendArea {
  /** Beats of the blend before the blend start: B comes in here. */
  beforeBeats: number
  /** Beats of the blend after the blend start: A leaves here. */
  afterBeats: number
  /** A alone before the area, for replay. */
  preRollBeats: number
  /** B alone after the area. */
  tailBeats: number
}

export interface FittedArea extends BlendArea {
  /** What had to be trimmed, in words, or empty. */
  trimmed: string[]
  /** Less than a bar of blend fits around this blend start. */
  tooShort: boolean
}

/** Where the blend start sits in each track, and how much music each has. */
export interface AreaContext {
  /** Track beat of A at the blend start (0 = A's bar 1). */
  startBeatA: number
  /** Track beat of B at the blend start. */
  entryBeatB: number
  /** Track beats of music from bar 1 to the end of each file. */
  beatsA: number
  beatsB: number
}

export const DEFAULT_AREA: AreaRequest = { beforeBars: 16, afterBars: 16, linked: true }
/** Pre-roll and tail: 8 bars where the tracks have them. */
export const LEAD_BEATS = 32
/** The shortest blend: one bar. */
export const MIN_AREA_BEATS = 4

const barsText = (beats: number) => {
  const bars = Math.floor(beats / 4)
  const rest = beats - bars * 4
  const parts = [
    bars > 0 || rest === 0 ? `${bars} bar${bars === 1 ? '' : 's'}` : '',
    rest > 0 ? `${rest} beat${rest === 1 ? '' : 's'}` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

/** The requested area, trimmed to the music both tracks have around the blend start. */
export function fitArea(request: AreaRequest, context: AreaContext): FittedArea {
  const { startBeatA, entryBeatB, beatsA, beatsB } = context
  const wantBefore = Math.max(0, Math.round(request.beforeBars * 4))
  const wantAfter = Math.max(0, Math.round(request.afterBars * 4))
  const roomBeforeA = Math.max(0, Math.floor(startBeatA))
  const roomBeforeB = Math.max(0, Math.floor(entryBeatB))
  const roomAfterA = Math.max(0, Math.floor(beatsA - startBeatA))
  const roomAfterB = Math.max(0, Math.floor(beatsB - entryBeatB))
  const beforeBeats = Math.min(wantBefore, roomBeforeA, roomBeforeB)
  const afterBeats = Math.min(wantAfter, roomAfterA, roomAfterB)

  const trimmed: string[] = []
  if (beforeBeats < wantBefore) {
    const why =
      roomBeforeB <= roomBeforeA ? 'B has no music before that' : 'A has no music before that'
    trimmed.push(`Before trimmed to ${barsText(beforeBeats)}: ${why}.`)
  }
  if (afterBeats < wantAfter) {
    const why = roomAfterA <= roomAfterB ? 'A ends there' : 'B ends there'
    trimmed.push(`After trimmed to ${barsText(afterBeats)}: ${why}.`)
  }
  return {
    beforeBeats,
    afterBeats,
    preRollBeats: Math.min(LEAD_BEATS, roomBeforeA - beforeBeats),
    tailBeats: Math.min(LEAD_BEATS, Math.max(0, Math.floor(beatsB - entryBeatB) - afterBeats)),
    trimmed,
    tooShort: beforeBeats + afterBeats < MIN_AREA_BEATS,
  }
}

/** The request after moving one edge of the area; a linked area moves both edges. */
export function moveEdge(
  request: AreaRequest,
  edge: 'before' | 'after',
  bars: number,
): AreaRequest {
  const value = Math.max(0, bars)
  if (request.linked) return { ...request, beforeBars: value, afterBars: value }
  return edge === 'before' ? { ...request, beforeBars: value } : { ...request, afterBars: value }
}
