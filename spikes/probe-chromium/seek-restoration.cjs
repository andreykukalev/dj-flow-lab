const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage(); await page.goto('about:blank');
  const res = await page.evaluate(async () => {
    const sr = 44100, bpmA = 124, bpmB = 120, rate = bpmA / bpmB;
    const n = 60 * sr; const B = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: sr }); const d = B.getChannelData(0);
    // band-limited "kick": 60 Hz decaying sine every beat + 440 Hz pad
    const spb = 60 / bpmB;
    for (let i = 0; i < n; i++) { const t = i / sr; const tb = (t - 0.7) % spb; d[i] = 0.3 * Math.sin(2 * Math.PI * 440 * t) + (t > 0.7 ? 0.6 * Math.sin(2 * Math.PI * 60 * tb) * Math.exp(-tb * 12) : 0); }
    async function render(b0, lenSec, gainAuto) {
      const ctx = new OfflineAudioContext(1, Math.ceil(lenSec * sr), sr);
      const src = new AudioBufferSourceNode(ctx, { buffer: B, playbackRate: rate }); const g = new GainNode(ctx);
      src.connect(g).connect(ctx.destination);
      src.start(0, 0.7 + b0 * 60 / bpmB);
      if (gainAuto) { // plan: gain ramps 0 -> 1 over beats 0..64 (linear in control space), we start at b0
        const secPerBeat = 60 / bpmA; const v = (b) => Math.min(1, Math.max(0, b / 64));
        g.gain.setValueAtTime(v(b0), 0); g.gain.linearRampToValueAtTime(1, (64 - b0) * secPerBeat);
      }
      return (await ctx.startRendering()).getChannelData(0);
    }
    const out = {};
    for (const auto of [false, true]) {
      const full = await render(0, 40, auto); const b0 = 20.37; const part = await render(b0, 8, auto);
      const off = b0 * 60 / bpmA * sr; const o = Math.round(off);
      let se = 0, ss = 0, maxErr = 0;
      for (let i = 0; i < part.length; i++) { const e = part[i] - full[o + i]; se += e * e; ss += full[o + i] ** 2; maxErr = Math.max(maxErr, Math.abs(e)); }
      out[auto ? 'withGainRamp' : 'plain'] = { residualDb: (10 * Math.log10(se / ss)).toFixed(1), maxAbsErr: maxErr.toFixed(4), fractionalSampleOffset: (off - o).toFixed(3) };
    }
    return out;
  });
  console.log(JSON.stringify(res)); await browser.close();
})();
