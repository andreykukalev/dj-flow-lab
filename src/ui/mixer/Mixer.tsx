import { useCallback } from 'react'
import type { ControlKey, DeckControl } from '../../engine/mixer'
import type { DeckId } from '../../engine/model'
import { CROSSFADER_CAP, CROSSFADER_WIDTH, FADER_LENGTH, KNOB_SIZE, KNOB_TRACK } from './geometry'
import { MixerRenderer } from './renderer'
import './mixer.css'

// The Try screen's virtual mixer (mockup iPad 4): two strips with high, trim, mid,
// filter and low knobs and a fader, and the crossfader between them. React renders
// the structure once; a MixerRenderer moves it every frame.

const KNOBS: { control: DeckControl; label: string; name: string }[] = [
  { control: 'eqHigh', label: 'High', name: 'high EQ' },
  { control: 'trim', label: 'Trim', name: 'trim' },
  { control: 'eqMid', label: 'Mid', name: 'mid EQ' },
  { control: 'filter', label: 'Filter', name: 'filter' },
  { control: 'eqLow', label: 'Low', name: 'low EQ' },
]

function Knob({ control, label, name }: { control: ControlKey; label: string; name: string }) {
  const c = KNOB_SIZE / 2
  return (
    <div className="knob" data-control={control} data-kind="knob">
      <svg
        width={KNOB_SIZE}
        height={KNOB_SIZE}
        viewBox={`0 0 ${KNOB_SIZE} ${KNOB_SIZE}`}
        role="img"
        aria-label={`Deck ${control[0]} ${name}`}
      >
        <circle className="knob-ring" cx={c} cy={c} r={22.5} />
        <circle className="knob-body" cx={c} cy={c} r={14} />
        <path className="knob-track" d={KNOB_TRACK} />
        <path className="knob-arc" data-part="arc" />
        <path className="knob-pointer" data-part="pointer" />
        <path className="knob-tick" data-part="tick" />
      </svg>
      <span className="control-label">{label}</span>
      <span className="control-caption" data-part="caption" />
    </div>
  )
}

function Fader({ deck }: { deck: DeckId }) {
  return (
    <div className="fader" data-control={`${deck}.fader`} data-kind="fader">
      <div
        className="fader-track"
        style={{ height: FADER_LENGTH }}
        role="img"
        aria-label={`Deck ${deck} fader`}
      >
        <div className="fader-fill" data-part="fill" />
        <div className="fader-cap" data-part="cap" />
      </div>
      <span className="control-label">Fader</span>
      <span className="control-caption" data-part="caption" />
    </div>
  )
}

function Strip({ deck }: { deck: DeckId }) {
  return (
    <div className="mixer-strip" data-deck={deck}>
      <div className="mixer-knobs">
        <div className="mixer-deck-label">Deck {deck}</div>
        <div className="mixer-knob-grid">
          {KNOBS.map((k) => (
            <Knob key={k.control} control={`${deck}.${k.control}`} label={k.label} name={k.name} />
          ))}
        </div>
      </div>
      <Fader deck={deck} />
    </div>
  )
}

export interface MixerProps {
  /** Called with the renderer once the mixer is in the DOM, and with null when it leaves. */
  onRenderer: (renderer: MixerRenderer | null) => void
  /** A line above the crossfader, such as what the crossfader does in this plan. */
  note?: string
}

export function Mixer({ onRenderer, note }: MixerProps) {
  const ref = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return
      onRenderer(new MixerRenderer(el))
      return () => onRenderer(null)
    },
    [onRenderer],
  )
  return (
    <section className="card mixer" aria-label="Virtual mixer" ref={ref}>
      <Strip deck="A" />
      <div className="mixer-divider" />
      <div className="mixer-centre">
        {note && <p className="mixer-note">{note}</p>}
        <div
          className="crossfader"
          data-control="mixer.crossfader"
          data-kind="crossfader"
          role="img"
          aria-label="Crossfader"
        >
          <div className="crossfader-track" style={{ width: CROSSFADER_WIDTH }}>
            <div className="crossfader-cap" data-part="cap" style={{ width: CROSSFADER_CAP }} />
          </div>
          <div className="control-label crossfader-label">
            <span className="deck-a">A</span>Crossfader<span className="deck-b">B</span>
          </div>
          <span className="control-caption" data-part="caption" />
        </div>
      </div>
      <div className="mixer-divider" />
      <Strip deck="B" />
    </section>
  )
}
