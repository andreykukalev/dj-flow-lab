# Technical spikes

- **Status:** v0.3, 2026-10-24
- **Purpose:** resolve the highest-risk technical assumptions with small, time-boxed experiments before full implementation. Decisions referenced as D-xx are in [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md); risks as R-xx in [RISKS.md](RISKS.md).
- **Rule:** spike code lives in `spikes/<name>/` and is not product code. What survives is the decision, the measurements, and any test that is worth keeping.

## Priority order

| # | Spike | Why it is first-tier | Time-box |
|---|---|---|---|
| S1 | Dual-deck engine: anchor, sync, seek, automation (the proof of concept core) | Could force an engine rewrite | 3 days |
| S8 | Browser audio testing in CI | S1–S3 results are only trustworthy if they run on two engines automatically | 0.5 day (done inside S1) |
| S2 | Decoding matrix, MP3 offsets, memory | Could exclude common files or crash tabs | 1 day |
| S3 | Mixer DSP: isolator EQ, filter sweeps, declicking, headroom | Decides D-12/D-13/D-14 | 1.5 days |
| S5 | Visual sync and output latency | Decides D-21 and calibration UX | 1 day |
| S6 | BPM and downbeat accuracy on real tracks | Decides how much correction UX the MVP needs | 3 days |
| S7 | Storage durability and track identity | Data loss risk, low rewrite risk | 0.5 day |

S1, S3, and S5 together form the **proof of concept** below.

---

## Proof of concept (S1 + S3 + S5)

**Goal:** show that two local tracks can be played as one deterministic, seekable transition, with the virtual controller locked to the audio, on two browser engines. No product UI, no analysis, no persistence, no AI.

**Inputs:** two local audio files chosen with a file input; BPM and "the 1" typed in or adjusted with nudge buttons (no automatic analysis needed).

**Must demonstrate:**
1. Corrected BPM and downbeat for both tracks (typed values, nudge ±1 ms / ±0.01 BPM, two-point BPM from two downbeats).
2. A shared transition timeline in beats, with the anchor mapping (D-04).
3. Both decks playing beat-aligned with deck B rate-matched to A.
4. A hard-coded long-blend plan (written as `TransitionPlanV1` data, not code) with a bass swap on the low EQ at the handoff bar.
5. A filter ramp (high-pass on A over the 8 bars before the handoff).
6. Play, pause, resume, seek (click on a bar ruler), and replay from 8 bars before the exit.
7. Correct control state after any seek, including seeks into the middle of a ramp.
8. A minimal SVG mixer (faders, 3 EQ knobs, filter knob per deck, crossfader) driven only by `stateAt(beat(heardTime))`.
9. Running on Chromium and Firefox; Safari checked manually if a Mac is available.

### Pass/fail criteria

| # | Criterion | Method | Pass |
|---|---|---|---|
| P1 | Inter-deck alignment | Offline render, synthetic click tracks 124 vs 120 BPM, 64 bars | ≤ 1 ms max onset offset, both engines |
| P2 | Seek determinism | 100 random seeks then play 8 bars; compare onsets and envelopes with play-through | Onsets ≤ 1 sample; control values = `stateAt` within 1e-4 |
| P3 | Pause/resume | 50 pause/resume cycles during the overlap | No cumulative offset (≤ 1 sample vs uninterrupted) |
| P4 | Bass swap timing | Offline render; low-band (< 120 Hz) envelope of each deck | Crossing within one render quantum of the handoff downbeat (+5 ms declick) |
| P5 | Filter ramp | Offline render; spectral centroid over the ramp | Monotonic, no zipper noise audible in listening check, no sample jumps above D-15 threshold |
| P6 | Declicking | Offline render around every step, seek, start, stop | No discontinuity above the D-15 threshold |
| P7 | Controller sync | In-page frame log: for each frame, rendered values vs `stateAt(beat(heardTime))` | Exact match every frame; frame-to-frame jitter in beat ≤ one frame |
| P8 | Interruption | Suspend the context mid-transition; hide the tab for 30 s; resume | Transport shows Paused at the right beat; on resume audio and mixer agree |
| P9 | Real-time listening check | Two real house tracks, wired headphones, both engines | No audible flam after correction over a 32-bar overlap; bass swap audibly clean; mixer motion feels in time |
| P10 | Two engines | All automated checks run in CI on Chromium and Firefox | Green on both |

**Fail handling:** any of P1–P4 failing in one engine → investigate engine-specific behaviour before continuing; P1/P2 failing in both → revisit D-04/D-05 (architecture risk R-01). P9 failing because of grid accuracy, not engine timing → record for S6, not a PoC failure.

**Time-box:** 5 days in total (S1 3 days, S3 and S5 one day each, overlapping).

---

## S1 — Dual-deck engine: anchor, sync, seek, automation

- **Question:** can a single anchor on the `AudioContext` clock, with "start at beat _b_" for every transport action, keep two rate-adjusted decks and all automation deterministic through pauses and seeks, in Chromium and Firefox?
- **Minimal implementation:** `spikes/engine/`: `time.ts` (D-08/D-09), `compile.ts` + `stateAt` (D-17), `scheduler.ts` (D-18) driving plain `GainNode`s (EQ can be a stub in S1), `transport.ts` with `startAt(beat)`, `pause()`, `stateAt` for UI. A test page that builds synthetic decks in memory.
- **Test procedure:** Playwright, in-page `OfflineAudioContext` for P1–P4 and P6; real-time `AudioContext` with an `AudioWorklet`-free capture (`MediaStreamAudioDestinationNode` + `MediaRecorder`, or an `AnalyserNode` poll) for a smoke check that real-time playback matches offline timing within 1 render quantum.
- **Pass/fail:** P1–P4, P6, P10.
- **Time-box:** 3 days.
- **Decision:** confirm D-04, D-05, D-18; set the scheduling lead and fade lengths.

## S8 — Browser audio testing in CI

- **Question:** can GitHub Actions run `OfflineAudioContext` and real-time `AudioContext` tests headless on Chromium and Firefox reliably?
- **Minimal implementation:** a Playwright project per engine; a page that renders 1 s of a 1 kHz sine through a gain ramp and returns the envelope; Chromium launched with `--autoplay-policy=no-user-gesture-required`; Firefox with `media.autoplay.default=0`.
- **Test procedure:** run 20 times in CI.
- **Pass/fail:** offline tests pass 20/20 on both engines; real-time smoke test passes ≥ 19/20 (otherwise real-time checks stay manual).
- **Time-box:** 0.5 day.
- **Decision:** which integration tests are automated per engine; whether WebKit runs in CI at all (only as a smoke test, never as a stand-in for Safari).

## S2 — Decoding matrix, MP3 offsets, memory

- **Question:** which file types decode in each engine; do engines agree on MP3 timing; what is the peak memory for two long tracks?
- **Minimal implementation:** reuse [`spikes/probe-chromium/`](../spikes/probe-chromium/) (already run on Chromium 153, results in the audit); extend to Firefox and WebKit; add MP3s from LAME with and without the gapless header, and from another encoder; add 10-minute files; prototype the AIFF parser.
- **Test procedure:** decode each file in each engine; record success, frame count, first-onset time; measure memory after loading 2 × 10-minute 48 kHz stereo tracks and after analysis hand-off.
- **Pass/fail:**
  - AIFF 16/24-bit decodes everywhere via native or fallback path.
  - MP3 first-onset times agree across engines within 1 ms, **or** the difference is detected by frame count so D-24's warning can trigger.
  - Two 10-minute tracks load without a crash on an 8 GB machine in each engine; peak tab memory recorded.
- **Time-box:** 1 day.
- **Decision:** supported-format list and messages (D-03); maximum track length; whether the frame-count warning is sufficient.

## S3 — Mixer DSP

- **Question:** does the isolator EQ sum flat and kill cleanly; are filter sweeps clean; are the mapping curves usable; is −6 dB master headroom enough?
- **Minimal implementation:** the D-11 chain with D-12/D-13/D-14 mappings; a test page rendering white noise and sine sweeps offline; a listening page with two real tracks.
- **Test procedure:** magnitude response at unity (FFT of rendered white noise, averaged); kill depth per band; filter sweep over 8 bars at several speeds (sample-jump check + listening); true-peak of two loud masters overlapping at full faders.
- **Pass/fail:** unity response flat within ±0.5 dB 20 Hz–18 kHz; low kill ≥ 40 dB below 100 Hz; mid/high kill ≥ 30 dB in band centre; no audible zipper or instability in sweeps in either engine; summed peak ≤ 0 dBFS on 4 of 5 loud test pairs.
- **Time-box:** 1.5 days.
- **Decision:** isolator vs shelving (D-12); crossover frequencies; filter Q; fader taper; headroom value.

## S5 — Visual sync and output latency

- **Question:** can the controller show the state of what is being heard, within a frame, across engines and output devices?
- **Minimal implementation:** the PoC mixer plus a frame logger; a "flash on beat" test mode (screen flash + click) for manual A/V offset judgement.
- **Test procedure:** log `getOutputTimestamp`, `outputLatency`, `baseLatency` per engine; check P7; manual A/V judgement with wired output and with Bluetooth headphones; hide/show tab; seek while paused.
- **Pass/fail:** P7 and P8 pass; perceived offset within ±40 ms with wired output without calibration; with Bluetooth, within ±40 ms after one calibration step.
- **Time-box:** 1 day.
- **Decision:** latency source order and calibration UI (D-21).

## S6 — BPM and downbeat accuracy

- **Question:** how accurate is the in-house analysis on the target genres, and how much correction does a user need?
- **Minimal implementation:** worker pipeline from D-25; a reference set of 20 tracks across house, deep house, disco house, progressive house, melodic house, progressive trance, trance (hand-annotated BPM to 0.01, downbeat, phrase start). Audio stays local to whoever runs the spike; only annotations are committed, plus CC-licensed tracks where available.
- **Test procedure:** run analysis; compare with annotations; measure drift over 64 bars from a grid anchored at the start; time the correction workflow for failures.
- **Pass/fail:** BPM within 0.02 on ≥ 16/20; downbeat within 15 ms on ≥ 14/20; grid-fit score flags every hand-identified drifting track; correction of a failed track (two-point method) takes ≤ 60 s.
- **Time-box:** 3 days.
- **Decision:** whether the analysis is good enough to be a default, or the MVP leads with a "tap/set the 1" flow and treats analysis as a suggestion; threshold for the drift warning (D-10).

## S7 — Storage durability and track identity

- **Question:** do corrections survive normal use; how often does the fingerprint change for "the same track"?
- **Minimal implementation:** IndexedDB store per D-24; `navigator.storage.persist()`; export/import of corrections.
- **Test procedure:** per engine: save, reload, clear-site-data, quota-exceeded simulation; edit an MP3's tags with a tag editor and reload.
- **Pass/fail:** reload restores corrections in all engines; quota errors produce a message and export offer; a tag-edited file is offered the name+duration match.
- **Time-box:** 0.5 day.
- **Decision:** fingerprint strategy (D-22); whether to hash only the audio payload in a later version.
