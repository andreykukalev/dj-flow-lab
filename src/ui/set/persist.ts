import { parseSet, type SavedSet } from '../../engine/set/setFile'
import type { SetStore } from './store'

// Keeps the set in this browser between visits (#96, D-23, D-24): the set without its
// audio, in IndexedDB, saved a moment after each change. Files are selected again after
// a reload and matched by fingerprint.

const DB = 'dj-flow-lab'
const STORE = 'sets'
const KEY = 'current'
const SAVE_AFTER_MS = 400

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB is not available'))
  })
}

async function run<T>(mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = op(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
    })
  } finally {
    db.close()
  }
}

export async function loadSet(): Promise<SavedSet | null> {
  const text = await run<unknown>('readonly', (s) => s.get(KEY))
  if (typeof text !== 'string') return null
  const set = parseSet(text)
  return 'error' in set ? null : set
}

/** Saves the set, or forgets it when there is nothing in it. */
export async function saveSet(set: SavedSet): Promise<void> {
  if (set.tracks.length === 0 && !set.plan) await run('readwrite', (s) => s.delete(KEY))
  else await run('readwrite', (s) => s.put(JSON.stringify(set), KEY))
}

/** Restores the saved set, then saves after every change; returns the way to stop. */
export function keep(store: SetStore, onError: (message: string) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let unsubscribe = () => {}
  const save = () => {
    if (store.busy) return // an analysis in progress saves when it ends
    saveSet(store.toSaved()).catch((e) =>
      onError(store.t('persist.saveError', { error: String(e) })),
    )
  }
  loadSet()
    .catch(() => null)
    .then((saved) => {
      if (stopped) return
      if (saved && store.tracks.length === 0) store.restore(saved)
      store.markReady()
      unsubscribe = store.subscribe(() => {
        clearTimeout(timer)
        timer = setTimeout(save, SAVE_AFTER_MS)
      })
    })
  return () => {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
  }
}
