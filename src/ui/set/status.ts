import type { TransitionStatus } from '../../engine/set/spine'

// The status of a transition stays as data in the saved set; the screens show it through
// the dictionary with these keys.

export const STATUS_KEY: Record<TransitionStatus, string> = {
  'not tried': 'status.notTried',
  tried: 'status.tried',
  'versions to choose between': 'status.versions',
  'agreed by both': 'status.agreed',
}
