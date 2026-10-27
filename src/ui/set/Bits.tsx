import { useState } from 'react'
import { shape, type TrackProfile } from '../../engine/set/profile'
import { useT } from '../../i18n/react'
import type { SetStore } from './store'

// Small pieces shared by the set planning screens.

/** The level of a track bar by bar, relative to its own loudest bars. */
export function Shape({ profile, points = 48 }: { profile: TrackProfile; points?: number }) {
  const t = useT()
  const values = shape(profile, points)
  const w = 2 * points
  return (
    <svg
      className="set-shape"
      viewBox={`0 0 ${w} 20`}
      preserveAspectRatio="none"
      role="img"
      aria-label={t('music.shape', { name: profile.name })}
    >
      {values.map((v, k) => (
        <rect key={k} x={2 * k} y={20 - 1 - 18 * v} width={1.5} height={1 + 18 * v} />
      ))}
    </svg>
  )
}

/** What the analysis does not hear yet, said where it matters; `compact` is one line. */
export function NotMeasured({ compact = false }: { compact?: boolean }) {
  const t = useT()
  return (
    <p className={`set-not-measured ${compact ? 'set-not-measured-line' : ''}`} role="note">
      <strong>{t('music.notMeasured')}</strong> {t('music.notMeasuredRest')}
    </p>
  )
}

export type LayerId = 'measured' | 'likely' | 'interpretation' | 'yours'

export function Layer({ layer }: { layer: LayerId }) {
  const t = useT()
  return (
    <span className={`chip set-layer set-layer-${layer}`} title={t(`layer.${layer}.hint`)}>
      {t(`layer.${layer}`)}
    </span>
  )
}

export function TrackLine({ store, id }: { store: SetStore; id: string }) {
  const t = useT()
  const p = store.profile(id)
  if (!p) return <span className="muted">{t('concepts.removedTrack')}</span>
  return (
    <span className="set-track-line">
      <span className={`set-owner set-owner-${p.owner}`}>{store.djName(p.owner)}</span> {p.name}
    </span>
  )
}

/** A ✕ that asks once before it removes something that cannot be put back with one click. */
export function ConfirmButton({
  label,
  title,
  onConfirm,
}: {
  label: string
  title?: string
  onConfirm: () => void
}) {
  const t = useT()
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button
        className="btn btn-small set-icon"
        aria-label={label}
        title={title}
        onClick={() => setAsking(true)}
      >
        ✕
      </button>
    )
  return (
    <span className="set-confirm" role="group" aria-label={label}>
      <span>{t('confirm.question')}</span>
      <button className="btn btn-small" onClick={onConfirm}>
        {t('confirm.remove')}
      </button>
      <button className="btn btn-small" autoFocus onClick={() => setAsking(false)}>
        {t('confirm.keep')}
      </button>
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
