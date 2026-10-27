import { en } from './en'
import { ru } from './ru'
import { translator, type Lang, type Translate } from './format'

export * from './format'

// The two dictionaries and the translator over them. The engine takes a translator as an
// optional argument and falls back to English, so it stays pure and its tests stay as
// they are; the store passes the language the DJs chose.

export type Key = keyof typeof en

export const DICTIONARIES: Record<Lang, Record<string, string>> = { en, ru }

const cache: Partial<Record<Lang, Translate>> = {}

export function translatorFor(lang: Lang): Translate {
  return (cache[lang] ??= translator(lang, DICTIONARIES[lang]))
}

/** What the engine says when it is not told a language. */
export const english: Translate = translatorFor('en')

const STORAGE_KEY = 'dj-flow-lab.lang'

/** The saved language, else the browser's when it is Russian, else English. */
export function detectLang(saved: string | null | undefined, browser: string | undefined): Lang {
  if (saved === 'en' || saved === 'ru') return saved
  return browser?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export function loadLang(): Lang {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Private windows and blocked storage: fall through to the browser's language.
  }
  return detectLang(saved, typeof navigator === 'undefined' ? undefined : navigator.language)
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // The choice then lasts for this visit only.
  }
}
