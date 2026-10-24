# Technical decisions

- **Status:** v0.3, 2026-10-24. Supersedes the technical choices in [architecture.md](architecture.md) where they conflict.
- **Evidence:** [TECHNICAL_AUDIT_v0.2.md](TECHNICAL_AUDIT_v0.2.md). Spikes referenced as S1–S8 are in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md).
- **Confidence:** _High_ = validated or standard behaviour; _Medium_ = sound reasoning, needs a test; _Low_ = placeholder until a spike reports.

---

## Platform and runtime

### D-01 Browser-only static web app, no backend
- **Context:** MVP must play, analyse, and visualise two local tracks. Hosting is Azure Static Web Apps.
- **Alternatives:** desktop shell (Tauri/Electron); web app + analysis server.
- **Rationale:** every MVP requirement maps to Web Audio, Web Workers, and IndexedDB. A server would add uploads of copyrighted audio, privacy obligations, and operations for no MVP requirement.
- **Consequences:** analysis quality and memory are bounded by the client; browser differences must be tested.
- **Confidence:** High.
- **Reconsider if:** S6 shows client-side BPM/downbeat accuracy is unusable even with manual correction, or S2 shows memory limits make 10-minute tracks unreliable.

### D-02 Native Web Audio nodes only; no audio library; no AudioWorklet
- **Context:** the mixer needs gain, EQ, filters, and sample-accurate automation.
- **Alternatives:** Tone.js; Howler; custom AudioWorklet DSP.
- **Rationale:** `GainNode`, `BiquadFilterNode`, and `AudioParam` automation cover the chain. Libraries add their own clock and abstractions that would compete with the single timeline (D-04).
- **Consequences:** we own scheduling code (small and testable). Key lock cannot be added without an AudioWorklet later.
- **Confidence:** High.
- **Reconsider if:** key lock moves into scope.

### D-03 Decoding: native first, in-house AIFF fallback, 15-minute limit
- **Context:** neither Chromium nor Firefox decodes AIFF (verified in S2), and AIFF is common in DJ libraries.
- **Alternatives:** require conversion; WASM ffmpeg (~25 MB, LGPL/GPL builds); a decoding library.
- **Rationale:** uncompressed AIFF/AIFF-C is a simple container over PCM; a ~150-line parser covers it with no dependency. Everything else uses `decodeAudioData`.
- **Supported in Tier 1 (S2):**
  - natively in Chromium and Firefox: WAV (16/24-bit, 32-bit float), FLAC, MP3, AAC (M4A), Ogg Vorbis, Opus;
  - through the fallback: AIFF and AIFF-C (8/16/24/32-bit integer, `NONE`/`twos`/`sowt`, `fl32`, `fl64`), mono or stereo.

  ALAC fails in both engines. Safari is unverified (Tier 2).
- **Messages:**
  - Unsupported format: "This browser can't open {type} files. Convert the track to WAV, AIFF or FLAC (or MP3/AAC) and load it again."
  - ALAC: "Apple Lossless (ALAC) isn't supported in this browser. Convert it to AIFF or FLAC; both are lossless."
  - Compressed AIFF-C: "This AIFF uses {compression} compression, which isn't supported. Convert it to uncompressed AIFF or WAV."
  - Corrupt file: "This file couldn't be read. It may be damaged or incomplete."
  - Too long: "Tracks longer than 15 minutes aren't supported yet."
- **Length limit:** 15 minutes per track. S2 measured two 10-minute 48 kHz stereo tracks at a peak of +1.0 GB (Chromium) and +0.7 GB (Firefox) over an idle browser. Two 15-minute tracks extrapolate to about +1.5 GB, which is fine on an 8 GB machine.
- **Consequences:** the file's `ArrayBuffer` is hashed before decoding (decoding detaches it) and released afterwards. Firefox decodes about 2.7× slower than Chromium (25 s for two 10-minute tracks), so loading shows progress.
- **Confidence:** High (formats and AIFF parser, measured on both engines), Medium (15-minute limit, memory extrapolated).
- **Reconsider if:** pilot users bring ALAC or longer mixes; Safari fails a format Tier 1 supports.

### D-04 One authoritative timeline: the playback anchor on the AudioContext clock
- **Context:** audio, controller, timeline, and explanations must agree at every moment, through pauses and seeks.
- **Alternatives:** a JS clock (`performance.now`) driving audio; `HTMLMediaElement` time; per-deck positions updated incrementally.
- **Rationale:** `AudioContext.currentTime` is the clock the audio is rendered against. On every start, the transport records an anchor `(ctxTime₀, beat₀)`; thereafter `beat(t) = beat₀ + (t − ctxTime₀) · bpmA / 60`. Nothing else stores position.
- **Consequences:** all audio schedules and all visual state are functions of `(plan, grids, beat)`. Timers and animation frames never trigger audio.
- **Confidence:** High.
- **Reconsider if:** never for the MVP; tempo ramps (deferred) would need a piecewise anchor.

### D-05 Every start is "start at beat b"
- **Context:** `AudioBufferSourceNode` is one-shot; play, resume, seek, replay, loop, and variant switch all need to (re)start sources.
- **Alternatives:** `AudioContext.suspend()/resume()` for pause; incremental rescheduling.
- **Rationale:** one pure entry point, `startAt(beat)`: fade out 10 ms if playing, stop and discard sources, cancel automation, compute the state at `beat`, create two sources with offsets from the grids, set every parameter to its state value at `ctxTime₀`, schedule the rest of the plan. One code path is one thing to test.
- **Consequences:** a seek costs ~10 ms of fade and a ~30 ms scheduling lead (`ctxTime₀ = currentTime + lead`, provisional). Repeated seeks cannot accumulate error.
- **Confidence:** High. S1 (#42) confirmed it on Chromium and Firefox: after 100 random seeks or 50 pause/resume cycles, onsets match a play-through within 0.6 sample (Firefox deck B after removing the resampler drift, D-07). Lead set to 30 ms and gate fade to 10 ms. Transport actions take an explicit context time (default now), so tests can script sessions offline.
- **Reconsider if:** S1 shows audible gaps on seek that users find disruptive during A/B switching.

### D-06 AudioContext lifecycle and interruptions
- **Context:** autoplay policy; device changes; OS sleep; hidden tabs.
- **Decision:** one context, created lazily and resumed inside the first user gesture; default `latencyHint`; device sample rate. On `statechange` away from `running` while playing, the transport becomes Paused at `beat(currentTime)` and waits for the user. Hidden tabs keep audio; visuals resume from the clock.
- **Confidence:** Medium (behaviour across engines verified in S1/S5).
- **Reconsider if:** an engine resumes contexts automatically in ways that desynchronise the anchor.

### D-07 Tempo sync by constant playback rate
- **Context:** decks have different BPMs; key lock is out of scope.
- **Decision:** deck A is the tempo master at rate 1. Deck B plays at `rate = bpmA / bpmB`, constant for the whole playback session. The pitch change `12·log₂(rate)` semitones is shown on deck B; warning at ≥ 0.5 semitone (provisional). No tempo ramps.
- **Alternatives:** time-stretch (deferred); ramping B back to its own tempo after the transition.
- **Consequences:** source position is linear in context time, so offsets are exact. B stays pitch-shifted after the handoff, as on a controller without key lock.
- **Engine finding (S1):** Firefox rounds a resampled source's output rate to whole hertz, so deck B drifts by up to ~12 ppm there (≤ 0.8 ms over a 32-bar overlap, ≤ 1.5 ms over 64 bars). The drift restarts from zero at every start, seek or resume. Chromium plays the exact rate. Alternative if this matters: resample deck B in a worker and play it at rate 1 (exact everywhere, costs a second copy of B and a few seconds per tempo change).
- **Confidence:** High (Chromium), Medium (Firefox: within 1.5 ms over 64 bars, above P1's 1 ms; decision at the PoC gate).
- **Reconsider if:** users find pitch shifts above ~1 semitone common in their pairs; Safari drifts more than Firefox; testers hear the Firefox drift on long blends.

## Musical timing

### D-08 Time domains and the plan timebase
Five domains, never mixed implicitly; conversions live only in `src/engine/time.ts`:

| Domain | Unit | Meaning |
|---|---|---|
| File time | seconds | position in the decoded audio of one deck |
| Track beat | beats (float) | position on one deck's grid; bar 1 beat 1 = beat 0 |
| Bar:beat | display | 1-based `bar.beat` (+ fraction) shown to users |
| Transition beat | beats (float) | the shared timeline; 0 = first beat of A's exit bar; advances at A's tempo |
| Context time | seconds | `AudioContext.currentTime`; related to transition beats only through the anchor (D-04) |

Display time (`requestAnimationFrame` timestamps) is converted to context time only through `getOutputTimestamp()`/`outputLatency` (D-21). Plans are written in transition beats. **Confidence:** High.

### D-09 Beat-grid model
```ts
interface BeatGrid {
  bpm: number;              // float, ≥ 3 decimals of precision
  anchorSec: number;        // file time of any downbeat ("the 1")
  beatsPerBar: 4;
  phraseOffsetBars: number; // phrase grid starts at bar 1 + offset
  source: 'analysis' | 'user';
  confidence?: number;
}
```
- Bar numbering: bar 1 is the first full bar at or after file time 0, derived from `anchorSec`.
- **Two-point correction:** the user sets "the 1" at two downbeats far apart; `bpm = 60 · beatsBetween / (t₂ − t₁)` with `beatsBetween` rounded to whole bars. This is the primary precision tool.
- **Double BPM:** keeps the anchor; beats between old beats are added. **Halve BPM:** keeps the anchor as a downbeat; the UI asks the user to confirm "the 1" and offers a one-beat shift.
- **Nudge:** anchor moves in 1 ms steps (fine) or 1/16 beat (coarse); BPM in 0.01 steps.
- Phrase markers are a **phrase grid** (every 8/16/32 bars from `phraseOffsetBars`), not detection.
- **Confidence:** High (model), Medium (UX).
- **Reconsider if:** variable-tempo support enters scope.

### D-10 Constant tempo only, with drift detection
- **Context:** live-played material (e.g. disco edits) drifts; a single BPM cannot fit it.
- **Decision:** the analysis computes a **grid fit** score: median and 90th-percentile deviation of detected onsets from grid beats in the first, middle, and last thirds. Above a threshold (provisional 20 ms p90), the deck shows "tempo may vary: long blends may drift" and the strategy UI suggests shorter overlaps.
- **Consequences:** drifting tracks are usable for short transitions only; nothing silently fails.
- **Confidence:** Medium (threshold from S6).
- **Reconsider if:** pilot users bring many drifting tracks.

## Mixer DSP

### D-11 Signal chain and headroom
Per deck: `AudioBufferSourceNode (playbackRate) → trim Gain → isolator EQ → LP Biquad → HP Biquad → fader Gain → crossfader Gain` → `master Gain (−9 dB) → AnalyserNode (meter) → destination`.
- Rate change happens at the source (resampling), so EQ and filter frequencies are absolute, as on a real mixer.
- Master −9 dB gives headroom for two loud tracks at full level; meter shows a clip indicator. No limiter (deferred: colours A/B comparisons; `DynamicsCompressorNode` is loosely specified).
- **Changed in S3 from −6 dB:** with synthetic loud masters (−9 dBFS RMS, −0.3 dBFS sample peak), two beat-aligned decks at full faders peaked at +0.9 to +1.6 dBTP at −6 dB, because the kicks coincide and the isolator's phase shift raises the peaks of limited material by about 2 dB. At −9 dB all five pairs stay below 0 dBTP, and the long blend stays below 0 dBTP even with very loud masters (−5.5 dBFS RMS).
- **Confidence:** High (order), Medium (−9 dB: synthetic masters; confirm with real tracks and the clip indicator in the PoC listening check, P9).

### D-12 Isolator-style 3-band EQ, shelving fallback
- **Context:** the bass swap needs a real low kill; shelving biquads cannot reach −∞ and attenuate only partly around their corner.
- **Decision:** split into low/mid/high with Linkwitz–Riley 4th-order crossovers (two cascaded Butterworth biquads per slope) at **320 Hz and 3.2 kHz** (set in S3; 250 Hz / 2.5 kHz killed only 32 dB at 100 Hz), with phase compensation so bands sum flat; one `GainNode` per band; sum.
- **Alternatives:** shelving + peaking biquads with a −40 dB floor (3 nodes, simpler).
- **Consequences:** ~10 biquads per deck; negligible CPU.
- **Confidence:** High for the measurements (S3, both engines: flat within 0.22 dB from 20 Hz to 18 kHz; low kill ≥ 40.5 dB up to 100 Hz; mid 34.4 dB and high 35.4 dB at band centre). Medium for how the bands sound, which the listening check (P9) confirms. The shelving fallback is not needed.
- **Reconsider if:** S3 fails, or CPU on low-end laptops exceeds budget.

### D-13 Bipolar filter
Low-pass and high-pass biquads are always in the chain (no graph changes during playback). Web Audio takes their `Q` in dB, so the linear Q values here are converted (found in S1). Centre: LP at 0.95 × Nyquist, HP at 5 Hz. Dead zone |x| < 0.02. Negative x: LP cutoff from 0.95 × Nyquist down to 100 Hz, log-mapped. Positive x: HP cutoff from 5 Hz up to 8 kHz, log-mapped. Q = 0.9 (mild resonance).
- **Changed in S3:** neither filter rests at its exact pass-through. Firefox switches the low-pass to a pass-through at exactly Nyquist, and a sweep leaving or reaching Nyquist clicked (sample jump 0.28 against an allowed 0.17, −34 dBFS of energy above 8 kHz); Chromium does the same for a high-pass at 0 Hz (−62 dBFS). A 10 Hz resting high-pass with this Q lifted 20 Hz by 0.6 dB; at 5 Hz the lift is 0.2 dB.
- **Result:** sweeps over 8 bars, 1 bar and 1 beat, both ways, stay below the D-15 jump threshold in both engines. Firefox updates biquad coefficients less often than Chromium, which leaves −64 dBFS of zipper energy on the fastest low-pass sweep (Chromium: −122 dBFS); both are far below the music.
- **Confidence:** High (measured, S3); the resonance is tuned by ear in P9.

### D-14 Control units, ranges, mappings, defaults
Plans and UI use **normalized control positions**; mapping functions in `src/engine/mixer.ts` are the only conversion to audio units and are shared by scheduler and UI.

| Control | Position range | Default | Mapping to audio |
|---|---|---|---|
| `trim` | −1…+1 | 0 | −12…+12 dB, linear in dB |
| `eqLow`, `eqMid`, `eqHigh` | 0…1 | 0.5 | ≤ 0.5: band gain = (2p)² (0 = kill); > 0.5: +0…+6 dB, linear in dB |
| `filter` | −1…+1 | 0 | D-13 |
| `fader` | 0…1 | A: 1, B: 0 | gain = p² (provisional taper) |
| `crossfader` (mixer) | 0…1 (0 = A) | 0.5 | gA = min(1, 2(1−x)), gB = min(1, 2x) ("dipless": centre = both at unity) |

Master gain is fixed at −9 dB (D-11) and not plan-controlled in the MVP. **Confidence:** Medium (curves tuned by listening in the PoC check, P9; S3 measured the DSP only).

### D-15 Declicking
- `step` events: 5 ms linear ramp in audio units starting at the event time.
- Start/stop/seek: 10 ms fade on each deck's fader stage (separate from the plan's fader value; a dedicated "transport gate" gain).
- Direct manipulation (outside plans): `setTargetAtTime`, τ = 10 ms.
- Every transport action that cancels automation sets each parameter again at the same time. Firefox records a `.value` assignment as an automation event, so cancelling at that time drops it and the parameter falls back to its default; the filters then ran at 350 Hz for one render block and rang at up to 3× the signal on the first start (found in S3).
- **Test:** no sample-to-sample difference above −40 dBFS beyond the signal's own maximum slope at event boundaries in offline renders (provisional).
- **Confidence:** High.

## Transition plan

### D-16 Plan schema v1: versioned, event-based, data-driven
```ts
interface TransitionPlanV1 {
  schemaVersion: 1;
  id: string;
  strategy: { id: string; version: number; params: Record<string, number | string | boolean> };
  decks: Record<'A' | 'B', { trackFingerprint: string; grid: BeatGrid /* snapshot */ }>;
  points: { exitBarA: number; entryBarB: number }; // 1-based bars
  tempo: { master: 'A' };                         // rateB derived, never stored as truth
  span: { startBeat: number; endBeat: number };   // e.g. −16 (pre-roll) … overlap end + tail
  initial: Partial<Record<ControlKey, number>>;   // state at span.startBeat; unset = control default
  events: ControlEvent[];
  annotations: Annotation[];
}
type ControlKey = `${'A' | 'B'}.${'trim' | 'eqLow' | 'eqMid' | 'eqHigh' | 'filter' | 'fader'}` | 'mixer.crossfader';
interface ControlEvent {
  id: string;
  control: ControlKey;
  kind: 'set' | 'ramp';
  atBeat: number;        // start, transition beats
  untilBeat?: number;    // ramp end (required for 'ramp')
  to: number;            // target position; 'from' is the value at atBeat
  curve?: 'linear' | 'smooth'; // ramps only; 'smooth' = cosine ease in control space
  annotationId?: string;
}
interface Annotation {
  id: string; atBeat: number; untilBeat?: number;
  layer: 'measured' | 'hypothesis' | 'interpretation' | 'preference' | 'instruction';
  titleKey: string; bodyKey: string; vars: Record<string, string | number>;
}
```
- Strategies are pure functions `(decks, points, params) → TransitionPlanV1`; UI components never contain transition logic.
- Grid snapshots make a plan reproducible; if a deck's current grid differs from the snapshot, the plan is marked "grid changed" and re-generated (plans are in beats, so points still mean the same bars).
- Unknown future `schemaVersion` → refuse with a message; older versions → explicit migration functions.
- **Confidence:** High.

### D-17 Plan compiler and `stateAt`
`compile(plan) → Record<ControlKey, Segment[]>`, where each segment is `{ b0, b1, v0, v1, curve }` covering the whole span without gaps. `stateAt(compiled, beat)` evaluates each control by binary search over its segments: a pure function of `(plan, beat)` with no dependence on previous calls or frames. Audio scheduling and every visual read the compiled form. **Confidence:** High.

### D-18 Scheduling: sampled linear ramps in audio units
- Each segment from the start beat onward is sampled in control space every 1/32 beat (provisional; adaptive so mapping error ≤ 0.1 dB), mapped to audio units, and scheduled with `setValueAtTime` (first point) and `linearRampToValueAtTime` (rest). Context times come from the anchor.
- A segment already in progress at the start beat is cut at that beat; the first scheduled value equals `stateAt(beat)`.
- Not used: `setValueCurveAtTime` (throws on overlapping events, historical interpolation differences), `cancelAndHoldAtTime` (not available in every engine), `exponentialRampToValueAtTime` (cannot reach 0).
- **Confidence:** High for timing (S1: parameters equal the mapped `stateAt` within 5.3e-6 after random seeks; the bass swap lands within the declick of the downbeat in both engines). Sampling at 1/32 beat kept. Ramp quality in filter sweeps is still checked in S3.

### D-19 Validation
`validate(plan, mixerCapabilities) → { errors[], warnings[] }`. Plans with errors are never scheduled.
- **Errors:** unsupported `schemaVersion`; unknown control; non-finite numbers; `to` outside the control's range; ramp without `untilBeat` or with `untilBeat ≤ atBeat`; event outside `span`; two events on the same control whose intervals overlap (a `set` at exactly a ramp's end is allowed); two `set`s on the same control at the same beat; exit/entry points outside either track; deck B's audio ending before `span.endBeat`; annotation references that do not resolve.
- **Warnings:** events not on a 1/4-beat grid; strategy version older than current; pitch change ≥ 0.5 semitone; both decks' `eqLow` above 0.4 at the same time for more than one beat (bass clash; musical advisory); grid fit poor on either deck (D-10); grid differs from snapshot.
- Events are normalized by sorting on `(atBeat, control, id)` so equal plans compile identically.
- **Confidence:** High.

## Synchronization tolerances

### D-20 Separate, separately tested tolerances
| What | Tolerance | How measured | Status |
|---|---|---|---|
| Inter-deck beat alignment (engine) | ≤ 1 ms over 64 bars | Offline render of synthetic click tracks at different BPM; onset cross-correlation | Validated in Chromium (0.023 ms); provisional elsewhere |
| Seek/pause restoration (engine) | ≤ 1 sample timing, control values equal to `stateAt` within 1e-4 | Render from beat _b_ vs play-through; sub-sample onset comparison (not sample-exact null test) | Validated in Chromium; provisional elsewhere |
| Automation timing | ≤ 1 render quantum (128 frames) | Offline render; envelope crossing time vs schedule | Provisional (biquad parameters may be k-rate in some engines) |
| Grid accuracy on real tracks | kick onsets ≤ 10 ms from grid at the start and end of a 64-bar overlap, after correction | Reference set, hand-annotated | Provisional (S6) |
| Visual state vs audio time | rendered state = `stateAt(beat(heardTime))`, one frame (≤ 17 ms at 60 Hz) | Instrumented frame log in-browser | Provisional (S5) |
| Perceived A/V offset | within ±40 ms | Manual check with wired output; calibration setting for Bluetooth | Provisional (S5) |

The v0.2 criterion "drift under 5 ms over a 64-bar overlap" is withdrawn: engine drift is far smaller, and real-track drift is a grid-accuracy property.

### D-21 Visual state derived from the clock
One `requestAnimationFrame` loop: heard context time = `getOutputTimestamp()` mapping (fallback: `currentTime − outputLatency`, fallback: `currentTime − baseLatency`) + user calibration offset; `beat = anchorBeat(heardTime)`; render `stateAt(beat)`. React is not on the per-frame path (components subscribe to an external store; mixer SVG attributes are written directly). When paused, the frame shows `stateAt(pausedBeat)`. After any pause, seek, interruption, or hidden tab, the next frame is correct by construction. **Confidence:** Medium (S5).

## Persistence and privacy

### D-22 Track identity
Fingerprint = SHA-256 of the whole file (`crypto.subtle.digest`, before decoding). Secondary match = name + duration (±50 ms); on a secondary-only match the user is asked whether to reuse the stored grid. **Confidence:** Medium (tag edits change the hash; S7 checks how often this bites).

### D-23 No persistent audio, no persistent file handles
Decoded audio and file bytes live in memory only. After reload, the user re-selects files; the app restores everything else by fingerprint. File System Access handles (Chromium-only) are deferred. **Confidence:** High.

### D-24 Storage layout and versioning
| Data | Where |
|---|---|
| Decoded `AudioBuffer`s, peaks, transport state, compiled plans | Memory |
| Per track (by fingerprint): analysis result `{analysisVersion, engine, sampleRate, decodedFrames, grid, gridFit, loudness, sections}`; user corrections (separate record, layered on top) | IndexedDB `tracks`, `corrections` |
| Per pair (`fpA:fpB`): points, variants (plans), notes | IndexedDB `pairs` |
| Session log (opt-in) | IndexedDB `log` |
| Backup and sharing | Exported JSON (schema-versioned): corrections, plans, notes, log. Rendered WAV. |

Outdated `analysisVersion` → recompute analysis, keep corrections. Different `decodedFrames` for the same fingerprint on an **MP3** → warn that the grid may be offset (decoder difference). S2 showed MP3 priming shifts timing and shows in the frame count, while Vorbis and Opus decoders differ only in how they trim the end (frames differ, timing identical), so the check is limited to MP3. Request `navigator.storage.persist()` on first save; handle quota errors by telling the user and offering export. **Confidence:** High.

### D-25 Analysis pipeline
Main thread downmixes to mono and decimates to 11,025 Hz in chunks (low-pass first), transfers the result to a Web Worker. Worker: own radix-2 FFT; onset strength; tempo by autocorrelation + whole-track regression for precision; downbeat from low-band energy; grid fit; per-bar band energy; loudness. No AGPL/GPL code. **Confidence:** Medium (accuracy in S6).

### D-28 Privacy enforcement
Claim: "Your audio files are processed in your browser and never uploaded." Enforced by CSP (`connect-src 'self'`, no third-party scripts, no analytics in the MVP) and an end-to-end test that captures all requests during a full session and fails if any request body exceeds a few kB or targets another origin. The static host's standard access logs (IP, user agent, URLs of app files) are disclosed. **Confidence:** High.

## Dependencies and testing

### D-26 Minimal dependency set
| Package | Purpose | MVP? | Licence / maintenance |
|---|---|---|---|
| react, react-dom | UI components | Required | MIT, active |
| vite, @vitejs/plugin-react | Build, dev server, workers | Required | MIT, active |
| typescript | Types | Required (dev) | Apache-2.0, active |
| vitest | Unit tests (pure engine, analysis) | Required (dev) | MIT, active |
| @playwright/test | Browser integration and e2e tests | Required (dev) | Apache-2.0, active |
| oxlint, prettier | Lint, format | Required (dev) | MIT, active |
| idb | IndexedDB promise wrapper | Optional | ISC, active; replaceable by ~50 lines |
| zustand | — | **Removed** (unused; transport store is `useSyncExternalStore` + ~30 lines) | — |

No audio, analysis, FFT, animation, or charting libraries. Test fixtures are synthetic (generated by script) or CC-licensed with the licence recorded. **Confidence:** High.

### D-27 Test strategy and browser support tiers
- **Unit (Vitest, Node):** time conversion, grid corrections, mappings, plan compile/validate/`stateAt`, strategies, AIFF parser, FFT, analysis on synthetic signals.
- **Integration (Playwright, in-page `OfflineAudioContext`):** decoding matrix, DSP responses, scheduler timing, seek restoration, declicking. Run on Chromium and Firefox in CI.
- **E2E (Playwright):** load fixtures, set points, play, seek, switch variant; network-privacy test.
- **Manual listening checks:** per milestone, with a written checklist (pass/fail).
- **Support tiers:** Tier 1 = current Chrome/Edge and Firefox desktop (automated). Tier 2 = current Safari desktop on macOS (manual before pilot; Playwright WebKit on Linux is not representative of Safari's media stack). Mobile = unsupported in the MVP.
- **Offline scripting:** Firefox has no `OfflineAudioContext.suspend()`, so integration tests script transport actions at explicit context times before rendering. Mid-render parameter reads run on Chromium only; Firefox is checked through rendered levels.
- **Confidence:** High (strategy and Firefox real-time audio in headless CI, S8).
