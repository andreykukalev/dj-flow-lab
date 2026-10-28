import type { Translate } from '../../i18n'
import { readingName } from '../../engine/set/readings'
import { transitions, type SetPlan } from '../../engine/set/spine'
import type { TrackProfile } from '../../engine/set/profile'
import { DECIDED } from './status'
import type { LabOpen, Screen, TrackStatus } from './store'

// The journey bar: the five steps of planning a set, each with where it stands in one
// line, so the DJs see at a glance what is done, what is next and what is still locked.

export type StepId = Screen

export interface StepState {
  id: StepId
  /** The step can be opened. */
  enabled: boolean
  /** Where the step stands, in the DJs' language. */
  state: string
}

export interface JourneyInput {
  tracks: readonly { status: TrackStatus }[]
  profiles: readonly TrackProfile[]
  reading: { id: string; name: string } | null
  readings: number
  plan: SetPlan | null
  lab: LabOpen | null
}

export const STEP_IDS: readonly StepId[] = ['music', 'concepts', 'set', 'lab', 'perform']

export function journey(input: JourneyInput, t: Translate): StepState[] {
  const { tracks, profiles, reading, plan, lab } = input
  const count = (...statuses: TrackStatus[]) =>
    tracks.filter((x) => statuses.includes(x.status)).length
  const analysing = count('waiting', 'analysing')
  const missing = count('missing')
  const music =
    tracks.length === 0
      ? t('state.music.empty')
      : analysing > 0
        ? t('state.music.analysing', { n: analysing })
        : missing > 0
          ? t('state.music.missing', { n: missing })
          : t('state.music.ready', { n: count('ready') })

  const canExplore = profiles.length >= 2
  const concepts = !canExplore
    ? t('state.concepts.locked')
    : reading
      ? t('state.concepts.chosen', { name: readingName(reading, t) })
      : t('state.concepts.open', { n: input.readings })

  const steps = plan ? transitions(plan, profiles) : []
  const set = plan
    ? t('state.set.open', { tracks: plan.order.length, transitions: steps.length })
    : t('state.set.locked')

  const labState = lab
    ? t('state.lab.open', { n: lab.index + 1, total: steps.length })
    : steps.length > 0
      ? t('state.lab.tried', {
          tried: steps.filter((s) => s.status !== 'not tried').length,
          total: steps.length,
        })
      : t('state.lab.locked')

  const withoutVersion = plan
    ? steps.filter((s) => (plan.work[s.key]?.versions.length ?? 0) === 0).length
    : 0
  const perform = !plan
    ? t('state.perform.locked')
    : withoutVersion > 0
      ? t('state.perform.missing', { n: withoutVersion })
      : t('state.perform.open', {
          agreed: steps.filter((s) => DECIDED.includes(s.status)).length,
          total: steps.length,
        })

  return [
    { id: 'music', enabled: true, state: music },
    { id: 'concepts', enabled: canExplore, state: concepts },
    { id: 'set', enabled: plan !== null, state: set },
    { id: 'lab', enabled: steps.length > 0, state: labState },
    { id: 'perform', enabled: plan !== null, state: perform },
  ]
}
