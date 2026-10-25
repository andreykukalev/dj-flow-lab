import type { ControlKey } from '../engine/mixer'
import type { PocSession } from './session'

// Your take (#68): what the user changed by grabbing controls while it played, which
// version plays, and Undo, Redo and Reset (brief v0.4 §5b: nothing is irreversible).

const CONTROL_NAMES: Record<string, string> = {
  eqHigh: 'high EQ',
  trim: 'trim',
  eqMid: 'mid EQ',
  filter: 'filter',
  eqLow: 'low EQ',
  fader: 'fader',
}

function controlName(key: ControlKey): string {
  if (key === 'mixer.crossfader') return 'crossfader'
  const [deck, control] = key.split('.') as [string, string]
  return `${deck} ${CONTROL_NAMES[control] ?? control}`
}

function summary(session: PocSession): string {
  const { takes } = session.history
  if (takes.length === 0)
    return 'Grab any knob or fader while it plays. Your moves are recorded and play back from then on.'
  const controls = [...new Set(takes.map((t) => controlName(t.control)))]
  const moves = takes.length === 1 ? '1 move' : `${takes.length} moves`
  return `${moves} on ${controls.join(', ')}. Replay to hear it, or switch to Original to compare.`
}

export function TakesBar({ session, hint }: { session: PocSession; hint: string | null }) {
  const { history, listening } = session
  const hasTakes = history.takes.length > 0
  return (
    <section className="card poc-takes" aria-label="Your take">
      <div className="poc-takes-text">
        <strong>Your take</strong>
        <span
          className={hint ? 'poc-hint' : 'muted'}
          data-testid="takes-summary"
          aria-live="polite"
        >
          {hint ?? summary(session)}
        </span>
      </div>
      <div className="poc-segmented" role="group" aria-label="Listen to">
        <button
          className="btn btn-small"
          aria-pressed={listening === 'original' || !hasTakes}
          onClick={() => session.listenTo('original')}
          disabled={!hasTakes}
        >
          Original
        </button>
        <button
          className="btn btn-small"
          aria-pressed={listening === 'take' && hasTakes}
          onClick={() => session.listenTo('take')}
          disabled={!hasTakes}
        >
          Your take
        </button>
      </div>
      <div className="poc-takes-actions">
        <button
          className="btn btn-small"
          onClick={() => session.undo()}
          disabled={!history.canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="btn btn-small"
          onClick={() => session.redo()}
          disabled={!history.canRedo}
          title="Redo (Shift+Ctrl+Z)"
        >
          Redo
        </button>
        <button
          className="btn btn-small"
          onClick={() => session.reset()}
          disabled={!hasTakes}
          title="Back to the app's plan. Undo brings your moves back."
        >
          Reset
        </button>
      </div>
    </section>
  )
}
