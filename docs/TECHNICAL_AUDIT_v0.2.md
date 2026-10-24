# Technical audit of Product Brief v0.2

- **Date:** 2026-10-24
- **Scope:** every technical assumption in [product-brief.md](product-brief.md) (v0.2), [architecture.md](architecture.md), and the M0 code (`src/engine/model.ts`, `src/engine/time.ts`).
- **Outcome:** feeds [PRODUCT_BRIEF_v0.3.md](PRODUCT_BRIEF_v0.3.md), [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md), [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md), [MVP_IMPLEMENTATION_PLAN.md](MVP_IMPLEMENTATION_PLAN.md), and [RISKS.md](RISKS.md).

## What already exists

| Item | State |
|---|---|
| Product brief v0.2, architecture proposal, backlog | `docs/product-brief.md`, `docs/architecture.md`, `docs/backlog.md`. Backlog mirrored as GitHub issues #1–#38. |
| Implementation | M0 scaffold only: Vite + React 19 + TypeScript (strict), oxlint, Prettier, Vitest, Playwright, CI, Azure Static Web Apps deploy workflow. |
| Engine code | `src/engine/model.ts` (types only) and `src/engine/time.ts` (bar/beat/second conversion, 12 unit tests). No audio code yet. |
| Dependencies that constrain design | None beyond React/Vite. `zustand` is installed but unused. No audio or analysis libraries. |
| Hosting | Azure Static Web Apps (static only), decided by Andrei. |

## Evidence gathered for this audit

A short probe was run in headless Chromium 153 (Linux, Playwright) on 2026-10-24. Scripts are in [`spikes/probe-chromium/`](../spikes/probe-chromium/). Only one engine was available, so every browser-specific claim about Firefox and Safari below remains **unverified**.

| Probe | Result in Chromium 153 |
|---|---|
| `decodeAudioData` on a 10 s stereo 44.1 kHz click track | WAV 16/24-bit and 32-bit float, FLAC, MP3 (LAME 320k), AAC in M4A, Ogg Vorbis, Opus: **decoded**. AIFF 16-bit and 24-bit: **failed** (`EncodingError`). ALAC in M4A: **failed**. |
| MP3 encoder delay | MP3 decoded to exactly 441,000 frames with the first click at 500.02 ms, identical to the WAV source. Chromium applies the LAME gapless header. Other engines may not (WebKit bug [228215](https://bugs.webkit.org/show_bug.cgi?id=228215) shows Safari returning extra frames before macOS Monterey). |
| Inter-deck alignment, offline render | Deck A click track at 124 BPM (rate 1), deck B at 120 BPM played at rate 124/120, both started from grid-computed offsets: maximum onset difference **1 sample (0.023 ms) over 256 beats (64 bars)**. |
| Seek restoration | Rendering deck B from transition beat 20.37 versus playing through from beat 0: residual −31.5 dB, fully explained by the half-sample (−0.484) quantization of the comparison, i.e. a timing difference of < 11 µs. A sample-exact null test is therefore the wrong pass criterion; timing must be compared with sub-sample onset or cross-correlation measures. |
| Gain ramp restored mid-ramp after seek | Same residual as without automation; the restored ramp value is consistent with continuous playback. |

## Audit

Classification: **Validated** (implementation or reliable evidence), **Feasible, unverified** (needs a prototype or test), **Needs revision** (inaccurate, incomplete, or likely to cause problems), **Deferred** (not needed for the MVP). Items are ordered so that those which could force an architectural rewrite come first.

### A. Browser audio architecture

**A1. Browser-only app, analysis on the user's machine, no server.** — _Feasible, unverified_ (partially validated)
1. Assumption: everything runs in the browser; no backend.
2. Concern: decoding, memory, and analysis load all land on the client; codec support varies by engine.
3. Consequence: if a core requirement cannot run client-side, a server would change hosting, privacy claims, and cost.
4. Resolution: keep browser-only. Every MVP requirement maps to native Web Audio nodes, a Web Worker for analysis, and IndexedDB. Nothing in the must-have list needs a server. Revisit only if spike S6 (analysis accuracy) fails and no client-side method closes the gap.
5. Verify: proof of concept (spike S1) on two engines; S2 decoding/memory matrix; S6 analysis accuracy.

**A2. "Supported: MP3, WAV, AIFF, FLAC (whatever the browser decodes)".** — _Needs revision_
1. Assumption: the browser decodes all four formats.
2. Concern: Chromium does not decode AIFF (validated above); Firefox support is unknown and likely absent; Safari is expected to decode it. AIFF is common in DJ libraries (store downloads, Rekordbox exports).
3. Consequence: a large share of the target users' files would fail on the primary browser.
4. Resolution: native `decodeAudioData` first; if it fails and the file is AIFF/AIFC with uncompressed PCM (`NONE`, `sowt`, `fl32`, `fl64`), decode it with a small in-house parser (~200 lines, no dependency). Compressed AIFC, ALAC, and other formats show a clear "not supported in this browser, convert to WAV/FLAC" message.
5. Verify: S2 matrix across Chromium, Firefox, WebKit; unit tests for the AIFF parser against ffmpeg-produced fixtures (16/24/32-bit, big- and little-endian, mono/stereo).

**A3. MP3 decoding is consistent across browsers.** — _Feasible, unverified_
1. Assumption: implicit; the brief assumes a track's timing is the same wherever it is decoded.
2. Concern: engines differ in whether they trim MP3 encoder delay and padding (Chromium does; Safari historically did not). A difference of ~1,105–2,257 samples (25–50 ms) shifts the whole beat grid.
3. Consequence: a downbeat corrected in one browser would be ~25–50 ms off in another; persisted corrections and exported plans would sound wrong.
4. Resolution: store `decodedFrames`, `sampleRate`, and the browser engine with each analysis. When a known track decodes to a different frame count, warn that the grid may be offset and offer a one-click re-check of "the 1". Exported plans reference bars, not seconds, so they survive.
5. Verify: S2 decodes the same LAME and non-LAME MP3s in all engines and records first-onset times.

**A4. Memory for decoded audio.** — _Needs revision_ (missing from v0.2)
1. Assumption: none stated.
2. Concern: `decodeAudioData` produces 32-bit float PCM at the context sample rate. A 7-minute stereo track at 48 kHz is ~161 MB; two 10-minute tracks are ~460 MB, plus the file bytes during decoding. Copying channel data to a worker for analysis doubles that if done naively.
3. Consequence: tab crashes or heavy swapping on 8 GB machines, especially with long extended mixes.
4. Resolution: hold only the two decoded `AudioBuffer`s in memory; release the file `ArrayBuffer` after decoding; send the analysis worker a downmixed mono copy at a reduced rate (e.g. 11,025 Hz: ~26 MB for 10 minutes) as a transferable buffer; set a provisional maximum track length of 15 minutes with a clear message beyond it.
5. Verify: S2 measures peak memory (`performance.measureUserAgentSpecificMemory` where available, otherwise the browser's task manager) for 2 × 10-minute tracks in each engine.

**A5. `AudioContext` lifecycle and autoplay.** — _Needs revision_ (missing from v0.2)
1. Assumption: none stated.
2. Concern: browsers start an `AudioContext` suspended until a user gesture; contexts can also become suspended or interrupted (device change, OS sleep, Bluetooth disconnect).
3. Consequence: silent playback, or a transport that believes it is playing while audio is stopped.
4. Resolution: create one `AudioContext` lazily and call `resume()` inside the first Play/Load gesture. Listen to `statechange`; whenever the context leaves `running` while the transport is playing, the transport moves to Paused at the beat computed from the last `currentTime`, and the user resumes explicitly.
5. Verify: integration test that suspends the context during playback and checks the transport state; manual test unplugging headphones in each engine.

**A6. `AudioBufferSourceNode` one-shot lifecycle.** — _Validated_ (spec behaviour) with a design consequence
1. Assumption: v0.2 says "sources are recreated on seek", which is correct.
2. Concern: a source cannot be restarted after `stop()`; `playbackRate` on this node is k-rate.
3. Consequence: pause, seek, replay, and variant switches must all create new sources.
4. Resolution: every start is "start at beat _b_": a pure function creates two new sources and schedules everything (D-05). Sources are cheap; the buffers are shared.
5. Verify: unit tests of the start function; integration test of 100 random seeks without drift (S1).

**A7. Scheduling accuracy versus UI timing.** — _Validated_ (offline, Chromium); _Feasible, unverified_ (real-time, other engines)
1. Assumption: v0.2 relies on `AudioParam` automation for sample accuracy.
2. Concern: correct for scheduled events; JavaScript timers and `requestAnimationFrame` are not timing sources.
3. Consequence: none if all audio changes are pre-scheduled on the audio clock.
4. Resolution: schedule all source starts and parameter changes on `AudioContext.currentTime`; never trigger audio changes from timers or frames.
5. Verify: offline-render tests in each engine; S1 real-time capture test.

**A8. Web Workers / AudioWorklet.** — _Validated_ for Workers; AudioWorklet _Deferred_
1. Assumption: analysis in a Web Worker; nothing about AudioWorklet.
2. Concern: AudioWorklet is only needed for custom DSP (time-stretching for key lock). Native nodes cover the MVP mixer.
3. Consequence: adding AudioWorklet early adds cross-browser and CSP complexity with no benefit.
4. Resolution: Web Worker for analysis and peak computation; no AudioWorklet in the MVP.
5. Verify: analysis of a 10-minute track does not block input for more than 50 ms (long-task observer).

### B. Audio engine and synchronized playback

**B1. "Transport owns the AudioContext clock; positions are transition beats."** — _Needs revision_ (incomplete)
1. Assumption: v0.2 says what the clock is, not how beat and clock time relate.
2. Concern: without an explicit anchor, pause/seek/resume accumulate error and visuals compute their own position.
3. Consequence: drift between decks after repeated seeks; visuals that disagree with audio.
4. Resolution: one authoritative mapping, the **playback anchor** `(ctxTime₀, beat₀)`, set on every start. `beat(t) = beat₀ + (t − ctxTime₀) · bpmA / 60`. Every audio schedule and every visual frame is derived from it (D-04).
5. Verify: unit tests for the mapping; S1 integration tests.

**B2. Pause/resume implementation.** — _Needs revision_
1. Assumption: v0.2 lists pause/resume as transport features without mechanism.
2. Concern: `AudioContext.suspend()` freezes the clock and would keep scheduled events valid, but it is asynchronous, affects the whole context, and gives a second code path to test.
3. Consequence: two ways to stop audio that can diverge.
4. Resolution: pause = record `beat(currentTime)`, fade out over 10 ms, stop sources, cancel automation. Resume = start at the recorded beat. Seek and replay use the same start function. One code path.
5. Verify: S1: pause/resume 50 times in a row and compare onset timing with uninterrupted playback (≤ 1 sample).

**B3. Behaviour when the tab is hidden.** — _Feasible, unverified_
1. Assumption: none stated.
2. Concern: `requestAnimationFrame` stops in hidden tabs and timers are throttled; audio keeps playing.
3. Consequence: none for audio if everything is pre-scheduled; visuals simply resume from the clock.
4. Resolution: no audio logic in timers or frames; on `visibilitychange` the next frame renders from the clock.
5. Verify: manual test in each engine: hide the tab for 30 s mid-transition, return, check mixer matches sound.

**B4. Tempo sync by playback rate; pitch.** — _Validated_ (mechanism); v0.2's threshold _Needs revision_
1. Assumption: B's `playbackRate = bpmA / bpmB`; warning above "~6%".
2. Concern: pitch shift is `12 · log₂(rate)` semitones: 3% ≈ 0.51 st, 6% ≈ 1.0 st. Percent is the wrong unit for a musical warning.
3. Consequence: users are not told that B is now roughly a semitone sharp, which matters for harmonic mixing.
4. Resolution: show B's pitch change in semitones; warn at ≥ 0.5 st (provisional). Rate stays constant for the whole playback session in the MVP; no tempo ramps (D-07).
5. Verify: unit test of the semitone formula; listening check.

### C. Tempo and beat-grid model

**C1. One BPM per track, constant tempo.** — _Feasible, unverified_ for the target genres; _Needs revision_ in precision
1. Assumption: one BPM and a first downbeat describe the track.
2. Concern: the grid error grows linearly with BPM error. At 124 BPM, a 0.1 BPM error drifts ~100 ms over 256 beats (64 bars); keeping drift under 10 ms needs an error under ~0.01 BPM. Live-played material (disco edits, a stated target genre) drifts regardless.
3. Consequence: long blends flam audibly even though the engine is sample-accurate.
4. Resolution: store BPM as a float with at least 3 decimals; estimate it by regression over the whole track, not by peak picking; let the user set **two** downbeats far apart so BPM is computed from them; show a "grid fit" indicator that flags drifting tracks. Variable-tempo grids are deferred (D-10).
5. Verify: S6 on a reference set; unit tests for two-point correction.

**C2. `firstDownbeatSec` as the grid's reference.** — _Needs revision_
1. Assumption: grid = BPM + position of the first downbeat.
2. Concern: users fix "the 1" wherever they hear it, often mid-track; tracks with a pickup or silence before the first beat make "first" ambiguous.
3. Consequence: awkward correction UX and negative bar numbers.
4. Resolution: grid = `{ bpm, anchorSec, beatsPerBar: 4, barOffset }`, where `anchorSec` is any downbeat and bar numbers are counted so that bar 1 is the first full bar at or after audio start. A separate `phraseOffsetBars` aligns the phrase grid (D-09).
5. Verify: unit tests: anchors set at various points yield identical grids.

**C3. Half/double BPM.** — _Needs revision_ (mechanics undefined)
1. Assumption: "halve/double BPM" as corrections.
2. Concern: doubling keeps every existing beat and adds one between; halving drops every other beat, which may drop the anchor's actual downbeat pairing.
3. Consequence: after halving, bar lines can land on the off-beat.
4. Resolution: both keep `anchorSec` as a downbeat; after halving, the UI prompts "check the 1" and offers a one-beat shift.
5. Verify: unit tests.

**C4. "Phrase markers every 8/16/32 bars".** — _Needs revision_ (wording) / brief promises
1. Assumption: v0.2 calls them phrase markers and the should-have list mentions phrase detection.
2. Concern: markers counted from bar 1 are a grid, not detected phrases; many tracks have intros of odd length.
3. Consequence: the UI would imply knowledge it does not have, against brief §10.
4. Resolution: call them the **phrase grid** (labelled _measured_ only in the sense of arithmetic on the beat grid, shown with an "assumes phrases start at bar N" note); user can shift it by bars. Detected sections (should-have, M4) are a separate _hypothesis_ layer.
5. Verify: copy review; UI shows the phrase-grid offset.

**C5. Bars and beats as the plan timebase.** — _Validated_ (design reasoning and M0 tests)
Plans in transition beats stay musically correct when a grid is corrected. Kept (D-08).

**C6. Time domains not separated in v0.2.** — _Needs revision_
Five clocks are in play and must not be mixed: audio-file time, track beat, bar:beat display position, transition beat, and `AudioContext` time (plus display time from `requestAnimationFrame`). Defined in brief v0.3 §4a and D-08.

### D. Audio processing and mixer

**D1. Signal chain order.** — _Needs revision_ (incomplete)
Chain fixed as: source (playback rate) → trim → 3-band EQ → filter → channel fader → crossfader gain → master gain (−6 dB headroom) → destination (D-11). v0.2 omitted headroom; two loud masters at full level sum to about +6 dBFS and clip at the output.

**D2. Shelving EQ "−∞/kill to +6 dB".** — _Needs revision_
1. Assumption: lowshelf / peaking / highshelf `BiquadFilterNode`s with a kill.
2. Concern: a shelving biquad cannot reach −∞; at its corner frequency it attenuates only half the dB amount; the Web Audio shelf has a fixed slope. A "bass kill" leaves audible upper bass, which undermines the bass-swap lesson.
3. Consequence: the most important action in the first strategy sounds muddy.
4. Resolution: an isolator-style EQ: crossover the signal into low/mid/high bands with cascaded Butterworth biquads (Linkwitz–Riley 4th order), one gain per band, summed. True kill at gain 0, flat sum at unity. Fallback: shelving EQ with a −40 dB floor if S3 shows the isolator is not flat enough or costs too much CPU (D-12).
5. Verify: S3: white noise through the EQ at unity, magnitude response flat within ±0.5 dB (provisional); low band at kill attenuates below 100 Hz by ≥ 40 dB.

**D3. Bipolar filter "bypassed at centre".** — _Needs revision_ (mechanism)
Switching nodes in and out of the graph during playback can click. Keep both a low-pass and a high-pass biquad permanently in the chain; at centre the low-pass sits at Nyquist and the high-pass at 10 Hz, which are effectively transparent; a ±2% dead zone avoids accidental filtering (D-13).

**D4. Units, ranges, curves.** — _Needs revision_ (undefined)
Defined in D-14: plan values are normalized control positions; mapping functions to dB/Hz/gain live once in `src/engine` and are used by the audio scheduler and the UI.

**D5. "No clicks when controls change".** — _Needs revision_ (untestable as written)
Steps become 5 ms ramps; starts/stops fade 10 ms; direct user changes use `setTargetAtTime` with a 10 ms time constant. Test: no sample-to-sample jump above a threshold in rendered output at event times (D-15).

**D6. Decorative versus functional animation.** — _Needs revision_ (missing)
Only control positions derived from the plan represent audio state. Meters derive from `AnalyserNode` (measured). Highlights and glows are decoration and never feed audio.

### E. Transition-plan model

**E1. Lanes of automation points with `step | linear | exp` curves.** — _Needs revision_
1. Assumption: `model.ts` stores per-control lanes of points.
2. Concern: no schema version, no initial state, no event identity for explanations, no way to express or detect conflicting ramps; `exp` is undefined in control space and `exponentialRampToValueAtTime` cannot reach 0.
3. Consequence: validation and explanations become ad hoc; plans are not versionable.
4. Resolution: a versioned plan of explicit **control events** (`set` or `ramp`, start/end in transition beats, target value, curve `step | linear | smooth`), an explicit initial state, a grid snapshot per deck, and annotations linked by id. A compiler turns it into per-control segments used by both audio and UI (D-16, D-17).
5. Verify: schema unit tests; property tests that `stateAt` is history-independent.

**E2. "Schedule with setValueAtTime / linearRamp / exponentialRamp".** — _Needs revision_
Non-linear mappings (fader taper, EQ curve, log-frequency filter) mean a linear ramp in parameter units is not a linear move of the knob. Scheduler samples each segment in control space, maps to parameter units, and schedules short `linearRampToValueAtTime` steps (e.g. every 1/32 beat), bounded mapping error ≤ 0.1 dB. Avoids `setValueCurveAtTime` overlap exceptions and `cancelAndHoldAtTime` (not available in all engines) (D-18).

**E3. Validation.** — _Needs revision_ (too thin)
Errors versus warnings defined in D-19.

### F. Audio and visual synchronization

**F1. "Drift stays under 5 ms over a 64-bar overlap".** — _Needs revision_
1. Assumption: one number covers sync.
2. Concern: it mixes engine scheduling (sub-millisecond, validated offline) with grid accuracy (dominated by BPM error, up to tens of ms) and visual timing (frame-quantized, latency-dependent).
3. Consequence: the test either always passes on synthetic input or always fails on real tracks, telling us nothing.
4. Resolution: four separately tested tolerances (D-20): engine inter-deck alignment ≤ 1 ms (synthetic, offline, every engine); automation timing ≤ one render quantum (128 frames ≈ 2.9 ms); grid accuracy on real tracks ≤ 10 ms at both ends of a 64-bar overlap after correction (provisional); visual state within one frame of the latency-compensated audio time (instrumented), and perceived A/V offset within ±40 ms (manual, provisional).
5. Verify: S1, S5, S6.

**F2. "Visual and audio within one frame".** — _Feasible, unverified_
Depends on `outputLatency` (Baseline 2025 per MDN, but values are estimates and Bluetooth adds 100–250 ms). Provide a manual visual-offset calibration. Verified in S5.

### G. Local persistence and privacy

**G1. IndexedDB keyed by fingerprint "SHA-256 of first and last MB plus size".** — _Needs revision_
Partial hashes can collide for different edits of the same track (same intro/outro) and still change when tags are edited. Use SHA-256 of the whole file (computed with `crypto.subtle` before decoding, since `decodeAudioData` detaches the buffer); when no exact match is found, offer to reuse data from a record with the same name and duration (user-confirmed) (D-22).

**G2. "Points survive reload".** — _Needs revision_
The browser cannot reopen a local file without user action. After reload the user re-selects the files; the app recognises them and restores grid, points, and variants. Persisting file handles (File System Access API) is Chromium-only and deferred (D-23).

**G3. Storage durability.** — _Needs revision_ (missing)
IndexedDB is best-effort and can be evicted (Safari may delete script-writable storage for sites not used for 7 days). Request `navigator.storage.persist()`, and make export/import of corrections, plans, and notes a first-class backup (D-24).

**G4. "Audio never leaves the user's machine".** — _Feasible, unverified_ → make it testable
True by design; enforce with CSP `connect-src 'self'` (already in `staticwebapp.config.json`) and an end-to-end test that records all network requests during a full session and asserts none carry audio or analysis. Note that the static host logs ordinary request metadata (IP, user agent) like any website.

### H. Dependencies

**H1. Zustand for state.** — _Needs revision_ (unjustified)
Installed but unused. The hot path bypasses React anyway; UI state is small. Remove; use React state plus a ~30-line external store with `useSyncExternalStore` for transport (D-26).

**H2. `idb`.** — _Feasible_, optional. Small (ISC, maintained) wrapper; acceptable, or a 50-line in-house wrapper. Decide when persistence is built.

**H3. Own analysis, no AGPL/GPL libraries.** — _Validated_ as a licensing decision; accuracy _Feasible, unverified_ (S6). Own radix-2 FFT in the worker; no FFT dependency.

**H4. Testing Web Audio.** — _Needs revision_
Vitest runs in Node, which has no Web Audio. DSP and engine integration tests run in real browsers through Playwright (`OfflineAudioContext` in page), on Chromium and Firefox in CI. Playwright WebKit on Linux is **not** Safari (different media stack); Safari needs a manual check on macOS before the pilot (D-27).

### Deferred, with reasons

| Capability | Why deferred |
|---|---|
| Key lock (time-stretch) | Needs AudioWorklet + WASM DSP; MVP works with pitch-coupled tempo sync and shows the pitch change. |
| Variable-tempo grids | Needs beat tracking with tempo curves and a different time mapping; constant-grid + correction covers the target genres except live-played edits, which are flagged. |
| Tempo ramps during playback | Requires integrating position over a changing rate; constant rate per session is enough for one transition. |
| Persistent file handles | Chromium-only API with permission prompts; re-selecting files is acceptable for the MVP. |
| Limiter on master | Browser `DynamicsCompressorNode` behaviour is loosely specified and colours A/B comparisons; −6 dB headroom plus a clip indicator instead. |
| AudioWorklet | No MVP requirement needs custom DSP. |
