import { useState } from 'react'
import { LENGTH_BARS, type AutoEnergy, type AutoLength } from '../engine/analysis/autoPoint'
import { useT } from '../i18n/react'
import type { PocSession } from './session'

// Auto (#77): one click puts a suggested blend start and area in place, cued at its
// pre-roll, with the reasons it rests on and what Auto cannot hear. Preferences are
// optional and folded away. The user's own choice is kept, so "Back to yours" and
// "Auto's idea" switch between the two to compare them; any edit after that is the
// user's, as with every other control.
//
// Where the idea's area had to be trimmed because a track runs out and a loop gives the
// bars back (#81), "With a loop" switches to that form of the same pairing, with what the
// loop changes. The straight form always comes first.

const LENGTHS: (AutoLength | undefined)[] = [undefined, 'short', 'medium', 'long']
const ENERGIES: AutoEnergy[] = ['steady', 'lift']

export function AutoPanel({ session }: { session: PocSession }) {
  const t = useT()
  const { auto } = session
  const [length, setLength] = useState<AutoLength | undefined>(auto?.prefs.length)
  const [energy, setEnergy] = useState<AutoEnergy>(auto?.prefs.energy ?? 'steady')
  const idea = auto?.candidates[auto.index]
  const showing = session.autoShowing
  const alt = idea?.alternative
  const looped = showing && auto?.withLoop && alt !== undefined
  const lengthLabel = (value: AutoLength | undefined) =>
    value ? t(`poc.len.${value}`, { bars: LENGTH_BARS[value] }) : t('poc.yourArea')

  return (
    <div className="poc-auto" data-testid="auto">
      <div className="poc-deck-row">
        <button
          className="btn btn-small btn-primary"
          onClick={() => session.suggestBlend({ length, energy })}
          title={t('poc.autoHint')}
        >
          {t('poc.auto')}
        </button>
        {auto && auto.candidates.length > 1 && (
          <button
            className="btn btn-small"
            onClick={() =>
              session.showIdea((auto.index + 1) % auto.candidates.length, auto.withLoop)
            }
          >
            {t('poc.nextIdea')}
          </button>
        )}
        {auto &&
          (showing ? (
            <button className="btn btn-small" onClick={() => session.backToYours()}>
              {t('poc.backToYours')}
            </button>
          ) : (
            <button
              className="btn btn-small"
              onClick={() => session.showIdea(auto.index, auto.withLoop)}
            >
              {t('poc.autosIdea')}
            </button>
          ))}
        <details className="poc-auto-prefs">
          <summary>{t('poc.prefs')}</summary>
          <div className="poc-deck-row" role="radiogroup" aria-label={t('poc.length')}>
            <span className="muted">{t('poc.length')}</span>
            {LENGTHS.map((value) => (
              <label key={value ?? 'yours'} className="poc-field">
                <input
                  type="radio"
                  name="auto-length"
                  checked={length === value}
                  onChange={() => setLength(value)}
                />
                {lengthLabel(value)}
              </label>
            ))}
          </div>
          <div className="poc-deck-row" role="radiogroup" aria-label={t('poc.energyAria')}>
            <span className="muted">{t('poc.energy')}</span>
            {ENERGIES.map((value) => (
              <label key={value} className="poc-field">
                <input
                  type="radio"
                  name="auto-energy"
                  checked={energy === value}
                  onChange={() => setEnergy(value)}
                />
                {t(`poc.energy.${value}`)}
              </label>
            ))}
          </div>
          <p className="muted poc-auto-note">{t('poc.autoNote')}</p>
        </details>
      </div>
      {auto && idea && (
        <div className="poc-auto-result" data-testid="auto-result">
          <p>
            <span className="chip chip-likely">{t('poc.suggestion')}</span>{' '}
            <strong>
              {t(looped ? 'poc.ideaWithLoop' : 'poc.idea', {
                n: auto.index + 1,
                total: auto.candidates.length,
                a: idea.exitBarA,
                b: idea.entryBarB,
                before: idea.area.beforeBars,
                after: idea.area.afterBars,
                deck: alt?.loop.deck ?? '',
              })}
            </strong>
            <span className="muted"> {t(showing ? 'poc.cued' : 'poc.nowYours')}</span>
          </p>
          {alt && (
            <div className="poc-deck-row" data-testid="auto-strategy">
              <div className="poc-segmented" role="group" aria-label={t('poc.transition')}>
                <button
                  className="btn btn-small"
                  aria-pressed={showing && !auto.withLoop}
                  onClick={() => session.showIdea(auto.index, false)}
                >
                  {t('poc.straight')}
                </button>
                <button
                  className="btn btn-small"
                  aria-pressed={looped}
                  onClick={() => session.showIdea(auto.index, true)}
                >
                  {t('poc.withLoop')}
                </button>
              </div>
              <span className="muted">
                {looped
                  ? t('poc.compareStraight')
                  : t('poc.trimmedLoop', {
                      deck: alt.loop.deck,
                      bars: Math.round(
                        (alt.fitted.beforeBeats +
                          alt.fitted.afterBeats -
                          idea.fitted.beforeBeats -
                          idea.fitted.afterBeats) /
                          4,
                      ),
                    })}
              </span>
            </div>
          )}
          <ul className="poc-auto-why" aria-label={t('poc.whyWork')}>
            {(looped
              ? // The straight form's bar ranges do not hold with the loop.
                [...alt.reasons, ...idea.reasons.filter((r) => r !== idea.blends)]
              : idea.reasons
            ).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {(looped ? alt.cautions : idea.cautions).length > 0 && (
            <ul className="poc-auto-cautions" aria-label={t('poc.listenFor')}>
              {(looped
                ? [
                    ...alt.cautions,
                    ...idea.cautions.filter((c) => !idea.fitted.trimmed.includes(c)),
                  ]
                : idea.cautions
              ).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          )}
          <p className="muted poc-auto-note">{t('auto.limits')}</p>
        </div>
      )}
    </div>
  )
}
