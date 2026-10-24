const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const dir = process.argv[2];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('about:blank');
  console.log('UA', await page.evaluate(() => navigator.userAgent));
  const files = fs.readdirSync(dir).filter(f => f.startsWith('out'));
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(dir, f)).toString('base64');
    const r = await page.evaluate(async (b64) => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const ctx = new OfflineAudioContext(2, 44100, 44100);
      try {
        const buf = await ctx.decodeAudioData(bin.buffer);
        const d = buf.getChannelData(0); let first = -1;
        for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > 0.1) { first = i; break; }
        return { ok: true, frames: buf.length, sr: buf.sampleRate, ch: buf.numberOfChannels, firstOnsetMs: (first / buf.sampleRate * 1000).toFixed(2) };
      } catch (e) { return { ok: false, err: String(e) }; }
    }, b64);
    console.log(f.padEnd(16), JSON.stringify(r));
  }
  // Sync + seek determinism test, all in-page
  const res = await page.evaluate(async () => {
    const sr = 44100;
    function clicks(bpm, secs, first) {
      const n = Math.floor(secs * sr); const b = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr });
      const d = b.getChannelData(0); const spb = 60 / bpm;
      for (let t = first; t < secs - 0.05; t += spb) { const i = Math.round(t * sr); for (let k = 0; k < 64; k++) d[i + k] = k === 0 ? 1 : d[i + k] + 0.9 * Math.exp(-k / 8); }
      return b;
    }
    const bpmA = 124, bpmB = 120, firstA = 0.3, firstB = 0.7;
    const A = clicks(bpmA, 200, firstA), B = clicks(bpmB, 200, firstB);
    const rate = bpmA / bpmB, beats = 256, exitBeatA = 32, entryBeatB = 0;
    const durSec = beats * 60 / bpmA;
    // render one deck, starting playback at transition beat b0
    async function render(which, b0, lenSec) {
      const ctx = new OfflineAudioContext(1, Math.ceil(lenSec * sr), sr);
      const src = new AudioBufferSourceNode(ctx, { buffer: which === 'A' ? A : B, playbackRate: which === 'A' ? 1 : rate });
      src.connect(ctx.destination);
      const grid = which === 'A' ? { bpm: bpmA, first: firstA, beat0: exitBeatA } : { bpm: bpmB, first: firstB, beat0: entryBeatB };
      const offset = grid.first + (grid.beat0 + b0) * 60 / grid.bpm;
      src.start(0, offset);
      return (await ctx.startRendering()).getChannelData(0);
    }
    function onsets(d) { const o = []; let last = -1e9; for (let i = 0; i < d.length; i++) if (d[i] > 0.5 && i - last > sr * 0.1) { o.push(i); last = i; } return o; }
    const a = onsets(await render('A', 0, durSec)), b = onsets(await render('B', 0, durSec));
    let maxDiff = 0; const m = Math.min(a.length, b.length);
    for (let i = 0; i < m; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    // seek determinism: render B from beat 0 vs from beat 100.37, compare overlap
    const bSeek = 100.37; const full = await render('B', 0, durSec); const part = await render('B', bSeek, 10);
    const off = Math.round(bSeek * 60 / bpmA * sr); let maxErr = 0;
    for (let i = 0; i < part.length; i++) maxErr = Math.max(maxErr, Math.abs(part[i] - full[off + i]));
    return { onsetsA: a.length, onsetsB: b.length, maxInterDeckOffsetSamples: maxDiff, maxInterDeckOffsetMs: (maxDiff / sr * 1000).toFixed(3), seekMaxAbsErr: maxErr, rate };
  });
  console.log('SYNC', JSON.stringify(res));
  await browser.close();
})();
