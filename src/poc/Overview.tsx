import { useEffect, useRef } from 'react'
import type { TrackStructure } from '../engine/analysis/structure'
import { phraseStarts, setPhraseOffset } from '../engine/grid'
import type { DeckId } from '../engine/model'
import { valueAt } from '../engine/plan/compile'
import { transitionBeatToDeckBeat } from '../engine/time'
import type { PocSession } from './session'

// The whole of each track (#29): level per bar, low end, 8-bar phrase lines, the bars
// where the music changes, likely sections in the structure terms of
// docs/MUSICAL_LANGUAGE.md, and where the transition sits. Sections are _likely_: the
// reasons are shown so the user can check them by ear. The phrase check says whether
// the phrase lines match the changes, and offers to move them when they clearly do not.

const RANGE_DB = 36

/** Deck bar (1-based, fractional) at a transition beat. */
function deckBar(session: PocSession, deck: DeckId, beat: number): number {
  return transitionBeatToDeckBeat(session.timing, deck, beat) / 4 + 1
}

/** Where the deck is audible in the transition, as deck bars. */
function audibleBars(session: PocSession, deck: DeckId): [number, number] | null {
  const { startBeat, endBeat } = session.compiled.span
  const fader = session.compiled.controls[`${deck}.fader`]
  let from: number | null = null
  let to: number | null = null
  for (let b = startBeat; b < endBeat; b += 0.5) {
    if (valueAt(fader, b) > 0.001) {
      from ??= b
      to = b + 0.5
    }
  }
  return from === null || to === null
    ? null
    : [deckBar(session, deck, from), deckBar(session, deck, to)]
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

function DeckOverview({ session, deck }: { session: PocSession; deck: DeckId }) {
  const source = session.decks[deck]
  const { grid } = source
  const s = session.structure(deck)
  const n = s.bars.length
  const playhead = useRef<HTMLDivElement>(null)
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
  const audible = audibleBars(session, deck)
  const lower = deck.toLowerCase()
  const setStart = (bar: number) =>
    session.setGrid(deck, setPhraseOffset(grid, (((bar - 1) % 8) + 8) % 8))

  return (
    <div className="ov-deck" data-overview={deck}>
      <div className="ov-head">
        <strong className={`deck-${lower}`}>Deck {deck}</strong>
        <span className="poc-deck-name">{source.name}</span>
        <span className="muted">{n} bars</span>
      </div>
      <div className={`ov-track ov-${lower}`}>
        <div className="ov-sections">
          {s.sections.map((sec) => (
            <div
              key={sec.fromBar}
              className="ov-section"
              data-term={sec.term}
              style={{ left: x(sec.fromBar), width: x(sec.toBar - sec.fromBar + 2) }}
              title={`${sec.term}, bars ${sec.fromBar}–${sec.toBar} (likely): ${sec.reasons.join(', ')}`}
            >
              {sec.term}
            </div>
          ))}
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
        {audible && (
          <div
            className="ov-blend"
            style={{ left: x(audible[0]), width: x(audible[1] - audible[0] + 1) }}
            title="Where this deck plays in the transition"
          />
        )}
        {phrases.map((bar, k) => (
          <div key={bar} className="ov-phrase" style={{ left: x(bar) }}>
            {k % labelEvery === 0 && <span>{bar}</span>}
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
        <div className="ov-playhead" ref={playhead} hidden />
      </div>
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

export function Overview({ session }: { session: PocSession }) {
  return (
    <section className="card poc-overview" aria-label="Whole tracks">
      <div className="ov-intro">
        <strong>Whole tracks</strong>
        <span className="muted">
          Level per bar, low end below it, 8-bar phrase lines, and ▼ where the music changes. The
          sections are a guess from those features: check them by ear. Bars come from the grid
          above, so correct the grid first.
        </span>
      </div>
      <DeckOverview session={session} deck="A" />
      <DeckOverview session={session} deck="B" />
    </section>
  )
}
