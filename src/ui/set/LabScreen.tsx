import { PocPage } from '../../poc/PocPage'
import { LabWork } from './LabWork'
import type { SetStore } from './store'

// The Lab (#91): the Transition Builder from the proof of concept, with the two tracks
// of one transition and Auto's suggested blend start in place.

export function LabScreen({ store }: { store: SetStore }) {
  const lab = store.lab
  const plan = store.plan
  if (!lab || !plan) return null
  const to = store.profile(lab.to)
  return (
    <div className="set-lab">
      <div className="set-lab-bar">
        <button className="btn btn-small" onClick={() => store.go('set')}>
          ← Back to the set
        </button>
        <span>
          Transition {lab.index + 1} of {plan.order.length - 1}
          {to && ` · ${store.djName(to.owner)} brings it in`}
        </span>
        <span className="muted">
          Auto’s suggested blend start is in place. A grid you correct here goes back to the track.
        </span>
      </div>
      <LabWork store={store} />
      <PocPage session={store.audio} />
    </div>
  )
}
