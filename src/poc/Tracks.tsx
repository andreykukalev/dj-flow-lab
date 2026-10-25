import { useState } from 'react'
import { nudgeBpm, nudgeGrid, setBpm, setDownbeatAt, twoPointGrid } from '../engine/grid'
import type { DeckId } from '../engine/model'
import { decodeFile, type PocSession } from './session'

// Track and grid controls of the proof of concept (#46): load a local file on each
// deck, then type or nudge its BPM and "the 1" (±1 ms, ±0.01 BPM, two-point BPM), and
// choose A's exit bar and B's entry bar. Changes apply while playing.

function NumberField({
  label,
  value,
  step,
  digits,
  onCommit,
}: {
  label: string
  value: number
  step: number
  digits: number
  onCommit: (value: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(draft)
    setDraft(null)
    if (Number.isFinite(n) && draft.trim() !== '') onCommit(n)
  }
  return (
    <label className="poc-field">
      {label}
      <input
        type="number"
        step={step}
        value={draft ?? value.toFixed(digits)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  )
}

function DeckPanel({ session, deck }: { session: PocSession; deck: DeckId }) {
  const source = session.decks[deck]
  const { grid } = source
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [points, setPointsDraft] = useState({ first: '', second: '' })
  const set = (next: typeof grid) => session.setGrid(deck, next)

  const load = async (file: File | undefined) => {
    if (!file) return
    setLoading(true)
    setLoadError(null)
    try {
      const buffer = await decodeFile(session.ctx, file)
      session.setDeck(deck, { name: file.name, buffer, grid: { ...grid, anchorSec: 0 } })
    } catch (e) {
      setLoadError(`Could not decode ${file.name}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  const twoPoint = () => {
    try {
      set(twoPointGrid(grid, Number(points.first), Number(points.second)))
      setLoadError(null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className={`poc-deck deck-${deck.toLowerCase()}-panel`} data-track={deck}>
      <div className="poc-deck-head">
        <strong className={`deck-${deck.toLowerCase()}`}>Deck {deck}</strong>
        <span className="poc-deck-name">{source.name}</span>
        <span className="muted">{source.buffer.duration.toFixed(1)} s</span>
        <label className="btn btn-small">
          {loading ? 'Decoding…' : 'Choose file'}
          <input
            type="file"
            accept="audio/*,.aif,.aiff,.aifc"
            hidden
            onChange={(e) => void load(e.target.files?.[0])}
            data-testid={`file-${deck}`}
          />
        </label>
      </div>
      <div className="poc-deck-row">
        <NumberField
          label="BPM"
          value={grid.bpm}
          step={0.01}
          digits={2}
          onCommit={(v) => v > 0 && set(setBpm(grid, v))}
        />
        <button className="btn btn-small" onClick={() => set(nudgeBpm(grid, -0.01))}>
          −0.01
        </button>
        <button className="btn btn-small" onClick={() => set(nudgeBpm(grid, 0.01))}>
          +0.01
        </button>
        <NumberField
          label="The 1 at"
          value={grid.anchorSec}
          step={0.001}
          digits={3}
          onCommit={(v) => set(setDownbeatAt(grid, v))}
        />
        <span className="muted">s</span>
        <button className="btn btn-small" onClick={() => set(nudgeGrid(grid, -0.001))}>
          −1 ms
        </button>
        <button className="btn btn-small" onClick={() => set(nudgeGrid(grid, 0.001))}>
          +1 ms
        </button>
      </div>
      <div className="poc-deck-row">
        <span className="muted">Two downbeats far apart, in seconds:</span>
        <input
          className="poc-input"
          aria-label={`Deck ${deck} first downbeat`}
          value={points.first}
          onChange={(e) => setPointsDraft({ ...points, first: e.target.value })}
        />
        <input
          className="poc-input"
          aria-label={`Deck ${deck} second downbeat`}
          value={points.second}
          onChange={(e) => setPointsDraft({ ...points, second: e.target.value })}
        />
        <button className="btn btn-small" onClick={twoPoint}>
          Set BPM from two points
        </button>
      </div>
      {loadError && <p className="poc-error">{loadError}</p>}
    </div>
  )
}

export function Tracks({ session }: { session: PocSession }) {
  const { points } = session
  return (
    <section className="card poc-tracks" aria-label="Tracks and grids">
      <DeckPanel session={session} deck="A" />
      <DeckPanel session={session} deck="B" />
      <div className="poc-deck-row">
        <NumberField
          label="Blend starts at A bar"
          value={points.exitBarA}
          step={1}
          digits={0}
          onCommit={(v) => session.setPoints({ ...points, exitBarA: Math.round(v) })}
        />
        <NumberField
          label="with B from bar"
          value={points.entryBarB}
          step={1}
          digits={0}
          onCommit={(v) => session.setPoints({ ...points, entryBarB: Math.round(v) })}
        />
        <span className="muted">
          B fades in over 8 bars, the bass swaps 16 bars in, and A is gone after 32.
        </span>
      </div>
      {session.errors.length > 0 && (
        <p className="poc-error" role="alert">
          Not applied: {session.errors.join('; ')}
        </p>
      )}
    </section>
  )
}
