import { useState } from 'react'
import { nudgeBpm, nudgeGrid, setBpm, setDownbeatAt, twoPointGrid } from '../engine/grid'
import type { BeatGrid, DeckId } from '../engine/model'
import { formatBarBeat, parseBarBeat, toBarBeat, transitionBeatToDeckBeat } from '../engine/time'
import type { Translate } from '../i18n'
import { useT } from '../i18n/react'
import { AutoPanel } from './AutoPanel'
import { LoopPanel } from './LoopPanel'
import { decodeFile, type PocSession } from './session'

// Track and grid controls of the proof of concept (#46): load a local file on each
// deck, then type or nudge its BPM and "the 1" (±1 ms, ±0.01 BPM, two-point BPM), and
// choose the blend start in A, the bar of B lined up with it and the transition area
// around it (#75). Changes apply while playing. The same blend start and area are set
// from the whole-track view; these fields always show the session's values. When the area
// is trimmed because a track runs out, a loop that gives the bars back is offered (#81).
// The Lab composes the same pieces in its own layout.

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
  const t = useT()
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
        title={t('poc.positionHint')}
      />
    </label>
  )
}

export function DeckPanel({ session, deck }: { session: PocSession; deck: DeckId }) {
  const t = useT()
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
      setLoadError(
        t('poc.decodeError', {
          name: file.name,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
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
        <strong className={`deck-${deck.toLowerCase()}`}>{t('poc.deck', { deck })}</strong>
        <span className="poc-deck-name">{source.name}</span>
        <span className="muted">{source.buffer.duration.toFixed(1)} s</span>
        <label className="btn btn-small">
          {t(loading ? 'poc.decoding' : 'poc.chooseFile')}
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
          label={t('poc.bpm')}
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
          label={t('poc.theOneAt')}
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
        <span className="muted">{t('poc.twoDownbeats')}</span>
        <input
          className="poc-input"
          aria-label={t('poc.firstDownbeat', { deck })}
          value={points.first}
          onChange={(e) => setPointsDraft({ ...points, first: e.target.value })}
        />
        <input
          className="poc-input"
          aria-label={t('poc.secondDownbeat', { deck })}
          value={points.second}
          onChange={(e) => setPointsDraft({ ...points, second: e.target.value })}
        />
        <button className="btn btn-small" onClick={twoPoint}>
          {t('poc.setBpmTwo')}
        </button>
      </div>
      {loadError && <p className="poc-error">{loadError}</p>}
    </div>
  )
}

/** "16 bars", "1 bar 2 beats", for the area that fits. */
function beatsText(beats: number, t: Translate): string {
  const bars = Math.floor(beats / 4)
  const rest = beats - bars * 4
  const parts = [
    bars > 0 || rest === 0 ? t('poc.bars', { n: bars }) : '',
    rest > 0 ? t('poc.beats', { n: rest }) : '',
  ]
  return parts.filter(Boolean).join(' ')
}

export function BlendControls({ session }: { session: PocSession }) {
  const t = useT()
  const { area, fitted, decks, timing } = session
  const gridA = decks.A.grid
  const gridB = decks.B.grid
  const startA = session.blendStartBeat
  const entryB = session.markBeat('B')
  // Each deck's bars at a transition beat, through its loop when it has one.
  const at = (deck: 'A' | 'B', beat: number) =>
    formatBarBeat(
      toBarBeat(deck === 'A' ? gridA : gridB, transitionBeatToDeckBeat(timing, deck, beat)),
    )
  const fromA = at('A', -fitted.beforeBeats)
  const toA = at('A', fitted.afterBeats)
  const handoff = session.plan.annotations.find((a) => a.id === 'bass-swap')?.atBeat ?? 0
  const swapA = at('A', handoff)
  const fromB = at('B', -fitted.beforeBeats)
  const toB = at('B', fitted.afterBeats)
  const fill = session.loopRequest ? null : session.loopToFill
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
          label={t('poc.blendStartA')}
          grid={gridA}
          beat={startA}
          onCommit={(beat) => session.setBlendStart(beat)}
        />
        <button
          className="btn btn-small"
          onClick={() => session.setBlendStartAtCursor()}
          title={t('poc.blendStartCursorHint')}
        >
          {t('poc.blendStartCursor')}
        </button>
        <PositionField
          label={t('poc.linedUpB')}
          grid={gridB}
          beat={entryB}
          onCommit={(beat) => session.setMark('B', beat)}
        />
      </div>
      <div className="poc-deck-row">
        <span className="muted">{t('poc.area')}</span>
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
              label={t('poc.before')}
              value={area.beforeBars}
              step={1}
              digits={0}
              onCommit={(v) => setBars('before', v)}
            />
            <NumberField
              label={t('poc.after')}
              value={area.afterBars}
              step={1}
              digits={0}
              onCommit={(v) => setBars('after', v)}
            />
          </>
        )}
        <span className="muted">{t('poc.barsUnit')}</span>
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
          {t('poc.sameBeforeAfter')}
        </label>
      </div>
      <p className="poc-blend-summary" data-testid="blend-summary">
        {t(handoff === 0 ? 'poc.blendSummaryAtStart' : 'poc.blendSummary', {
          fromA,
          toA,
          fromB,
          toB,
          over: beatsText(handoff + fitted.beforeBeats, t),
          swapA,
        })}
        {fitted.trimmed.length > 0 && (
          <span className="poc-trimmed"> {fitted.trimmed.join(' ')}</span>
        )}
        {fill && (
          <>
            {' '}
            <button
              className="btn btn-small"
              onClick={() => session.setLoop(fill)}
              data-testid="fill-with-loop"
              title={t(fill.deck === 'B' ? 'poc.fillLoopHintB' : 'poc.fillLoopHintA', {
                bars: fill.bars,
                passes: fill.passes,
              })}
            >
              {t('poc.fillLoop')}
            </button>
          </>
        )}
      </p>
      <LoopPanel session={session} />
    </>
  )
}

/** The session's errors: what the last change could not apply. */
export function SessionErrors({ session }: { session: PocSession }) {
  const t = useT()
  if (session.errors.length === 0) return null
  return (
    <p className="poc-error" role="alert">
      {t('poc.notApplied', { errors: session.errors.join('; ') })}
    </p>
  )
}

export function Tracks({ session }: { session: PocSession }) {
  const t = useT()
  return (
    <section className="card poc-tracks" aria-label={t('poc.tracksAria')}>
      <DeckPanel session={session} deck="A" />
      <DeckPanel session={session} deck="B" />
      <BlendControls session={session} />
      <AutoPanel session={session} />
      <SessionErrors session={session} />
    </section>
  )
}
