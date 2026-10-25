import { useState } from 'react'
import { shape, type TrackProfile } from '../../engine/set/profile'
import type { SetStore } from './store'

// Small pieces shared by the set planning screens.

/** The level of a track bar by bar, relative to its own loudest bars. */
export function Shape({ profile, points = 48 }: { profile: TrackProfile; points?: number }) {
  const values = shape(profile, points)
  const w = 2 * points
  return (
    <svg
      className="set-shape"
      viewBox={`0 0 ${w} 20`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Shape of ${profile.name}: level per bar`}
    >
      {values.map((v, k) => (
        <rect key={k} x={2 * k} y={20 - 1 - 18 * v} width={1.5} height={1 + 18 * v} />
      ))}
    </svg>
  )
}

/** What the analysis does not hear yet, said where it matters. */
export function NotMeasured() {
  return (
    <p className="set-not-measured" role="note">
      <strong>Not measured yet: vocals, melody and key.</strong> Everything here rests on tempo and,
      bar by bar, the level, low end and highs within each track. A key is only what you type.
    </p>
  )
}

export function Layer({ layer }: { layer: 'measured' | 'likely' | 'interpretation' | 'yours' }) {
  const text = {
    measured: 'measured',
    likely: 'likely',
    interpretation: 'interpretation',
    yours: 'your choice',
  }[layer]
  return <span className={`chip set-layer set-layer-${layer}`}>{text}</span>
}

export function TrackLine({ store, id }: { store: SetStore; id: string }) {
  const p = store.profile(id)
  if (!p) return <span className="muted">a removed track</span>
  return (
    <span className="set-track-line">
      <span className={`set-owner set-owner-${p.owner}`}>{store.djName(p.owner)}</span> {p.name}
    </span>
  )
}

/** A text field that commits on Enter or when it loses focus. */
export function CommitField({
  label,
  value,
  onCommit,
  inputMode,
  placeholder,
  className,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
  inputMode?: 'decimal' | 'text'
  placeholder?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    setDraft(null)
    if (draft !== value) onCommit(draft)
  }
  return (
    <input
      className={`poc-input ${className ?? ''}`}
      aria-label={label}
      inputMode={inputMode}
      placeholder={placeholder}
      value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  )
}
