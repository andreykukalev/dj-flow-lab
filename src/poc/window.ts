import type { PocSession } from './session'

// The proof-of-concept session on `window.poc`, for the browser tests.
declare global {
  interface Window {
    poc?: PocSession
  }
}
