import { createContext, useContext, type ReactNode } from 'react'
import { english, type Lang, type Translate } from './index'

// The language for React: components call `useT()`; without a provider (the /poc/ page)
// they get English, so the proof of concept keeps its copy.

const LangContext = createContext<{ lang: Lang; t: Translate }>({ lang: 'en', t: english })

export function LangProvider({
  lang,
  t,
  children,
}: {
  lang: Lang
  t: Translate
  children: ReactNode
}) {
  return <LangContext.Provider value={{ lang, t }}>{children}</LangContext.Provider>
}

export const useT = (): Translate => useContext(LangContext).t

export const useLang = (): Lang => useContext(LangContext).lang
