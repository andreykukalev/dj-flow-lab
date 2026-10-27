import { LabPage } from '../lab/LabPage'
import type { SetStore } from './store'

// The Lab (#91): the Transition Builder from the proof of concept, with the two tracks
// of one transition and Auto's suggested blend start in place. The page itself lives in
// ../lab; this keeps the screen's null checks in one place.

export function LabScreen({ store }: { store: SetStore }) {
  const lab = store.lab
  const plan = store.plan
  if (!lab || !plan) return null
  return <LabPage store={store} lab={lab} plan={plan} />
}
