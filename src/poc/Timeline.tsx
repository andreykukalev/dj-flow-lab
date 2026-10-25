import { useEffect, useRef } from 'react'
import { valueAt } from '../engine/plan/compile'
import type { PocSession } from './session'
import { deckPosition } from './session'

// The proof of concept's bar ruler: both decks on one ruler in transition beats, each
// lane drawn from its fader in the plan, the overlap shaded, the handoff dashed and the
// playhead moved by the controller loop. #20 builds the full timeline.

const MARKERS: { id: string; label: string }[] = [
  { id: 'bring-in', label: 'B in, no bass' },
  { id: 'thin-out', label: 'A thins out' },
  { id: 'bass-swap', label: 'Bass swap' },
  { id: 'fade-out', label: 'A fades' },
]

const HANDOFF_BEAT = 64
const OVERLAP = [0, 128] as const

export function Timeline({
  session,
  onSeek,
}: {
  session: PocSession
  onSeek: (beat: number) => void
}) {
  const { compiled, timing, plan, loop } = session
  const { startBeat, endBeat } = compiled.span
  const span = endBeat - startBeat
  const pct = (beat: number) => `${(((beat - startBeat) / span) * 100).toFixed(3)}%`
  const playhead = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      loop.onFrame(({ beat }) => {
        const u = Math.min(1, Math.max(0, (beat - startBeat) / span))
        playhead.current?.style.setProperty('left', `${(u * 100).toFixed(3)}%`)
      }),
    [loop, startBeat, span],
  )

  const beats = Array.from({ length: span }, (_, i) => startBeat + i)
  const phrases = beats.filter((b) => b % 32 === 0)
  const lane = (deck: 'A' | 'B') => (
    <svg
      className={`timeline-lane lane-${deck.toLowerCase()}`}
      viewBox={`0 0 ${span} 64`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {beats.map((b) => {
        const level = valueAt(compiled.controls[`${deck}.fader`], b + 0.5)
        const h = Math.max(1, level * 60)
        return (
          <rect
            key={b}
            x={b - startBeat + 0.15}
            y={(64 - h) / 2}
            width={0.7}
            height={h}
            opacity={level > 0 ? 0.9 : 0.3}
          />
        )
      })}
    </svg>
  )

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const beat = startBeat + ((e.clientX - rect.left) / rect.width) * span
    onSeek(Math.max(startBeat, Math.min(endBeat - 4, Math.floor(beat / 4) * 4)))
  }

  return (
    <section className="card timeline" aria-label="Transition timeline">
      <div className="timeline-decks">
        <div className="timeline-deck deck-a">
          <strong>A</strong>
          <span>{timing.gridA.bpm.toFixed(2)} BPM</span>
        </div>
        <div className="timeline-deck deck-b">
          <strong>B</strong>
          <span>{timing.gridB.bpm.toFixed(2)} BPM</span>
        </div>
      </div>
      <div className="timeline-body" onClick={seek} data-testid="timeline">
        <div className="timeline-ruler">
          {phrases.map((b) => (
            <span key={b} style={{ left: pct(b) }}>
              {b === startBeat ? 'A ' : ''}
              {deckPosition(timing, 'A', b).bar}
            </span>
          ))}
        </div>
        <div className="timeline-track">
          <div
            className="timeline-overlap"
            style={{ left: pct(OVERLAP[0]), width: `${((OVERLAP[1] - OVERLAP[0]) / span) * 100}%` }}
          />
          {phrases.map((b) => (
            <div key={b} className="timeline-phrase-line" style={{ left: pct(b) }} />
          ))}
          {lane('A')}
          <div className="timeline-markers">
            {MARKERS.map((m) => {
              const a = plan.annotations.find((n) => n.id === m.id)
              return (
                a && (
                  <span key={m.id} className="timeline-marker" style={{ left: pct(a.atBeat) }}>
                    {m.label}
                  </span>
                )
              )
            })}
          </div>
          {lane('B')}
          <div className="timeline-handoff" style={{ left: pct(HANDOFF_BEAT) }} />
          <div className="timeline-playhead" ref={playhead} />
        </div>
        <div className="timeline-ruler">
          {phrases
            .filter((b) => deckPosition(timing, 'B', b).bar >= 1)
            .map((b) => (
              <span key={b} style={{ left: pct(b) }}>
                {deckPosition(timing, 'B', b).bar === 1 ? 'B ' : ''}
                {deckPosition(timing, 'B', b).bar}
              </span>
            ))}
        </div>
      </div>
    </section>
  )
}
