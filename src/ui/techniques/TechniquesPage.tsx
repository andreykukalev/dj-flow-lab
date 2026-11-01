import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DeckControl } from '../../engine/mixer'
import type { DeckId } from '../../engine/model'
import type { Translate } from '../../i18n'
import { useT } from '../../i18n/react'
import { deckPosition, type PocSession } from '../../poc/session'
import { TakesBar } from '../../poc/TakesBar'
import { Timeline } from '../../poc/Timeline'
import { PHRASE, sign, useTransport } from '../../poc/useTransport'
import { Mixer } from '../mixer/Mixer'
import { LEVELS, techniqueTools, TECHNIQUES, type Technique } from './catalog'
import type { TechniqueSchool } from './school'
import { LESSON_PAIRS, sectionsWithBars } from './tracks'
import '../../poc/poc.css'
import '../lab/lab.css'
import './techniques.css'

// Mixing techniques, the second part of the app: from the basics to the advanced, with
// faders, EQ and loops only. The list of techniques is on the left; the technique plays on
// whole lesson tracks with the Lab's mixing line and mixer, its steps light up in time
// with the music, and the reasons, the moments to use it and an exercise for the DJ's own
// controller and tracks follow. Any control can be taken over, as in the Lab.

/** The lanes a technique uses: no filter, which counts as an effect here. */
const LANES: readonly DeckControl[] = ['eqHigh', 'eqMid', 'eqLow', 'trim']

/**
 * The steps' numbers on the mixing line, as in the list of steps. Steps on the same beat
 * share one marker, so their numbers do not overlap.
 */
function stepMarkers(session: PocSession): { id: string; label: string }[] {
  const steps = [...session.plan.annotations].sort((a, b) => a.atBeat - b.atBeat)
  const markers: { id: string; label: string; beat: number }[] = []
  steps.forEach((s, k) => {
    const last = markers.at(-1)
    if (last && last.beat === s.atBeat) last.label += ` · ${k + 1}`
    else markers.push({ id: s.id, label: String(k + 1), beat: s.atBeat })
  })
  return markers
}

function List({ school }: { school: TechniqueSchool }) {
  const t = useT()
  return (
    <nav className="card tech-list" aria-label={t('tech.listTitle')}>
      <p className="tech-progress muted" data-testid="tech-progress">
        {t('tech.progress', { n: school.done.size, total: TECHNIQUES.length })}
      </p>
      {LEVELS.map((level) => (
        <div key={level} className="tech-level">
          <h3>{t(`tech.level.${level}`)}</h3>
          <ol>
            {TECHNIQUES.filter((x) => x.level === level).map((x) => {
              const current = x === school.technique
              return (
                <li key={x.id}>
                  <button
                    className={`tech-item ${current ? 'tech-item-on' : ''}`}
                    aria-current={current ? 'true' : undefined}
                    onClick={() => school.select(x.id)}
                  >
                    <span className="tech-item-n">{TECHNIQUES.indexOf(x) + 1}</span>
                    <span className="tech-item-name">{t(`tech.${x.id}.name`)}</span>
                    {school.done.has(x.id) && (
                      <span className="tech-item-done" aria-label={t('tech.done')}>
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </nav>
  )
}

/** Both lesson tracks as their sections, with the bars this technique plays. */
function Arrangement({ school, session }: { school: TechniqueSchool; session: PocSession }) {
  const t = useT()
  const { startBeat, endBeat } = session.compiled.span
  const row = (deck: DeckId) => {
    const track = LESSON_PAIRS[school.pair][deck]
    const sections = sectionsWithBars(track)
    const total = sections.at(-1)!.to
    const from = Math.max(1, deckPosition(session.timing, deck, startBeat).bar)
    const to = Math.min(total, deckPosition(session.timing, deck, endBeat - 1e-6).bar)
    const mark = Math.floor(session.markBeat(deck) / 4) + 1
    const pct = (bar: number) => `${(((bar - 1) / total) * 100).toFixed(2)}%`
    return (
      <div className={`tech-arr-row deck-${deck.toLowerCase()}`} key={deck}>
        <div className="tech-arr-label">
          <strong>{deck}</strong> <span>{track.name}</span>
          <span className="muted">{track.grid.bpm} BPM</span>
        </div>
        <div className="tech-arr-track">
          {sections.map((s) => (
            <div
              key={s.from}
              className={`tech-arr-section tech-term-${s.term.toLowerCase()}`}
              style={{ left: pct(s.from), width: `${(s.bars / total) * 100}%` }}
              title={`${s.term} · ${s.from}–${s.to} · ${s.parts.map((p) => t(`tech.part.${p}`)).join(', ')}`}
            >
              <span className="tech-arr-term">{s.term}</span>
              <span className="tech-arr-parts">
                {s.parts.map((p) => t(`tech.part.${p}`)).join(' · ')}
              </span>
            </div>
          ))}
          <div
            className="tech-arr-used"
            style={{ left: pct(from), width: `${((to - from + 1) / total) * 100}%` }}
            aria-hidden="true"
          />
          <div className="tech-arr-mark" style={{ left: pct(mark) }} aria-hidden="true" />
        </div>
      </div>
    )
  }
  return (
    <section className="card tech-arr" aria-label={t('tech.pairTitle')}>
      <div className="tech-arr-head">
        <strong>{t('tech.pairTitle')}</strong>{' '}
        <span className="muted">{t(`tech.pair.${school.pair}`)}</span>
      </div>
      {row('A')}
      {row('B')}
      <p className="muted tech-arr-bands">{t('tech.bands')}</p>
    </section>
  )
}

/** The plan's steps with the bars they happen on; the one playing is lit. */
function Steps({
  school,
  session,
  onSeek,
}: {
  school: TechniqueSchool
  session: PocSession
  onSeek: (beat: number) => void
}) {
  const t = useT()
  const { plan } = session
  const steps = [...plan.annotations].sort((a, b) => a.atBeat - b.atBeat)
  const [active, setActive] = useState(-1)
  useEffect(() => {
    const starts = [...plan.annotations].map((a) => a.atBeat).sort((a, b) => a - b)
    return session.loop.onFrame(({ beat }) => {
      const index = starts.filter((at) => beat >= at - 0.01).length - 1
      setActive((prev) => (prev === index ? prev : index))
    })
  }, [session, plan])
  if (school.mode === 'without' || steps.length === 0)
    return (
      <section className="card tech-steps tech-without" aria-label={t('tech.stepsTitle')}>
        <h3>{t(`tech.${school.technique.id}.without`)}</h3>
        <p>{t(`tech.${school.technique.id}.withoutHear`)}</p>
        <p className="muted">{t('tech.withoutHint')}</p>
      </section>
    )
  const bars = (beat: number) => {
    const a = deckPosition(session.timing, 'A', beat).bar
    const b = deckPosition(session.timing, 'B', beat).bar
    return t('tech.stepAt', { a, b: b >= 1 ? b : '–' })
  }
  return (
    <section className="card tech-steps" aria-label={t('tech.stepsTitle')}>
      <h3>{t('tech.stepsTitle')}</h3>
      <p className="muted">{t('tech.stepsLead')}</p>
      <ol>
        {steps.map((s, k) => (
          <li key={s.id}>
            <button
              className={`tech-step ${k === active ? 'tech-step-on' : ''}`}
              aria-current={k === active ? 'step' : undefined}
              onClick={() => onSeek(s.atBeat - 8)}
              data-testid="tech-step"
            >
              <span className="tech-step-n">{k + 1}</span>
              <span className="tech-step-text">
                <strong>{t(s.titleKey, s.vars)}</strong>
                <span>{t(s.bodyKey, s.vars)}</span>
              </span>
              <span className="tech-step-at">{bars(s.atBeat)}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Explain({ technique, t }: { technique: Technique; t: Translate }) {
  const block = (field: string, title: string) => (
    <div className="tech-block">
      <h4>{t(title)}</h4>
      <p>{t(`tech.${technique.id}.${field}`)}</p>
    </div>
  )
  return (
    <section className="tech-explain">
      {block('floor', 'tech.floorTitle')}
      {block('why', 'tech.whyTitle')}
      {block('when', 'tech.whenTitle')}
      {block('whenNot', 'tech.whenNotTitle')}
    </section>
  )
}

export function TechniquesPage({ school }: { school: TechniqueSchool }) {
  const t = useT()
  useSyncExternalStore(school.subscribe, () => school.version)
  const { session, technique } = school
  const version = useSyncExternalStore(session.subscribe, () => session.version)
  const tr = useTransport(session, t)
  const { state } = tr
  const { position, decks, output } = tr.targets
  const { tempoChange } = session
  const index = TECHNIQUES.indexOf(technique)
  const inLevel = TECHNIQUES.filter((x) => x.level === technique.level)
  const tools = techniqueTools(technique)
  const markers = stepMarkers(session)
  const done = school.done.has(technique.id)

  return (
    <div className="tech lab" data-testid="techniques">
      <header className="tech-intro">
        <h2>{t('tech.title')}</h2>
        <p className="muted">{t('tech.lead')}</p>
      </header>

      <div className="tech-layout">
        <List school={school} />

        <div className="tech-main">
          <section className="card tech-head" aria-labelledby="tech-name">
            <div className="tech-head-top">
              <span className="muted">
                {t('tech.position', {
                  level: t(`tech.level.${technique.level}`),
                  n: inLevel.indexOf(technique) + 1,
                  total: inLevel.length,
                })}
              </span>
              <div className="lab-strip-nav">
                <button
                  className="btn btn-small"
                  onClick={() => school.select(TECHNIQUES[index - 1]!.id)}
                  disabled={index === 0}
                  aria-label={t('tech.prev')}
                  title={t('tech.prev')}
                >
                  ‹
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => school.select(TECHNIQUES[index + 1]!.id)}
                  disabled={index === TECHNIQUES.length - 1}
                  aria-label={t('tech.next')}
                  title={t('tech.next')}
                >
                  ›
                </button>
              </div>
            </div>
            <h2 id="tech-name">{t(`tech.${technique.id}.name`)}</h2>
            <div className="tech-tools">
              {tools.map((tool) => (
                <span key={tool} className={`chip tech-tool tech-tool-${tool}`}>
                  {t(`tech.tool.${tool}`)}
                </span>
              ))}
            </div>
            <p className="tech-summary">{t(`tech.${technique.id}.summary`)}</p>
            {technique.compare && (
              <div className="tech-compare">
                <span className="muted">{t('tech.listenTo')}</span>
                <div className="poc-segmented" role="group" aria-label={t('tech.listenTo')}>
                  <button
                    className="btn btn-small"
                    aria-pressed={school.mode === 'with'}
                    onClick={() => school.setMode('with')}
                  >
                    {t('tech.with')}
                  </button>
                  <button
                    className="btn btn-small"
                    aria-pressed={school.mode === 'without'}
                    onClick={() => school.setMode('without')}
                    data-testid="tech-without"
                  >
                    {t(`tech.${technique.id}.without`)}
                  </button>
                </div>
              </div>
            )}
          </section>

          <Arrangement school={school} session={session} />

          <div className="lab-hero">
            <Timeline
              key={version}
              session={session}
              onSeek={tr.seek}
              markers={markers}
              controls={LANES}
            />
            <div className="lab-desk">
              <Mixer onRenderer={tr.onRenderer} note={t('tech.takeHint')} />
              <TakesBar session={session} hint={tr.hint} />
            </div>
          </div>

          <Steps school={school} session={session} onSeek={tr.seek} />

          <Explain technique={technique} t={t} />

          <section className="card tech-practice">
            <div className="tech-block">
              <h4>{t('tech.tracksTitle')}</h4>
              <p>{t(`tech.${technique.id}.tracks`)}</p>
            </div>
            <div className="tech-block">
              <h4>{t('tech.practiceTitle')}</h4>
              <p>{t(`tech.${technique.id}.practice`)}</p>
            </div>
            <label className="tech-done" title={t('tech.doneHint')}>
              <input
                type="checkbox"
                checked={done}
                onChange={() => school.toggleDone(technique.id)}
                data-testid="tech-done"
              />
              {t('tech.done')}
              <span className="muted">{t('tech.doneHint')}</span>
            </label>
          </section>
        </div>
      </div>

      <footer className="poc-transport lab-transport" aria-label={t('poc.transport')}>
        <div className="poc-buttons">
          <button className="btn" onClick={() => void tr.replay()} aria-label={t('poc.replay')}>
            ⟲
          </button>
          <button className="btn" onClick={() => tr.step(-PHRASE)} aria-label={t('poc.phraseBack')}>
            ⏪
          </button>
          <button
            className="btn btn-primary btn-play"
            onClick={() => void tr.playPause()}
            aria-label={t(state.kind === 'playing' ? 'poc.pause' : 'poc.play')}
            data-testid="play"
          >
            {state.kind === 'playing' ? '❚❚' : '▶'}
          </button>
          <button
            className="btn"
            onClick={() => tr.step(PHRASE)}
            aria-label={t('poc.phraseForward')}
          >
            ⏩
          </button>
        </div>
        <div className="poc-position">
          <span className="poc-bar" ref={position} data-testid="position" />
          <span className="poc-decks" ref={decks} />
          <span className="muted" data-testid="transport-state">
            {t(`poc.state.${state.kind}`)}
          </span>
        </div>
        <details className="lab-sync">
          <summary className="btn btn-small">{t('lab.sync')}</summary>
          <div className="poc-output lab-sync-body">
            <span className="chip">
              B {sign(tempoChange.percent)} % · {sign(tempoChange.semitones)} st
            </span>
            <span className="chip" ref={output} data-testid="output" />
            <label className="poc-field">
              {t('poc.offset')}
              <input
                type="number"
                step={5}
                min={-500}
                max={500}
                value={tr.calibrationMs}
                onChange={(e) => tr.setCalibrationMs(Number(e.target.value) || 0)}
                aria-label={t('poc.offsetAria')}
              />
              ms
            </label>
          </div>
        </details>
      </footer>
    </div>
  )
}
