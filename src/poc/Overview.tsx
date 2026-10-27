import { useEffect, useRef } from 'react'
import type { TrackStructure } from '../engine/analysis/structure'
import { phraseStarts, setPhraseOffset } from '../engine/grid'
import type { DeckId } from '../engine/model'
import { moveEdge } from '../engine/plan/area'
import {
  barToBeat,
  deckBeatToTransitionBeat,
  formatBarBeat,
  loopSchedule,
  toBarBeat,
  transitionBeatToDeckBeat,
} from '../engine/time'
import type { Translate } from '../i18n'
import { useT } from '../i18n/react'
import type { PocSession } from './session'

// The whole of each track (#29): level per bar, low end, 8-bar phrase lines, the bars
// where the music changes, likely sections in the structure terms of
// docs/MUSICAL_LANGUAGE.md, and where the transition sits. Sections are _likely_: the
// reasons are shown so the user can check them by ear. The phrase check says whether
// the phrase lines match the changes, and offers to move them when they clearly do not.
//
// Each deck's view is also where the transition is chosen (#75). Clicking a track moves
// the playback cursor; the blend lane under it sets that deck's side of the blend start
// (click or drag: A's blend start, or the beat of B lined up with it) and sizes the
// transition area (drag its edges). A phrase number puts that side of the blend start on
// the phrase line, and a section becomes the area. All of them change the session's one
// blend start and area, so the numbers above, the mixing line and the plan follow.

const RANGE_DB = 36

/** Deck bar (1-based, fractional) at a transition beat. */
function deckBar(session: PocSession, deck: DeckId, beat: number): number {
  return transitionBeatToDeckBeat(session.timing, deck, beat) / 4 + 1
}

/** The phrase check in words: how many changes fall on a phrase line, and where the rest fall. */
export function phraseNote(s: TrackStructure, startBar: number, t: Translate): string {
  const { changes, onLines, suggestedOffsetBars } = s.phraseCheck
  if (changes < 2) return t('poc.phrase.none')
  const fit = t('poc.phrase.fit', { on: onLines, changes })
  if (suggestedOffsetBars === undefined) return fit
  const later = (((suggestedOffsetBars + 1 - startBar) % 8) + 8) % 8
  const by = later <= 4 ? later : 8 - later
  return t(later <= 4 ? 'poc.phrase.mostAfter' : 'poc.phrase.mostBefore', {
    fit,
    by,
    bar: suggestedOffsetBars + 1,
  })
}

/** Whether the phrase lines clearly miss the changes: the grid wants a look. */
export function gridFitsBadly(s: TrackStructure): boolean {
  const { changes, onLines } = s.phraseCheck
  return changes >= 2 && onLines / changes < 0.5
}

type Drag = { kind: 'start' } | { kind: 'edge'; edge: 'before' | 'after' }

export function DeckOverview({
  session,
  deck,
  onSeek,
}: {
  session: PocSession
  deck: DeckId
  onSeek: (beat: number) => void
}) {
  const t = useT()
  const source = session.decks[deck]
  const { grid } = source
  const s = session.structure(deck)
  const n = s.bars.length
  const playhead = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const x = (bar: number) => `${(((bar - 1) / Math.max(1, n)) * 100).toFixed(3)}%`

  useEffect(() => {
    let shown = ''
    return session.loop.onFrame(({ beat }) => {
      const el = playhead.current
      if (!el) return
      const bar = deckBar(session, deck, beat)
      // A whole-track view moves less than a pixel per frame: write only when it shows.
      const left = bar < 1 || bar > n + 1 ? '' : `${(((bar - 1) / n) * 100).toFixed(2)}%`
      if (left === shown) return
      shown = left
      el.hidden = left === ''
      if (left) el.style.left = left
    })
  }, [session, deck, n])

  if (n === 0) return null
  const top = Math.max(...s.bars.map((b) => b.energyDb))
  const topLow = Math.max(...s.bars.map((b) => b.lowDb))
  const level = (v: number, ref: number) =>
    Math.min(1, Math.max(0, (v - ref + RANGE_DB) / RANGE_DB))
  const phrases = phraseStarts(grid, 1, n, 8)
  const labelEvery = phrases.length > 16 ? 2 : 1
  const startBar = (((grid.phraseOffsetBars % 8) + 8) % 8) + 1
  const lower = deck.toLowerCase()
  const setStart = (bar: number) =>
    session.setGrid(deck, setPhraseOffset(grid, (((bar - 1) % 8) + 8) % 8))

  const isA = deck === 'A'
  const mark = session.markBeat(deck)
  const area = session.areaBeats
  const areaFrom = deckBar(session, deck, area.from)
  const areaTo = deckBar(session, deck, area.to)
  const markBar = deckBar(session, deck, 0)
  const markText = formatBarBeat(toBarBeat(grid, mark))
  const loop = loopSchedule(session.timing)
  const looped = loop?.deck === deck ? loop : null

  /** Track beat of this deck under the pointer, on the nearest beat. */
  const beatAt = (e: React.PointerEvent<HTMLElement>, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const u = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    return Math.round(u * n * 4)
  }

  const seekTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button')) return
    onSeek(deckBeatToTransitionBeat(session.timing, deck, beatAt(e, e.currentTarget)))
  }

  const dragTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const beat = beatAt(e, e.currentTarget)
    const markNow = session.markBeat(deck)
    if (d.kind === 'start') {
      if (beat !== markNow) session.setMark(deck, beat)
      return
    }
    const bars = Math.round(Math.abs(beat - markNow) / 4)
    const current = d.edge === 'before' ? session.area.beforeBars : session.area.afterBars
    if (bars !== current) session.setArea(moveEdge(session.area, d.edge, bars))
  }

  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    const edge = (e.target as HTMLElement).dataset.edge
    drag.current =
      edge === 'before' || edge === 'after' ? { kind: 'edge', edge } : { kind: 'start' }
    e.currentTarget.setPointerCapture(e.pointerId)
    dragTo(e)
  }

  const release = () => {
    drag.current = null
  }

  return (
    <div className="ov-deck" data-overview={deck}>
      <div className="ov-head">
        <strong className={`deck-${lower}`}>{t('poc.deck', { deck })}</strong>
        <span className="poc-deck-name">{source.name}</span>
        <span className="muted">{t('poc.bars', { n })}</span>
      </div>
      <div
        className={`ov-track ov-${lower}`}
        onPointerDown={seekTrack}
        data-testid={`overview-track-${deck}`}
      >
        <div className="ov-sections">
          {s.sections.map((sec) => (
            <button
              key={sec.fromBar}
              className="ov-section ov-pick"
              data-term={sec.term}
              style={{ left: x(sec.fromBar), width: x(sec.toBar - sec.fromBar + 2) }}
              title={t('poc.sectionHint', {
                term: sec.term,
                from: sec.fromBar,
                to: sec.toBar,
                reasons: sec.reasons.join(', '),
              })}
              aria-label={t(isA ? 'poc.blendAcross' : 'poc.blendAcrossB', {
                term: sec.term,
                from: sec.fromBar,
                to: sec.toBar,
              })}
              onClick={() => session.useSection(deck, sec.fromBar, sec.toBar)}
            >
              {sec.term}
            </button>
          ))}
        </div>
        <svg
          className="ov-bars"
          viewBox={`0 0 ${n} 48`}
          preserveAspectRatio="none"
          aria-label={t('poc.levelAria', { deck })}
          role="img"
        >
          {s.bars.map((b, k) => {
            const h = Math.max(0.5, level(b.energyDb, top) * 36)
            return (
              <g key={b.bar}>
                <rect className="ov-level" x={k + 0.1} y={19 - h / 2} width={0.8} height={h} />
                <rect
                  className="ov-low"
                  x={k}
                  y={42}
                  width={1}
                  height={6}
                  opacity={level(b.lowDb, topLow)}
                />
              </g>
            )
          })}
        </svg>
        <div
          className="ov-area"
          style={{ left: x(areaFrom), width: x(areaTo - areaFrom + 1) }}
          title={t('poc.areaHint', {
            deck,
            from: Math.floor(areaFrom),
            to: Math.ceil(areaTo) - 1,
          })}
          data-testid={`area-${deck}`}
        />
        {looped && (
          <div
            className="ov-loop"
            style={{
              left: x(looped.startBeat / 4 + 1),
              width: x(looped.lengthBeats / 4 + 1),
            }}
            title={t('poc.loopHint', {
              from: looped.startBeat / 4 + 1,
              to: (looped.startBeat + looped.lengthBeats) / 4,
              passes: looped.passes,
            })}
            data-testid={`overview-loop-${deck}`}
          >
            ⟲ ×{looped.passes}
          </div>
        )}
        {phrases.map((bar, k) => (
          <div key={bar} className="ov-phrase" style={{ left: x(bar) }}>
            {k % labelEvery === 0 && (
              <button
                className="ov-phrase-pick"
                onClick={() => session.setMark(deck, barToBeat(grid, bar))}
                aria-label={t(isA ? 'poc.phrasePickA' : 'poc.phrasePickB', { bar })}
              >
                {bar}
              </button>
            )}
          </div>
        ))}
        {s.changes.map((c) => (
          <div
            key={c.bar}
            className="ov-change"
            style={{ left: x(c.bar) }}
            title={t('poc.changeAt', { bar: c.bar })}
          />
        ))}
        <div
          className="ov-mark"
          style={{ left: x(markBar) }}
          title={t(isA ? 'poc.markA' : 'poc.markB', { at: markText })}
          data-testid={`mark-${deck}`}
        />
        <div className="ov-playhead" ref={playhead} hidden title={t('poc.cursor')} />
      </div>
      <div
        className="ov-lane"
        onPointerDown={grab}
        onPointerMove={dragTo}
        onPointerUp={release}
        onPointerCancel={release}
        data-testid={isA ? 'blend-lane' : 'blend-lane-B'}
        title={t(isA ? 'poc.laneHintA' : 'poc.laneHintB')}
      >
        <div
          className="ov-lane-area"
          style={{ left: x(areaFrom), width: x(areaTo - areaFrom + 1) }}
        >
          <span
            className="ov-handle"
            data-edge="before"
            aria-label={t('poc.areaStart', { deck })}
          />
          <span className="ov-handle" data-edge="after" aria-label={t('poc.areaEnd', { deck })} />
        </div>
        <span className="ov-flag" style={{ left: x(markBar) }}>
          {t(isA ? 'poc.flagA' : 'poc.flagB')} {markText}
        </span>
      </div>
      <div className="ov-notes">
        <span className="chip chip-likely">{t('poc.likely')}</span>
        <span data-testid={`phrase-check-${deck}`}>{phraseNote(s, startBar, t)}</span>
        {s.phraseCheck.suggestedOffsetBars !== undefined && (
          <button
            className="btn btn-small"
            onClick={() => setStart(s.phraseCheck.suggestedOffsetBars! + 1)}
          >
            {t('poc.startPhrases', { bar: s.phraseCheck.suggestedOffsetBars + 1 })}
          </button>
        )}
        <span className="ov-offset">
          {t('poc.phraseFrom', { bar: startBar })}
          <button
            className="btn btn-small"
            onClick={() => setStart(startBar - 1)}
            aria-label={t('poc.phraseEarlier', { deck })}
          >
            −1
          </button>
          <button
            className="btn btn-small"
            onClick={() => setStart(startBar + 1)}
            aria-label={t('poc.phraseLater', { deck })}
          >
            +1
          </button>
        </span>
      </div>
      <ul className="ov-legend" aria-label={t('poc.sectionsAria', { deck })}>
        {s.sections.map((sec) => (
          <li key={sec.fromBar} data-term={sec.term}>
            <strong>{sec.term}</strong> {sec.fromBar}–{sec.toBar}
            <span className="muted"> · {sec.reasons.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** How to read and use the whole-track view, in one short paragraph. */
export function OverviewHow() {
  const t = useT()
  return (
    <span className="muted ov-how">
      <span className="ov-key ov-key-cursor" /> {t('poc.ovHow.cursor')}{' '}
      <span className="ov-key ov-key-mark" /> {t('poc.ovHow.mark')}{' '}
      <span className="ov-key ov-key-area" /> {t('poc.ovHow.area')}
    </span>
  )
}

export function Overview({
  session,
  onSeek,
}: {
  session: PocSession
  onSeek: (beat: number) => void
}) {
  const t = useT()
  return (
    <section className="card poc-overview" aria-label={t('poc.wholeTracks')}>
      <div className="ov-intro">
        <strong>{t('poc.wholeTracks')}</strong>
        <span className="muted">{t('poc.ovIntro')}</span>
        <OverviewHow />
      </div>
      <DeckOverview session={session} deck="A" onSeek={onSeek} />
      <DeckOverview session={session} deck="B" onSeek={onSeek} />
    </section>
  )
}
