import { moments } from '../../engine/set/arc'
import type { SetPlan } from '../../engine/set/spine'
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
  const list = moments(plan, store.profiles)
  const key = `idea:${id}`
  const playing = store.isHearing(key)
  const at = playing ? store.hearing!.index : -1
  return (
    <div className="set-idea">
      <button
        className="btn btn-small"
        aria-pressed={playing}
        onClick={() => void store.hearIdea(id, list)}
        title={`${HEAR_BARS} bars of each track, in order`}
      >
        {playing ? `■ Stop the idea (${at + 1} of ${list.length})` : '▶ Hear the idea'}
      </button>
      <details>
        <summary className="muted">The idea, moment by moment</summary>
        <ol className="set-moments">
          {list.map((m, k) => (
            <li key={`${m.trackId}-${k}`} aria-current={k === at ? 'step' : undefined}>
              {m.role && <span className="chip set-function">{m.role}</span>}{' '}
              <TrackLine store={store} id={m.trackId} />
              <span className="muted">
                {' '}
                · bar {m.bar}: {m.purpose}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}
