import { moments } from '../../engine/set/arc'
import type { SetPlan } from '../../engine/set/spine'
import { useT } from '../../i18n/react'
import { TrackLine } from './Bits'
import { HEAR_BARS, type SetStore } from './store'

// "Hear the idea" (#92): one moment of each track in the set's order, 8 bars each, with
// what the moment is there for.

export function HearIdea({
  store,
  id,
  plan,
}: {
  store: SetStore
  id: string
  plan: Pick<SetPlan, 'order' | 'roles'>
}) {
  const t = useT()
  const list = moments(plan, store.profiles, t)
  const key = `idea:${id}`
  const playing = store.isHearing(key)
  const at = playing ? store.hearing!.index : -1
  return (
    <div className="set-idea">
      <button
        className="btn btn-small"
        aria-pressed={playing}
        onClick={() => void store.hearIdea(id, list)}
        title={t('idea.hint', { n: HEAR_BARS })}
      >
        {playing ? t('idea.stop', { n: at + 1, total: list.length }) : t('idea.hear')}
      </button>
      <details>
        <summary className="muted">{t('idea.details')}</summary>
        <ol className="set-moments">
          {list.map((m, k) => (
            <li key={`${m.trackId}-${k}`} aria-current={k === at ? 'step' : undefined}>
              {m.role && <span className="chip set-function">{m.role}</span>}{' '}
              <TrackLine store={store} id={m.trackId} />
              <span className="muted"> · {t('idea.bar', { bar: m.bar, purpose: m.purpose })}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
