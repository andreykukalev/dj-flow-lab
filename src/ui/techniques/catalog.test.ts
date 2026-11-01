import { describe, expect, it } from 'vitest'
import { DICTIONARIES } from '../../i18n'
import type { DeckId } from '../../engine/model'
import { fitArea, type FittedArea } from '../../engine/plan/area'
import { areaContextFor, resolveLoop } from '../../engine/plan/loop'
import type { TransitionPlanV1 } from '../../engine/plan/types'
import { validate } from '../../engine/plan/validate'
import { secToBeat, transitionBeatToDeckBeat, type TransitionTiming } from '../../engine/time'
import {
  LEVELS,
  settingOf,
  techniquePlan,
  TECHNIQUES,
  toolsOf,
  type Mode,
  type Technique,
} from './catalog'
import { LESSON_PAIRS, renderLessonTrack, trackBars, trackSeconds } from './tracks'

/** The plan a technique plays, made the way the session makes it. */
function arrange(technique: Technique, mode: Mode) {
  const setting = settingOf(technique, mode)
  const tracks = LESSON_PAIRS[setting.pair]
  const grids = { A: tracks.A.grid, B: tracks.B.grid }
  const durationSec = { A: trackSeconds(tracks.A), B: trackSeconds(tracks.B) }
  const beats = {
    A: secToBeat(grids.A, durationSec.A),
    B: secToBeat(grids.B, durationSec.B),
  }
  const timing: TransitionTiming = { gridA: grids.A, gridB: grids.B, ...setting.points }
  if (setting.loop) {
    const deck: DeckId = setting.loop.deck
    const resolved = resolveLoop(setting.loop, {
      grid: grids[deck],
      entryBeat: transitionBeatToDeckBeat(timing, deck, 0),
      beats: beats[deck],
    })
    if ('error' in resolved) throw new Error(resolved.error)
    timing.loop = resolved.loop
  }
  const fitted: FittedArea = fitArea(setting.area, areaContextFor(timing, beats))
  const decks = {
    A: { trackFingerprint: tracks.A.name, grid: grids.A },
    B: { trackFingerprint: tracks.B.name, grid: grids.B },
  }
  const plan: TransitionPlanV1 = {
    ...techniquePlan(technique, mode, decks, setting.points, fitted),
    ...(timing.loop && { loop: timing.loop }),
  }
  return { plan, fitted, result: validate(plan, { durationSec }) }
}

const modes = (x: Technique): Mode[] => (x.compare ? ['with', 'without'] : ['with'])

describe('mixing techniques', () => {
  it('come in every level, with unique ids', () => {
    expect(new Set(TECHNIQUES.map((x) => x.id)).size).toBe(TECHNIQUES.length)
    for (const level of LEVELS) expect(TECHNIQUES.some((x) => x.level === level)).toBe(true)
  })

  for (const technique of TECHNIQUES)
    for (const mode of modes(technique))
      it(`${technique.id} (${mode}) plays on its lesson tracks`, () => {
        const { plan, fitted, result } = arrange(technique, mode)
        expect(result.errors).toEqual([])
        expect(fitted.tooShort).toBe(false)
        if (mode === 'with') {
          // With EQ, two basses never play together. A blend with the faders alone keeps
          // both lows open and relies on the tracks leaving room, which the plan cannot see.
          if (toolsOf(plan).includes('eq'))
            expect(result.warnings.map((w) => w.code)).not.toContain('bass-clash')
          expect(fitted.trimmed).toEqual([])
        }
        // No effects: faders, EQ and loops only.
        const controls = new Set(plan.events.map((e) => e.control.split('.')[1]))
        for (const c of controls) expect(['fader', 'eqLow', 'eqMid', 'eqHigh']).toContain(c)
      })

  it('let two basses clash without the bass swap, which is what it solves', () => {
    const swap = TECHNIQUES.find((x) => x.id === 'bassSwap')!
    expect(arrange(swap, 'without').result.warnings.map((w) => w.code)).toContain('bass-clash')
  })

  it('trim the blend without the loop, which is what the loop gives back', () => {
    for (const id of ['loopIntro', 'loopOutro']) {
      const technique = TECHNIQUES.find((x) => x.id === id)!
      expect(arrange(technique, 'with').plan.loop).toBeDefined()
      expect(arrange(technique, 'without').fitted.trimmed.length).toBeGreaterThan(0)
    }
  })

  it('name their tools from the plan', () => {
    const tools = (id: string) =>
      toolsOf(
        arrange(
          TECHNIQUES.find((x) => x.id === id)!,
          'with',
        ).plan,
      )
    expect(tools('phraseEntry')).toEqual(['faders'])
    expect(tools('bassSwap')).toEqual(['faders', 'eq'])
    expect(tools('loopBridge')).toEqual(['faders', 'eq', 'loop'])
  })

  it('have their words in both languages', () => {
    const fields = ['name', 'summary', 'floor', 'why', 'when', 'whenNot', 'tracks', 'practice']
    for (const dict of Object.values(DICTIONARIES))
      for (const technique of TECHNIQUES) {
        const keys = [
          ...fields.map((f) => `tech.${technique.id}.${f}`),
          ...(technique.compare
            ? [`tech.${technique.id}.without`, `tech.${technique.id}.withoutHear`]
            : []),
          ...arrange(technique, 'with').plan.annotations.flatMap((a) => [a.titleKey, a.bodyKey]),
        ]
        for (const key of keys) expect(dict[key], key).toBeTruthy()
      }
  })
})

describe('lesson tracks', () => {
  it('have whole phrases of sections and audio for every bar', () => {
    for (const pair of Object.values(LESSON_PAIRS))
      for (const track of Object.values(pair)) {
        expect(trackBars(track) % 4).toBe(0)
        const samples = renderLessonTrack(track, 8000)
        expect(samples.length).toBe(Math.ceil(trackSeconds(track) * 8000))
        expect(samples.some((v) => Math.abs(v) > 0.1)).toBe(true)
        expect(samples.every((v) => Number.isFinite(v) && Math.abs(v) < 1)).toBe(true)
      }
  })
})
