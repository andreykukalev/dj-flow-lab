import { describe, expect, it } from 'vitest'
import { DICTIONARIES, detectLang, translatorFor } from './index'

const { en, ru } = DICTIONARIES

/** The parameters a template names, each once, plural forms stripped. */
const params = (template: string) =>
  [...new Set([...template.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]))].sort()

describe('dictionaries', () => {
  it('have the same keys', () => {
    const missingInRu = Object.keys(en).filter((k) => !(k in ru))
    const missingInEn = Object.keys(ru).filter((k) => !(k in en))
    expect(missingInRu).toEqual([])
    expect(missingInEn).toEqual([])
  })

  it('name the same parameters in both languages', () => {
    const differing = Object.keys(en).filter(
      (k) => JSON.stringify(params(en[k]!)) !== JSON.stringify(params(ru[k] ?? '')),
    )
    expect(differing).toEqual([])
  })

  it('have no empty entries', () => {
    for (const dict of [en, ru])
      for (const [k, v] of Object.entries(dict)) expect(v.trim(), k).not.toBe('')
  })

  it('write Russian plural forms in threes', () => {
    const short = Object.entries(ru).flatMap(([k, v]) =>
      [...v.matchAll(/\{\w+((?:\|[^{}|]*)+)\}/g)]
        .filter((m) => m[1]!.split('|').length - 1 < 3)
        .map(() => k),
    )
    expect(short).toEqual([])
  })
})

describe('translatorFor', () => {
  it('translates the same key in both languages', () => {
    expect(translatorFor('en')('step.music')).toBe('Your music')
    expect(translatorFor('ru')('step.music')).toBe('Ваша музыка')
  })
})

describe('detectLang', () => {
  it('prefers the saved choice, then a Russian browser, then English', () => {
    expect(detectLang('ru', 'en-US')).toBe('ru')
    expect(detectLang('en', 'ru-RU')).toBe('en')
    expect(detectLang(null, 'ru')).toBe('ru')
    expect(detectLang(null, 'de-DE')).toBe('en')
    expect(detectLang('fr', undefined)).toBe('en')
  })
})
