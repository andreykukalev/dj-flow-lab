import { useEffect, useRef, useState } from 'react'
import { parseSet } from '../../engine/set/setFile'
import { useT } from '../../i18n/react'
import type { SetStore } from './store'

// The Set menu (#96): keep, pass, open and start a set, from the header on every screen,
// so the collection screen is only about the music.

export function SetMenu({ store }: { store: SetStore }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [sure, setSure] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const missing = store.tracks.filter((x) => x.status === 'missing').length
  const empty = store.tracks.length === 0

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  const close = () => {
    setOpen(false)
    setSure(false)
  }
  const pass = () => {
    const text = JSON.stringify(store.toSaved())
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    const names = t('keep.and', { a: store.djName('dj1'), b: store.djName('dj2') }).replace(
      /[^\p{L}\p{N} _-]+/gu,
      '',
    )
    a.download = `${t('keep.file', { names: names || t('keep.our') })}.djset.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    close()
  }
  const openFile = async (file: File | undefined) => {
    if (!file) return
    const set = parseSet(await file.text(), store.t)
    if ('error' in set) store.say(set.error)
    else {
      store.restore(set)
      store.say(null)
    }
    close()
  }

  return (
    <div className="set-menu" ref={root}>
      <button
        className="btn btn-small"
        aria-expanded={open}
        aria-controls="set-menu-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        {t('app.setMenu')} <span aria-hidden="true">▾</span>
      </button>
      {/* Always present, so a set file can be opened from anywhere. */}
      <input
        id="open-set"
        type="file"
        accept=".json,application/json"
        hidden
        data-testid="open-set"
        onChange={(e) => {
          void openFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {open && (
        <div id="set-menu-panel" className="card set-menu-panel" aria-label={t('keep.title')}>
          <strong>{t('keep.title')}</strong>
          <p className="muted">
            {t('keep.text')}
            {missing > 0 && ` ${t('keep.missing', { n: missing })}`}
          </p>
          <div className="set-menu-actions">
            <button className="btn btn-small" onClick={pass} disabled={empty}>
              {t('keep.pass')}
            </button>
            <label className="btn btn-small" htmlFor="open-set">
              {t('keep.open')}
            </label>
            {!sure ? (
              <button className="btn btn-small" onClick={() => setSure(true)} disabled={empty}>
                {t('keep.new')}
              </button>
            ) : (
              <span className="set-confirm" role="group" aria-label={t('keep.new')}>
                <span className="muted">{t('keep.newWarn')}</span>
                <button
                  className="btn btn-small"
                  onClick={() => {
                    store.clear()
                    close()
                  }}
                >
                  {t('keep.clear')}
                </button>
                <button className="btn btn-small" onClick={() => setSure(false)}>
                  {t('keep.keep')}
                </button>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
