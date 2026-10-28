import type { TrackProfile } from '../../engine/set/profile'
import type { SetPlan } from '../../engine/set/spine'
import type { TransitionWork, WorkStatus } from '../../engine/set/versions'
import type { Translate } from '../../i18n'

// The status of a transition stays as data in the saved set; the screens show it through
// the dictionary with these keys. "Suggested" names the DJ who saved the version.

export const STATUS_KEY: Record<WorkStatus, string> = {
  'not tried': 'status.notTried',
  tried: 'status.tried',
  suggested: 'status.suggested',
  'versions to choose between': 'status.versions',
  'agreed by both': 'status.agreed',
  'keep both': 'status.keepBoth',
}

export const DECIDED: readonly WorkStatus[] = ['agreed by both', 'keep both']

export function statusText(
  status: WorkStatus,
  work: TransitionWork | undefined,
  t: Translate,
  djName: (id: TrackProfile['owner']) => string,
): string {
  const author = work?.versions[0]?.author
  return t(STATUS_KEY[status], { name: author ? djName(author) : '' })
}

/** The tracks of the plan still waiting for their file on this device. */
export function missingTracks<T extends { id: string; status: string; fileName: string }>(
  plan: SetPlan,
  tracks: readonly T[],
): T[] {
  return tracks.filter((x) => plan.order.includes(x.id) && x.status === 'missing')
}
