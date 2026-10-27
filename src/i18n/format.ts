// Translation without a library: flat dictionaries per language, `{name}` parameters, and
// plural forms written inline as `{name|one|few|many}` (Russian) or `{name|one|other}`
// (English), picked with Intl.PluralRules. The dictionaries hold whole sentences, never
// fragments to concatenate, so word order can differ between languages.

export type Lang = 'en' | 'ru'

export const LANGS: readonly Lang[] = ['en', 'ru']

export type Params = Record<string, string | number>

export type Translate = (key: string, params?: Params) => string

/** Which inline plural form a count takes, by the categories each language writes out. */
const FORMS: Record<Lang, Record<Intl.LDMLPluralRule, number>> = {
  en: { zero: 1, one: 0, two: 1, few: 1, many: 1, other: 1 },
  ru: { zero: 2, one: 0, two: 1, few: 1, many: 2, other: 2 },
}

const rules: Partial<Record<Lang, Intl.PluralRules>> = {}

export function pluralForm(lang: Lang, n: number, forms: readonly string[]): string {
  rules[lang] ??= new Intl.PluralRules(lang)
  const index = Math.min(FORMS[lang][rules[lang].select(n)], forms.length - 1)
  return forms[index] ?? ''
}

/** Fills `{name}` and `{name|form|form…}` in a template. A missing parameter stays visible. */
export function fill(lang: Lang, template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)((?:\|[^{}|]*)*)\}/g, (whole, name: string, forms: string) => {
    const value = params[name]
    if (value === undefined) return whole
    if (!forms) return String(value)
    return pluralForm(lang, Number(value), forms.slice(1).split('|'))
  })
}

/** A translator over one dictionary; an unknown key comes back as the key, visibly. */
export function translator(lang: Lang, dictionary: Record<string, string>): Translate {
  return (key, params) => fill(lang, dictionary[key] ?? key, params)
}
