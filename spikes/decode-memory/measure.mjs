// Spike S2 (#43): peak memory for two 10-minute 48 kHz stereo tracks.
// Throwaway measurement, not product code. Run from the repo root:
//   node spikes/decode-memory/measure.mjs chromium|firefox
// Firefox needs PLAYWRIGHT_BROWSERS_PATH pointing at a Playwright Firefox build.
//
// In the page: build a 10-minute 16-bit WAV in memory (what a user's file would be),
// decode it with decodeAudioData, release the file bytes, repeat for a second track,
// then build the analysis hand-off (mono, decimated to 11025 Hz). From Node: poll the
// resident memory (RSS) of every process of the browser and keep the peak per phase.
import { readFileSync, readdirSync } from 'node:fs'
import { chromium, firefox } from '@playwright/test'

const engine = process.argv[2] ?? 'chromium'
const type = engine === 'firefox' ? firefox : chromium
const server = await type.launchServer({ headless: true })
const rootPid = server.process().pid

function tree(pid) {
  const pids = [pid]
  for (const p of pids) {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      try {
        const ppid = Number(readFileSync(`/proc/${entry}/stat`, 'utf8').split(') ')[1].split(' ')[1])
        if (ppid === p && !pids.includes(Number(entry))) pids.push(Number(entry))
      } catch {}
    }
  }
  return pids
}
function rssMB() {
  let kb = 0
  for (const pid of tree(rootPid)) {
    try {
      const m = /VmRSS:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))
      if (m) kb += Number(m[1])
    } catch {}
  }
  return kb / 1024
}

let phase = 'start'
const peaks = {}
const timer = setInterval(() => {
  const mb = rssMB()
  peaks[phase] = Math.max(peaks[phase] ?? 0, mb)
}, 50)

const browser = await type.connect(server.wsEndpoint())
const page = await browser.newPage()
await page.goto('about:blank')
await page.exposeFunction('phase', (p) => (phase = p))
const baseline = rssMB()

const result = await page.evaluate(async () => {
  const sr = 48000
  const seconds = 600
  function wav() {
    const frames = sr * seconds
    const bytes = new ArrayBuffer(44 + frames * 4)
    const v = new DataView(bytes)
    const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
    str(0, 'RIFF'); v.setUint32(4, 36 + frames * 4, true); str(8, 'WAVE')
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true)
    str(36, 'data'); v.setUint32(40, frames * 4, true)
    const pcm = new Int16Array(bytes, 44)
    for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.sin(i * 0.01) * 8000) | 0
    return bytes
  }
  const ctx = new AudioContext({ sampleRate: sr })
  const t0 = performance.now()
  const buffers = []
  for (const deck of ['A', 'B']) {
    await window.phase(`file ${deck}`)
    let bytes = wav()
    await window.phase(`decode ${deck}`)
    buffers.push(await ctx.decodeAudioData(bytes))
    bytes = null
    await window.phase(`after ${deck}`)
    await new Promise((r) => setTimeout(r, 500))
  }
  await window.phase('analysis hand-off')
  const handoff = buffers.map((b) => {
    const l = b.getChannelData(0)
    const r = b.getChannelData(1)
    const out = new Float32Array(Math.floor(l.length / 4))
    for (let i = 0; i < out.length; i++) out[i] = (l[4 * i] + r[4 * i]) / 2
    return out.length
  })
  await new Promise((r) => setTimeout(r, 1000))
  await window.phase('done')
  await new Promise((r) => setTimeout(r, 500))
  return { decodeSeconds: (performance.now() - t0) / 1000, frames: buffers.map((b) => b.length), handoff }
})
clearInterval(timer)
console.log(JSON.stringify({ engine, baselineMB: Math.round(baseline), peaksMB: Object.fromEntries(Object.entries(peaks).map(([k, v]) => [k, Math.round(v)])), ...result }, null, 1))
await browser.close()
await server.close()
