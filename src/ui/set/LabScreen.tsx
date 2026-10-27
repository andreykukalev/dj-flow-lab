import { PocPage } from '../../poc/PocPage'
import { useT } from '../../i18n/react'
import { LabWork } from './LabWork'
import type { SetStore } from './store'

// The Lab (#91): the Transition Builder from the proof of concept, with the two tracks
// of one transition and Auto's suggested blend start in place.

export function LabScreen({ store }: { store: SetStore }) {
  const t = useT()
  const lab = store.lab
  const plan = store.plan
  if (!lab || !plan) return null
  const to = store.profile(lab.to)
  return (
    <div className="set-lab">
      <div className="set-lab-bar">
        <button className="btn btn-small" onClick={() => store.go('set')}>
          {t('lab.back')}
        </button>
        <span>
          {t('lab.transition', { n: lab.index + 1, total: plan.order.length - 1 })}
          {to && ` · ${t('set.bringsIn', { name: store.djName(to.owner) })}`}
        </span>
        <span className="muted">{t('lab.autoNote')}</span>
      </div>
      <LabWork store={store} />
      <PocPage session={store.audio} />
    </div>
  )
}
