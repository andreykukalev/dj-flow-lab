import { useEffect, useRef } from 'react'
import type { TrackStructure } from '../engine/analysis/structure'
import { phraseStarts, setPhraseOffset } from '../engine/grid'
import type { DeckId } from '../engine/model'
import { moveEdge } from '../engine/plan/area'
import { barToBeat, formatBarBeat, toBarBeat, transitionBeatToDeckBeat } from '../engine/time'
import type { PocSession } from './session'

// The whole of each track (#29): level per bar, low end, 8-bar phrase lines, the bars
// where the music changes, likely sections in the structure terms of
// docs/MUSICAL_LANGUAGE.md, and where the transition sits. Sections are _likely_: the
// reasons are shown so the user can check them by ear. The phrase check says whether
// the phrase lines match the changes, and offers to move them when they clearly do not.
//
// Deck A's view is also where the transition is chosen (#75). Clicking the track moves
// the playback cursor; the blend lane under it sets the blend start (click or drag) and
// sizes the transition area (drag its edges). A phrase number puts the blend start on
// that phrase line, and a section becomes the area. All of them change the session's one
// blend start and area, so the numbers above, the mixing line and the plan follow.

const RANGE_DB = 36

/** Deck bar (1-based, fractional) at a transition beat. */
function deckBar(session: PocSession, deck: DeckId, beat: number): number {
  return transitionBeatToDeckBeat(session.timing, deck, beat) / 4 + 1
}

function phraseNote(s: TrackStructure, startBar: number): string {
  const { changes, onLines, suggestedOffsetBars } = s.phraseCheck
  if (changes < 2)
    return 'No clear changes found, so the phrase lines cannot be checked from the music. Listen for where parts come and go.'
  const fit = `${onLines} of ${changes} changes fall on a phrase line.`
  if (suggestedOffsetBars === undefined) return fit
  const later = (((suggestedOffsetBars + 1 - startBar) % 8) + 8) % 8
  const by = later <= 4 ? later : 8 - later
  const where = `${by} bar${by === 1 ? '' : 's'} ${later <= 4 ? 'after' : 'before'} the lines`
  return `${fit} Most fall ${where}: the phrases may start at bar ${suggestedOffsetBars + 1}.`
}

type Drag = { kind: 'start' } | { kind: 'edge'; edge: 'before' | 'after' }

function DeckOverview({
  session,
  deck,
  onSeek,
}: {
  session: PocSession
  deck: DeckId
  onSeek: (beat: number) => void
}) {
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
  const area = session.areaBeats
  const areaFrom = deckBar(session, deck, area.from)
  const areaTo = deckBar(session, deck, area.to)
  const markBar = deckBar(session, deck, 0)
  const markText = formatBarBeat(toBarBeat(grid, transitionBeatToDeckBeat(session.timing, deck, 0)))

  /** Track beat of this deck under the pointer, on the nearest beat. */
  const beatAt = (e: React.PointerEvent<HTMLElement>, el: HTMLElement) => {
    const rect = el.getBoundingClientRect()
    const u = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    return Math.round(u * n * 4)
  }

  const seekTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isA || (e.target as Element).closest('button')) return
    onSeek(beatAt(e, e.currentTarget) - session.blendStartBeat)
  }

  const dragTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const beat = beatAt(e, e.currentTarget)
    if (d.kind === 'start') {
      if (beat !== session.blendStartBeat) session.setBlendStart(beat)
      return
    }
    const bars = Math.round(Math.abs(beat - session.blendStartBeat) / 4)
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
        <strong className={`deck-${lower}`}>Deck {deck}</strong>
        <span className="poc-deck-name">{source.name}</span>
        <span className="muted">{n} bars</span>
      </div>
      <div
        className={`ov-track ov-${lower}`}
        onPointerDown={seekTrack}
        data-testid={`overview-track-${deck}`}
      >
        <div className="ov-sections">
          {s.sections.map((sec) => {
            const style = { left: x(sec.fromBar), width: x(sec.toBar - sec.fromBar + 2) }
            const title = `${sec.term}, bars ${sec.fromBar}–${sec.toBar} (likely): ${sec.reasons.join(', ')}`
            return isA ? (
              <button
                key={sec.fromBar}
                className="ov-section ov-pick"
                data-term={sec.term}
                style={style}
                title={`${title}. Click to blend across this section.`}
                aria-label={`Blend across ${sec.term} ${sec.fromBar}–${sec.toBar}`}
                onClick={() => session.useSection(sec.fromBar, sec.toBar)}
              >
                {sec.term}
              </button>
            ) : (
              <div
                key={sec.fromBar}
                className="ov-section"
                data-term={sec.term}
                style={style}
                title={title}
              >
                {sec.term}
              </div>
            )
          })}
        </div>
        <svg
          className="ov-bars"
          viewBox={`0 0 ${n} 48`}
          preserveAspectRatio="none"
          aria-label={`Deck ${deck} level and low end per bar`}
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
          title={`The transition area: deck ${deck} bars ${Math.floor(areaFrom)}–${Math.ceil(areaTo) - 1} are blended`}
          data-testid={`area-${deck}`}
        />
        {phrases.map((bar, k) => (
          <div key={bar} className="ov-phrase" style={{ left: x(bar) }}>
            {k % labelEvery === 0 &&
              (isA ? (
                <button
                  className="ov-phrase-pick"
                  onClick={() => session.setBlendStart(barToBeat(grid, bar))}
                  aria-label={`Blend start on the phrase line at bar ${bar}`}
                >
                  {bar}
                </button>
              ) : (
                <span>{bar}</span>
              ))}
          </div>
        ))}
        {s.changes.map((c) => (
          <div
            key={c.bar}
            className="ov-change"
            style={{ left: x(c.bar) }}
            title={`The music changes at bar ${c.bar}`}
          />
        ))}
        <div
          className="ov-mark"
          style={{ left: x(markBar) }}
          title={
            isA ? `Blend start: A ${markText}` : `Lined up with the blend start: B ${markText}`
          }
          data-testid={`mark-${deck}`}
        />
        <div className="ov-playhead" ref={playhead} hidden title="Playback cursor" />
      </div>
      {isA && (
        <div
          className="ov-lane"
          onPointerDown={grab}
          onPointerMove={dragTo}
          onPointerUp={release}
          onPointerCancel={release}
          data-testid="blend-lane"
          title="Click or drag to set the blend start; drag an edge to size the transition area"
        >
          <div
            className="ov-lane-area"
            style={{ left: x(areaFrom), width: x(areaTo - areaFrom + 1) }}
          >
            <span className="ov-handle" data-edge="before" aria-label="Transition area start" />
            <span className="ov-handle" data-edge="after" aria-label="Transition area end" />
          </div>
          <span className="ov-flag" style={{ left: x(markBar) }}>
            Blend start {markText}
          </span>
        </div>
      )}
      <div className="ov-notes">
        <span className="chip chip-likely">likely</span>
        <span data-testid={`phrase-check-${deck}`}>{phraseNote(s, startBar)}</span>
        {s.phraseCheck.suggestedOffsetBars !== undefined && (
          <button
            className="btn btn-small"
            onClick={() => setStart(s.phraseCheck.suggestedOffsetBars! + 1)}
          >
            Start phrases at bar {s.phraseCheck.suggestedOffsetBars + 1}
          </button>
        )}
        <span className="ov-offset">
          Phrase lines from bar {startBar}
          <button
            className="btn btn-small"
            onClick={() => setStart(startBar - 1)}
            aria-label={`Deck ${deck} phrase lines one bar earlier`}
          >
            −1
          </button>
          <button
            className="btn btn-small"
            onClick={() => setStart(startBar + 1)}
            aria-label={`Deck ${deck} phrase lines one bar later`}
          >
            +1
          </button>
        </span>
      </div>
      <ul className="ov-legend" aria-label={`Deck ${deck} likely sections`}>
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

export function Overview({
  session,
  onSeek,
}: {
  session: PocSession
  onSeek: (beat: number) => void
}) {
  return (
    <section className="card poc-overview" aria-label="Whole tracks">
      <div className="ov-intro">
        <strong>Whole tracks</strong>
        <span className="muted">
          Level per bar, low end below it, 8-bar phrase lines, and ▼ where the music changes. The
          sections are a guess from those features: check them by ear. Bars come from the grid
          above, so correct the grid first.
        </span>
        <span className="muted ov-how">
          <span className="ov-key ov-key-cursor" /> playback cursor: click track A to move it.{' '}
          <span className="ov-key ov-key-mark" /> blend start: click or drag in the lane under track
          A, or press B to put it at the cursor. The shaded <span className="ov-key ov-key-area" />{' '}
          transition area is the music that is blended: drag its edges. A phrase number or a section
          is a quick starting point.
        </span>
      </div>
      <DeckOverview session={session} deck="A" onSeek={onSeek} />
      <DeckOverview session={session} deck="B" onSeek={onSeek} />
    </section>
  )
}
