// Test harness page: exposes signal generators, measurements and offline rendering
// on `window.harness` for Playwright integration tests. Served by the Vite dev server
// at /harness/ and never included in the production build.
import * as measure from './measure'
import { renderOffline, toBuffer } from './render'
import * as signals from './signals'

const harness = { signals, measure, renderOffline, toBuffer }

export type Harness = typeof harness

declare global {
  interface Window {
    harness: Harness
  }
}

window.harness = harness
document.body.dataset.ready = 'true'
