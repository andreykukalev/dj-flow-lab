import { LOOP_BARS, MAX_PASSES, type LoopRequest } from '../engine/plan/loop'
import { LOOP_KINDS, describeLoop, loopName, practiceLoop } from './loopText'
import type { PocSession } from './session'

// The loop (#81), folded away under the transition area: off until the user opens it and
// picks what to loop. The blend start and the area stay where they are; the loop changes
// what one deck plays around them. What it does is said in musical terms first, then how
// to play it on a controller.

/** Where a new loop starts: A's bars from the blend start, or B's first bars. */
function newLoop(session: PocSession, deck: 'A' | 'B', side: 'before' | 'after'): LoopRequest {
  const bars = 4
  const gapBars = side === 'before' ? Math.max(0, Math.floor(session.markBeat(deck) / 4) - bars) : 0
  return { deck, side, bars, passes: 2, gapBars }
}

export function LoopPanel({ session }: { session: PocSession }) {
  const request = session.loopRequest
  const kind = request ? `${request.deck}-${request.side}` : 'off'
  const set = (change: Partial<LoopRequest>) =>
    request && session.setLoop({ ...request, ...change })
  // "Earlier" and "later" on the timeline: away from the blend start before it, towards it after.
  const move = (bars: number) =>
    request &&
    set({ gapBars: Math.max(0, request.gapBars + (request.side === 'after' ? bars : -bars)) })
  const text = describeLoop(session.timing)
  const practice = practiceLoop(session.timing)
  const unsure = session.warnings.filter((w) => w.code === 'loop-grid')

  return (
    <details className="poc-loop" open={request !== null || undefined} data-testid="loop">
      <summary>
        Loop{' '}
        <span className="muted" data-testid="loop-summary">
          {request ? loopName(request, session.timing) : 'off'}
        </span>
      </summary>
      <p className="muted poc-loop-note">
        A loop repeats a few bars of one track, so it can hold on longer or come in earlier while
        the other track plays on. Your blend start and area stay where they are.
      </p>
      <div className="poc-deck-row">
        <label className="poc-field">
          Loop
          <select
            value={kind}
            onChange={(e) => {
              const k = LOOP_KINDS.find((o) => o.id === e.target.value)
              session.setLoop(k ? newLoop(session, k.deck, k.side) : null)
            }}
            aria-label="What to loop"
          >
            <option value="off">Off: both tracks play straight</option>
            {LOOP_KINDS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {request && (
        <>
          <div className="poc-deck-row">
            <div className="poc-segmented" role="group" aria-label="Loop length">
              {LOOP_BARS.map((bars) => (
                <button
                  key={bars}
                  className="btn btn-small"
                  aria-pressed={request.bars === bars}
                  onClick={() => set({ bars })}
                >
                  {bars} bars
                </button>
              ))}
            </div>
            <span className="poc-field">
              Plays
              <button
                className="btn btn-small"
                onClick={() => set({ passes: request.passes - 1 })}
                disabled={request.passes <= 2}
                aria-label="Play the loop fewer times"
              >
                −
              </button>
              <strong data-testid="loop-passes">{request.passes}×</strong>
              <button
                className="btn btn-small"
                onClick={() => set({ passes: request.passes + 1 })}
                disabled={request.passes >= MAX_PASSES}
                aria-label="Play the loop more times"
              >
                +
              </button>
            </span>
            <span className="poc-field">
              Move
              <button
                className="btn btn-small"
                onClick={() => move(-1)}
                aria-label="Loop one bar earlier"
              >
                ‹ bar
              </button>
              <button
                className="btn btn-small"
                onClick={() => move(1)}
                aria-label="Loop one bar later"
              >
                bar ›
              </button>
            </span>
            <button className="btn btn-small" onClick={() => session.setLoop(null)}>
              Play straight
            </button>
          </div>
          {text && (
            <p className="poc-loop-text" data-testid="loop-text">
              {text}
            </p>
          )}
          {practice && <p className="muted poc-loop-note">{practice}</p>}
          {unsure.map((w) => (
            <p key={w.message} className="poc-trimmed">
              {w.message}
            </p>
          ))}
        </>
      )}
    </details>
  )
}
