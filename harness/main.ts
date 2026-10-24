// Test harness page: exposes signal generators, measurements, offline rendering and
// the engine scenarios on `window.harness` for Playwright integration tests. Served by
// the Vite dev server at /harness/ and never included in the production build.
import * as engine from './engine'
import * as measure from './measure'
import { renderOffline, toBuffer } from './render'
import * as signals from './signals'

const harness = { signals, measure, renderOffline, toBuffer, engine }

export type Harness = typeof harness

declare global {
  interface Window {
    harness: Harness
  }
}

window.harness = harness
document.body.dataset.ready = 'true'
