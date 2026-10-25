import { useState } from 'react'
import {
  AUTO_LIMITS,
  LENGTH_BARS,
  type AutoEnergy,
  type AutoLength,
} from '../engine/analysis/autoPoint'
import type { PocSession } from './session'

// Auto (#77): one click puts a suggested blend start and area in place, cued at its
// pre-roll, with the reasons it rests on and what Auto cannot hear. Preferences are
// optional and folded away. The user's own choice is kept, so "Back to yours" and
// "Auto's idea" switch between the two to compare them; any edit after that is the
// user's, as with every other control.

const LENGTHS: { value: AutoLength | undefined; label: string }[] = [
  { value: undefined, label: 'Your area' },
  ...(['short', 'medium', 'long'] as const).map((value) => ({
    value,
    label: `${value[0]!.toUpperCase()}${value.slice(1)}, ${LENGTH_BARS[value]} bars`,
  })),
]

const ENERGIES: { value: AutoEnergy; label: string }[] = [
  { value: 'steady', label: 'Keep it steady' },
  { value: 'lift', label: 'Lift into B' },
]

export function AutoPanel({ session }: { session: PocSession }) {
  const { auto } = session
  const [length, setLength] = useState<AutoLength | undefined>(auto?.prefs.length)
  const [energy, setEnergy] = useState<AutoEnergy>(auto?.prefs.energy ?? 'steady')
  const idea = auto?.candidates[auto.index]
  const showing = session.autoShowing

  return (
    <div className="poc-auto" data-testid="auto">
      <div className="poc-deck-row">
        <button
          className="btn btn-small btn-primary"
          onClick={() => session.suggestBlend({ length, energy })}
          title="Find a blend start from both tracks' phrase lines, level and low end"
        >
          Auto
        </button>
        {auto && auto.candidates.length > 1 && (
          <button
            className="btn btn-small"
            onClick={() => session.showIdea((auto.index + 1) % auto.candidates.length)}
          >
            Next idea
          </button>
        )}
        {auto &&
          (showing ? (
            <button className="btn btn-small" onClick={() => session.backToYours()}>
              Back to yours
            </button>
          ) : (
            <button className="btn btn-small" onClick={() => session.showIdea(auto.index)}>
              Auto&apos;s idea
            </button>
          ))}
        <details className="poc-auto-prefs">
          <summary>Preferences</summary>
          <div className="poc-deck-row" role="radiogroup" aria-label="Length">
            <span className="muted">Length</span>
            {LENGTHS.map((o) => (
              <label key={o.label} className="poc-field">
                <input
                  type="radio"
                  name="auto-length"
                  checked={length === o.value}
                  onChange={() => setLength(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          <div className="poc-deck-row" role="radiogroup" aria-label="Energy">
            <span className="muted">Energy at the swap</span>
            {ENERGIES.map((o) => (
              <label key={o.value} className="poc-field">
                <input
                  type="radio"
                  name="auto-energy"
                  checked={energy === o.value}
                  onChange={() => setEnergy(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
          <p className="muted poc-auto-note">
            Not offered yet: a gradual bass handoff, and dramatic or contrasting transitions. The
            long blend always swaps the bass on the blend start and has no cuts or effects.
          </p>
        </details>
      </div>
      {auto && idea && (
        <div className="poc-auto-result" data-testid="auto-result">
          <p>
            <span className="chip chip-likely">suggestion</span>{' '}
            <strong>
              Idea {auto.index + 1} of {auto.candidates.length}: A bar {idea.exitBarA} with B bar{' '}
              {idea.entryBarB}, {areaText(idea.area)}
            </strong>
            {showing ? (
              <span className="muted"> · cued at its pre-roll, press play to hear it</span>
            ) : (
              <span className="muted">
                {' '}
                · now playing your version; &quot;Auto&apos;s idea&quot; brings this one back
              </span>
            )}
          </p>
          <ul className="poc-auto-why" aria-label="Why it may work">
            {idea.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {idea.cautions.length > 0 && (
            <ul className="poc-auto-cautions" aria-label="Listen for">
              {idea.cautions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <p className="muted poc-auto-note">{AUTO_LIMITS}</p>
        </div>
      )}
    </div>
  )
}

function areaText(area: { beforeBars: number; afterBars: number }): string {
  return `${area.beforeBars} bars before, ${area.afterBars} after`
}
