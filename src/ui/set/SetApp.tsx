import { useEffect, useState, useSyncExternalStore } from 'react'
import { LANGS, type Lang } from '../../i18n'
import { LangProvider, useT } from '../../i18n/react'
import { ConceptExplorer } from './ConceptExplorer'
import { journey, type StepId } from './journey'
import { LabScreen } from './LabScreen'
import { Perform } from './Perform'
import { keep } from './persist'
import { SetMenu } from './SetMenu'
import { SetSpine } from './SetSpine'
import { SetStore } from './store'
import { YourMusic } from './YourMusic'
import './set.css'

// Set planning together (#87): Your music → Concepts → the set → the Lab → Perform. The
// header holds who is at the screen, the language and the Set menu; the journey bar under
// it names the five steps with where each one stands.

const LANG_NAMES: Record<Lang, string> = { en: 'EN', ru: 'RU' }

function Journey({ store }: { store: SetStore }) {
  const t = useT()
  const { readings } = store.explored
  const steps = journey(
    {
      tracks: store.tracks,
      profiles: store.profiles,
      reading: store.reading,
      readings: readings.length,
      plan: store.plan,
      lab: store.lab,
    },
    t,
  )
  const open = (id: StepId) => {
    if (id === 'lab') {
      if (store.screen === 'lab') return
      store.go('set')
      void store.openLab(store.lastLab)
    } else store.go(id)
  }
  return (
    <nav className="set-journey" aria-label={t('app.steps')}>
      <ol>
        {steps.map((s, k) => {
          const current = store.screen === s.id
          return (
            <li key={s.id}>
              <button
                className={`set-step ${current ? 'set-step-on' : ''}`}
                aria-current={current ? 'step' : undefined}
                disabled={!s.enabled}
                title={s.enabled ? undefined : t('app.lockedStep', { reason: s.state })}
                onClick={() => open(s.id)}
              >
                <span className="set-step-n" aria-hidden="true">
                  {k + 1}
                </span>
                <span className="set-step-name">{t(`step.${s.id}`)}</span>
                <span className="set-step-state">{s.state}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function Header({ store }: { store: SetStore }) {
  const t = useT()
  return (
    <header className="set-header">
      <h1>{t('app.title')}</h1>
      <div className="set-header-tools">
        <div
          className="set-me"
          role="group"
          aria-label={t('app.whoAtScreen')}
          title={t('app.youAreHint')}
        >
          <span className="muted">{t('app.youAre')}</span>
          {(['dj1', 'dj2'] as const).map((dj) => (
            <button
              key={dj}
              className={`btn btn-small set-toggle set-owner-${dj} ${store.me === dj ? 'set-toggle-on' : ''}`}
              aria-pressed={store.me === dj}
              onClick={() => store.setMe(dj)}
            >
              {store.djName(dj)}
            </button>
          ))}
        </div>
        <div className="set-lang" role="group" aria-label={t('app.language')}>
          {LANGS.map((lang) => (
            <button
              key={lang}
              lang={lang}
              className={`btn btn-small set-toggle ${store.lang === lang ? 'set-toggle-on' : ''}`}
              aria-pressed={store.lang === lang}
              onClick={() => store.setLang(lang)}
            >
              {LANG_NAMES[lang]}
            </button>
          ))}
        </div>
        <SetMenu store={store} />
      </div>
    </header>
  )
}

function Notice({ store }: { store: SetStore }) {
  const t = useT()
  if (!store.notice) return null
  return (
    <p className="set-notice" role="alert">
      {store.notice}{' '}
      <button className="btn btn-small" onClick={() => store.say(null)}>
        {t('app.ok')}
      </button>
    </p>
  )
}

export function SetApp({ store: given }: { store?: SetStore }) {
  const [store] = useState(() => given ?? new SetStore())
  useSyncExternalStore(store.subscribe, () => store.version)
  useEffect(() => keep(store, (message) => store.say(message)), [store])
  useEffect(() => {
    document.documentElement.lang = store.lang
  }, [store.lang])
  return (
    <LangProvider lang={store.lang} t={store.t}>
      <div className="set-app" lang={store.lang} data-ready={store.ready ? 'true' : undefined}>
        <Header store={store} />
        <Journey store={store} />
        <Notice store={store} />
        {store.screen === 'music' && <YourMusic store={store} />}
        {store.screen === 'concepts' && <ConceptExplorer store={store} />}
        {store.screen === 'set' && <SetSpine store={store} />}
        {store.screen === 'perform' && <Perform store={store} />}
        {store.screen === 'lab' && <LabScreen store={store} />}
      </div>
    </LangProvider>
  )
}
