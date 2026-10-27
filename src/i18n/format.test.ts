import { describe, expect, it } from 'vitest'
import { fill, pluralForm, translator } from './format'

describe('fill', () => {
  it('fills parameters and leaves unknown ones visible', () => {
    expect(fill('en', '{n} of {total}', { n: 2, total: 4 })).toBe('2 of 4')
    expect(fill('en', 'Bar {bar}', {})).toBe('Bar {bar}')
  })

  it('picks English plural forms', () => {
    expect(fill('en', '{n} {n|track|tracks}', { n: 1 })).toBe('1 track')
    expect(fill('en', '{n} {n|track|tracks}', { n: 0 })).toBe('0 tracks')
    expect(fill('en', '{n} {n|track|tracks}', { n: 3 })).toBe('3 tracks')
  })

  it('picks Russian plural forms', () => {
    const t = '{n} {n|трек|трека|треков}'
    expect(fill('ru', t, { n: 1 })).toBe('1 трек')
    expect(fill('ru', t, { n: 2 })).toBe('2 трека')
    expect(fill('ru', t, { n: 5 })).toBe('5 треков')
    expect(fill('ru', t, { n: 11 })).toBe('11 треков')
    expect(fill('ru', t, { n: 21 })).toBe('21 трек')
    expect(fill('ru', t, { n: 24 })).toBe('24 трека')
  })

  it('falls back to the last form when fewer are written', () => {
    expect(pluralForm('ru', 5, ['бар', 'бара'])).toBe('бара')
  })
})

describe('translator', () => {
  it('returns the key for a missing entry', () => {
    const t = translator('en', { 'a.b': 'Hello {name}' })
    expect(t('a.b', { name: 'Lena' })).toBe('Hello Lena')
    expect(t('a.c')).toBe('a.c')
  })
})
