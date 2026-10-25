import { useState } from 'react'
import { nudgeBpm, nudgeGrid, setBpm, setDownbeatAt, twoPointGrid } from '../engine/grid'
import type { BeatGrid, DeckId } from '../engine/model'
import { formatBarBeat, parseBarBeat, toBarBeat } from '../engine/time'
import { AutoPanel } from './AutoPanel'
import { decodeFile, type PocSession } from './session'

// Track and grid controls of the proof of concept (#46): load a local file on each
// deck, then type or nudge its BPM and "the 1" (±1 ms, ±0.01 BPM, two-point BPM), and
// choose the blend start in A, the bar of B lined up with it and the transition area
// around it (#75). Changes apply while playing. The same blend start and area are set
// from the whole-track view; these fields always show the session's values.

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

/** A `bar.beat` position, typed exactly. */
function PositionField({
  label,
  grid,
  beat,
  onCommit,
}: {
  label: string
  grid: BeatGrid
  beat: number
  onCommit: (trackBeat: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    const value = parseBarBeat(grid, draft)
    setDraft(null)
    if (value !== null) onCommit(value)
  }
  return (
    <label className="poc-field">
      {label}
      <input
        className="poc-input"
        inputMode="decimal"
        value={draft ?? formatBarBeat(toBarBeat(grid, beat))}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        title="Bar, or bar.beat for a beat inside the bar"
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

/** "16 bars", "1 bar 2 beats", for the area that fits. */
function beatsText(beats: number): string {
  const bars = Math.floor(beats / 4)
  const rest = beats - bars * 4
  const parts = [
    bars > 0 || rest === 0 ? `${bars} bar${bars === 1 ? '' : 's'}` : '',
    rest > 0 ? `${rest} beat${rest === 1 ? '' : 's'}` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

function BlendControls({ session }: { session: PocSession }) {
  const { area, fitted, decks } = session
  const gridA = decks.A.grid
  const gridB = decks.B.grid
  const startA = session.blendStartBeat
  const entryB = session.markBeat('B')
  const at = (grid: BeatGrid, beat: number) => formatBarBeat(toBarBeat(grid, beat))
  const fromA = at(gridA, startA - fitted.beforeBeats)
  const toA = at(gridA, startA + fitted.afterBeats)
  const handoff = session.plan.annotations.find((a) => a.id === 'bass-swap')?.atBeat ?? 0
  const swapA = at(gridA, startA + handoff)
  const fromB = at(gridB, entryB - fitted.beforeBeats)
  const toB = at(gridB, entryB + fitted.afterBeats)
  const setBars = (edge: 'before' | 'after' | 'both', v: number) => {
    const value = Math.max(0, Math.round(v))
    session.setArea(
      edge === 'both'
        ? { ...area, beforeBars: value, afterBars: value }
        : { ...area, [edge === 'before' ? 'beforeBars' : 'afterBars']: value },
    )
  }
  return (
    <>
      <div className="poc-deck-row" data-testid="blend-controls">
        <PositionField
          label="Blend start at A"
          grid={gridA}
          beat={startA}
          onCommit={(beat) => session.setBlendStart(beat)}
        />
        <button
          className="btn btn-small"
          onClick={() => session.setBlendStartAtCursor()}
          title="Put the blend start where the playback cursor is (B)"
        >
          Blend start at cursor
        </button>
        <PositionField
          label="lined up with B at"
          grid={gridB}
          beat={entryB}
          onCommit={(beat) => session.setMark('B', beat)}
        />
      </div>
      <div className="poc-deck-row">
        <span className="muted">Transition area</span>
        {area.linked ? (
          <NumberField
            label="±"
            value={area.beforeBars}
            step={1}
            digits={0}
            onCommit={(v) => setBars('both', v)}
          />
        ) : (
          <>
            <NumberField
              label="before"
              value={area.beforeBars}
              step={1}
              digits={0}
              onCommit={(v) => setBars('before', v)}
            />
            <NumberField
              label="after"
              value={area.afterBars}
              step={1}
              digits={0}
              onCommit={(v) => setBars('after', v)}
            />
          </>
        )}
        <span className="muted">bars</span>
        <label className="poc-field">
          <input
            type="checkbox"
            checked={area.linked}
            onChange={(e) =>
              session.setArea({
                ...area,
                linked: e.target.checked,
                afterBars: e.target.checked ? area.beforeBars : area.afterBars,
              })
            }
          />
          Same before and after
        </label>
      </div>
      <p className="poc-blend-summary" data-testid="blend-summary">
        From A {fromA} to A {toA}, A blends with B from {fromB} to {toB}. B comes in over{' '}
        {beatsText(handoff + fitted.beforeBeats)}, the bass swaps at A {swapA}
        {handoff === 0 ? ' (the blend start)' : ''}, and A is gone at A {toA}.
        {fitted.trimmed.length > 0 && (
          <span className="poc-trimmed"> {fitted.trimmed.join(' ')}</span>
        )}
      </p>
    </>
  )
}

export function Tracks({ session }: { session: PocSession }) {
  return (
    <section className="card poc-tracks" aria-label="Tracks and grids">
      <DeckPanel session={session} deck="A" />
      <DeckPanel session={session} deck="B" />
      <BlendControls session={session} />
      <AutoPanel session={session} />
      {session.errors.length > 0 && (
        <p className="poc-error" role="alert">
          Not applied: {session.errors.join('; ')}
        </p>
      )}
    </section>
  )
}
