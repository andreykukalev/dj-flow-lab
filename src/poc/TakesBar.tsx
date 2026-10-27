import type { ControlKey } from '../engine/mixer'
import type { Translate } from '../i18n'
import { useT } from '../i18n/react'
import type { PocSession } from './session'

// Your take (#68): what the user changed by grabbing controls while it played, which
// version plays, and Undo, Redo and Reset (brief v0.4 §5b: nothing is irreversible).

/** "A high EQ", "crossfader": a control's name in the DJs' language. */
export function controlName(key: ControlKey, t: Translate): string {
  if (key === 'mixer.crossfader') return t('poc.ctl.crossfader')
  const [deck, control] = key.split('.') as [string, string]
  return `${deck} ${t(`poc.ctl.${control}`)}`
}

function summary(session: PocSession, t: Translate): string {
  const { takes } = session.history
  if (takes.length === 0) return t('poc.takes.empty')
  const controls = [...new Set(takes.map((x) => controlName(x.control, t)))]
  return t('poc.takes.summary', { n: takes.length, controls: controls.join(', ') })
}

export function TakesBar({ session, hint }: { session: PocSession; hint: string | null }) {
  const t = useT()
  const { history, listening } = session
  const hasTakes = history.takes.length > 0
  return (
    <section className="card poc-takes" aria-label={t('poc.yourTake')}>
      <div className="poc-takes-text">
        <strong>{t('poc.yourTake')}</strong>
        <span
          className={hint ? 'poc-hint' : 'muted'}
          data-testid="takes-summary"
          aria-live="polite"
        >
          {hint ?? summary(session, t)}
        </span>
      </div>
      <div className="poc-segmented" role="group" aria-label={t('poc.listenTo')}>
        <button
          className="btn btn-small"
          aria-pressed={listening === 'original' || !hasTakes}
          onClick={() => session.listenTo('original')}
          disabled={!hasTakes}
        >
          {t('poc.original')}
        </button>
        <button
          className="btn btn-small"
          aria-pressed={listening === 'take' && hasTakes}
          onClick={() => session.listenTo('take')}
          disabled={!hasTakes}
        >
          {t('poc.yourTake')}
        </button>
      </div>
      <div className="poc-takes-actions">
        <button
          className="btn btn-small"
          onClick={() => session.undo()}
          disabled={!history.canUndo}
          title={t('poc.undoHint')}
        >
          {t('poc.undo')}
        </button>
        <button
          className="btn btn-small"
          onClick={() => session.redo()}
          disabled={!history.canRedo}
          title={t('poc.redoHint')}
        >
          {t('poc.redo')}
        </button>
        <button
          className="btn btn-small"
          onClick={() => session.reset()}
          disabled={!hasTakes}
          title={t('poc.resetHint')}
        >
          {t('poc.reset')}
        </button>
      </div>
    </section>
  )
}
