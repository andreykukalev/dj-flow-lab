# Technical spikes

- **Status:** v0.3, 2026-10-24; proof of concept passed 2026-10-25 (#46)
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
| S9 | AI explainer grounded in outcome facts (brief v0.4) | Decides whether the explainer is trustworthy enough for beginners | 1 day |

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

### Result (2026-10-25, #46): passed

- **P1–P8 and P10:** green in CI on Chromium and Firefox (S1 #42, S3 #44, S5 #45), except P1 on Firefox, which misses 1 ms by the resampler drift (≤ 1.5 ms over 64 bars, D-07). The drift is accepted at the gate (see D-07).
- **P9 (listening check, Andrei, deployed PoC page):** two of his own tracks loaded, gridded by hand and mixed with the long blend. "Concept works … not perfectly, but overall mechanic works." No flam, bass or sync problem was reported. Wired versus Bluetooth, the browser used and a calibration offset were not reported, so the ±40 ms perceived-offset criterion (S5) has no number yet and is rechecked in the M2 listening check.
- **What was not right was musical, not technical.** The phrases the transition used were technically correct but did not live well together. The PoC places the exit at the last phrase line that leaves 40 bars of A and enters B at bar 1, which says nothing about whether those moments belong together. This is the brief's first risk ("technically correct, musically weak") observed on the first real pair, and it is the reason for brief v0.4: choosing the moment becomes the centre of the product.
- **Safari:** not checked (no Mac in the session); stays open for P10's Tier 2 checklist.
- **Decision:** the architecture holds (D-04, D-05, D-17, D-18, D-21 at their stated confidence). M1 proceeds on this engine. No M1 issue changes because of the gate; the product refocus changes M2 onwards ([backlog.md](backlog.md)).

---

## S1 — Dual-deck engine: anchor, sync, seek, automation

- **Question:** can a single anchor on the `AudioContext` clock, with "start at beat _b_" for every transport action, keep two rate-adjusted decks and all automation deterministic through pauses and seeks, in Chromium and Firefox?
- **Minimal implementation:** `spikes/engine/`: `time.ts` (D-08/D-09), `compile.ts` + `stateAt` (D-17), `scheduler.ts` (D-18) driving plain `GainNode`s (EQ can be a stub in S1), `transport.ts` with `startAt(beat)`, `pause()`, `stateAt` for UI. A test page that builds synthetic decks in memory.
- **Test procedure:** Playwright, in-page `OfflineAudioContext` for P1–P4 and P6; real-time `AudioContext` with an `AudioWorklet`-free capture (`MediaStreamAudioDestinationNode` + `MediaRecorder`, or an `AnalyserNode` poll) for a smoke check that real-time playback matches offline timing within 1 render quantum.
- **Pass/fail:** P1–P4, P6, P10.
- **Time-box:** 3 days.
- **Decision:** confirm D-04, D-05, D-18; set the scheduling lead and fade lengths.

- **Result (2026-10-24, #42):** run locally on headless Chromium 153 and Firefox (Playwright 1.63), 44.1 kHz, three times each; the same tests run in CI. The engine lives in `src/audio/` (`mixerGraph.ts`, `scheduler.ts`, `transport.ts`) rather than `spikes/engine/`, because it passed. The scenarios are in [`harness/engine.ts`](../harness/engine.ts) and the assertions in [`tests/audio/engine.spec.ts`](../tests/audio/engine.spec.ts). Synthetic decks: smooth 0.8 ms pulses on every beat (one-sample clicks lose their shape through resampling and the isolator), plus tones for level checks.

  | # | Chromium | Firefox |
  |---|---|---|
  | P1 inter-deck alignment, 64 bars, 124 vs 120 BPM | **0.006 ms** | **1.215 ms raw**; 0.002 ms after removing the resampler error below |
  | P2 100 random seeks, then 8 bars (3 seeds) | onsets ≤ 0.38 sample; parameters = `stateAt` within 5.3e-6; tone levels ≤ 1.3e-4 | deck A ≤ 0.59 sample; deck B 11.7 samples raw (accumulated drift in the play-through), ≤ 0.25 sample corrected; tone levels ≤ 7.3e-5 (parameter reads not possible, see below) |
  | P3 50 pause/resume cycles | ≤ 0.04 sample | deck A ≤ 0.10 sample; deck B ≤ 0.29 sample corrected |
  | P4 bass swap crossing vs handoff downbeat | +3.2 ms (limit 2.9 + 5 ms) | +3.2 ms |
  | P6 largest sample step / allowed | 0.081 / 0.088 | 0.081 / 0.088 |
  | Real-time, onsets vs anchor | exact (≤ 0.0001 ms) apart from whole-quantum jitter of the capture's timestamps | same |

  - **Firefox rounds the output rate of a resampled source to whole hertz.** Deck B at rate 124/120 plays at 44100/42677 instead of 44100/42677.42, which is 9.8 ppm fast, so it drifts linearly from the moment its source starts. The prediction matches the measurement (1.217 vs 1.215 ms over 64 bars), and the drift disappears for a tempo where 44100/rate is a whole number. The worst case is about 12 ppm: ≤ 0.8 ms over a 32-bar overlap, ≤ 1.5 ms over 64 bars. Every seek or resume restarts the source and resets the drift. Chromium plays the exact rate.
  - **Biquad `Q` is in dB for low-pass and high-pass filters** in Web Audio (a plain ratio for all-pass). The first run used linear Q = 0.707 as dB, which resonated (+3 dB at 100 Hz). The mixer now converts.
  - **Firefox has no `OfflineAudioContext.suspend()`.** Transport actions take an explicit context time (default: now), so tests script a whole session before rendering. Reading parameter values mid-render (P2's direct `stateAt` check) is Chromium-only. Firefox is checked through tone levels instead, which are within 1e-4 of the play-through. Biquad history during a filter sweep sets the floor of that check at about 1e-4.
  - **P4:** the +3.2 ms is the 5 ms declick (crossing near its midpoint) plus the low-band filters' group delay. It is the same in both engines.
  - **Decisions:** D-04, D-05 and D-18 are confirmed, with a 30 ms scheduling lead, a 10 ms transport gate fade, a 5 ms step declick and 1/32-beat ramp sampling. P1 passes on Chromium. On Firefox it fails as written (≤ 1 ms over 64 bars) because of the resampler rounding; how to handle that is open (see D-07 and R-22) and goes to the PoC gate (#46).

## S8 — Browser audio testing in CI

- **Question:** can GitHub Actions run `OfflineAudioContext` and real-time `AudioContext` tests headless on Chromium and Firefox reliably?
- **Minimal implementation:** a Playwright project per engine; a page that renders 1 s of a 1 kHz sine through a gain ramp and returns the envelope; Chromium launched with `--autoplay-policy=no-user-gesture-required`; Firefox with `media.autoplay.default=0`.
- **Test procedure:** run 20 times in CI.
- **Pass/fail:** offline tests pass 20/20 on both engines; real-time smoke test passes ≥ 19/20 (otherwise real-time checks stay manual).
- **Time-box:** 0.5 day.
- **Decision:** which integration tests are automated per engine; whether WebKit runs in CI at all (only as a smoke test, never as a stand-in for Safari).
- **Result (2026-10-24, #41):** run locally in the Linux container used for development (headless Chromium 153 and Firefox from Playwright 1.63), `--repeat-each=20`, no retries.
  - Offline tests (gain-ramp envelope, sample-accurate source start): **20/20 on both engines**.
  - Real-time smoke test: **20/20 on Chromium** with no audio device (Chromium uses a fake output). **Firefox keeps the `AudioContext` suspended when there is no audio output device**, even after a real click; with a PulseAudio null sink it passes **20/20**. With PulseAudio running, Chromium's clock stalled after one buffer, so the null sink is set up only for the Firefox CI job.
  - **Decision:** offline and real-time tests are automated on Chromium and Firefox in CI (one job per engine). WebKit is not run in CI yet.

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

- **Result (2026-10-24, #43):** headless Chromium 153 and Firefox (Playwright 1.63), Linux. Fixtures are 0.5 s, 44.1 kHz stereo files generated by [`tests/fixtures/decode/make.sh`](../tests/fixtures/decode/make.sh) and committed (1.7 MB). The checks are in [`tests/audio/decode.spec.ts`](../tests/audio/decode.spec.ts) and run in CI on both engines.

  | File | Chromium | Firefox | Notes |
  |---|---|---|---|
  | WAV 16/24-bit, 32-bit float | native | native | |
  | AIFF 8/16/24/32-bit, AIFF-C `sowt`/`fl32`/`fl64`, mono and stereo | **fallback** | **fallback** | Native decoding fails in both. The in-house parser ([`src/audio/aiff.ts`](../src/audio/aiff.ts)) matches the WAV of the same bit depth exactly (16-bit: within 1 LSB). |
  | FLAC (24-bit) | native | native | identical to the 24-bit WAV |
  | MP3, LAME with gapless header | native | native | first onset +0.002 ms vs WAV, 22050 frames (exact) |
  | MP3, LAME without header | native | native | +25.06 ms, 24192 frames, the same in both |
  | MP3, Shine encoder | native | native | +11.96 ms, 21359 frames, the same in both |
  | AAC (M4A) | native | native | onset within 0.001 ms |
  | ALAC (M4A) | **fails** | **fails** | not decodable; conversion advice |
  | Ogg Vorbis | native | native | onsets agree; Chromium returns 21922 frames, Firefox 22050 |
  | Opus | native | native | onsets agree; Chromium 22049 frames, Firefox 22050 |

  - **MP3 timing agrees across engines to within 0.003 ms** for every encoder tested. Encoder priming without a gapless header shifts the onset by the same amount in both engines, and it shows in the decoded frame count. For Vorbis and Opus the engines trim the end differently: frame counts differ while timing is identical. A frame-count check across engines would therefore raise false alarms for those formats (see D-24).
  - **Memory, 2 × 10-minute 48 kHz stereo WAV** ([`spikes/decode-memory/measure.mjs`](../spikes/decode-memory/measure.mjs), whole-browser resident memory above an idle tab):

    | | Chromium | Firefox |
    |---|---|---|
    | peak (while decoding the second track) | +1014 MB | +688 MB |
    | after both decodes, file bytes released | +738 MB | +492 MB |
    | with the analysis hand-off (mono, 11 kHz) | +755 MB | +690 MB |
    | decode time, both tracks | 9.1 s | 25.0 s |

    Two decoded tracks are 2 × 230 MB of float samples, and the rest is decoder working memory. Both engines stay below 1.1 GB over an idle browser, well within an 8 GB machine. Firefox decodes about 2.7× slower, so the loading UI needs progress feedback.
  - **WebKit:** not run. Playwright's Linux WebKit needs GTK 4 and GStreamer, and its media stack is not Safari's. Safari stays a Tier 2 manual check (D-27).
  - **Decisions:** D-03 (supported formats, messages, 15-minute limit) and D-24 (frame-count check for MP3 only) updated.

## S3 — Mixer DSP

- **Question:** does the isolator EQ sum flat and kill cleanly; are filter sweeps clean; are the mapping curves usable; is −6 dB master headroom enough? (It was not; see the result.)
- **Minimal implementation:** the D-11 chain with D-12/D-13/D-14 mappings; a test page rendering white noise and sine sweeps offline; a listening page with two real tracks.
- **Test procedure:** magnitude response at unity (FFT of rendered white noise, averaged); kill depth per band; filter sweep over 8 bars at several speeds (sample-jump check + listening); true-peak of two loud masters overlapping at full faders.
- **Pass/fail:** unity response flat within ±0.5 dB 20 Hz–18 kHz; low kill ≥ 40 dB below 100 Hz; mid/high kill ≥ 30 dB in band centre; no audible zipper or instability in sweeps in either engine; summed peak ≤ 0 dBFS on 4 of 5 loud test pairs.
- **Time-box:** 1.5 days.
- **Decision:** isolator vs shelving (D-12); crossover frequencies; filter Q; fader taper; headroom value.

- **Result (2026-10-24, #44):** headless Chromium 153 and Firefox (Playwright 1.63), 44.1 kHz, offline renders of the real mixer graph, scheduler and transport. Scenarios in [`harness/dsp.ts`](../harness/dsp.ts), assertions in [`tests/audio/dsp.spec.ts`](../tests/audio/dsp.spec.ts), both run in CI on both engines.

  | Check | Criterion | Chromium | Firefox |
  |---|---|---|---|
  | Unity response, 20 Hz–18 kHz (impulse, single-bin DFT at 1/12 octave) | ±0.5 dB | +0.22 / −0.00 dB | +0.22 / −0.00 dB |
  | Low kill, every Hz from 20 to 100 Hz | ≥ 40 dB | ≥ 40.5 dB (72 dB at 40 Hz) | ≥ 40.5 dB |
  | Mid kill at band centre (1012 Hz) | ≥ 30 dB | 34.4 dB | 34.4 dB |
  | High kill at band centre (8 kHz) | ≥ 30 dB | 35.4 dB | 35.4 dB |
  | Filter sweeps (low-pass and high-pass, out and back over 8 bars, 1 bar, 1 beat): largest sample step / allowed | ≤ D-15 threshold | 0.159 / 0.172 | 0.159 / 0.172 |
  | Same sweeps: energy above 8 kHz from tones below 3 kHz (zipper noise) | ≤ −60 dBFS (provisional) | ≤ −122 dBFS | ≤ −64 dBFS (fastest low-pass sweep) |
  | Spectral centroid over an 8-bar sweep (third-octave multi-tone) | monotonic | yes, within 1% (the high-pass resonance dips it slightly at the start) | same |
  | Two loud masters (−9 dBFS RMS), full faders, crossfader centred, beat-aligned, 8 bars: master true peak | ≤ 0 dBTP on 4 of 5 pairs | 5 of 5, −2.2 to −1.6 dBTP | 5 of 5, −2.5 to −2.0 dBTP |
  | Long-blend plan with very loud masters (−5.5 dBFS RMS) | ≤ 0 dBTP | 5 of 5, ≤ −3.2 dBTP | 5 of 5, ≤ −3.0 dBTP |
  | Very loud masters at full faders (recorded only) | none | −0.1 to +0.7 dBTP | −0.5 to +0.3 dBTP |
  | Render cost, whole PoC plan (93 s, two decks) | | 72× real time | 83× real time |

  - **The loud masters are synthetic** (kick on every beat, off-beat bass, hats, pad, soft-clipped to a −0.3 dBFS sample peak), generated in [`harness/dsp.ts`](../harness/dsp.ts). Real tracks are checked by ear and on the clip indicator in P9.
  - **Headroom: −6 dB was not enough.** At −6 dB, two loud masters at full faders reached +0.9 to +1.6 dBTP, and very loud ones +2.9 to +3.9 dBTP. Two things add up: beat-aligned kicks peak together, and the isolator's phase shift raises the peaks of limited material by about 2 dB per deck, even at unity. The master is now −9 dB (D-11). The bass swap keeps one low band out at a time, which is why the long blend has 3 dB more room than the full-fader case.
  - **Crossovers moved from 250 Hz / 2.5 kHz to 320 Hz / 3.2 kHz.** At 250 Hz the low kill was 32 dB at 100 Hz and reached 40 dB only up to 78 Hz. 300 Hz / 3 kHz gave 38 dB at 100 Hz. Mid and high kills stay above 34 dB either way (D-12).
  - **Neither filter rests at its exact pass-through.** Firefox switches the low-pass to a pass-through at exactly Nyquist, and sweeps leaving or reaching Nyquist clicked (step 0.28 against 0.17 allowed). Chromium does the same for a high-pass at 0 Hz (−62 dBFS click). The rest positions are now 0.95 × Nyquist and 5 Hz. The old 10 Hz rest lifted 20 Hz by 0.6 dB with Q 0.9 (D-13).
  - **Firefox drops a parameter's `.value` when automation is cancelled at the same time.** The transport cancelled automation at the start time, so on the first start Firefox's filters ran at their default 350 Hz for one render block and rang at up to 3× the signal. The transport now sets every parameter again after cancelling (D-15). The S1 tests did not catch this: their tones were levels after 1 beat, and the click check used signals the transient barely excited.
  - **Firefox recomputes biquad coefficients less often during automation**, so sweeps leave more zipper energy than in Chromium (−64 against −122 dBFS at worst). Both are far below the music, and no sweep exceeds the sample-step threshold.
  - **Not decided by measurement:** filter Q (0.9), fader taper (p²) and the EQ curve above unity. They are set by ear in the listening check (P9), with the PoC page.
  - **Decisions:** D-11 (−9 dB master), D-12 (isolator confirmed, 320 Hz / 3.2 kHz), D-13 (rest positions), D-15 (re-set after cancelling) updated; R-09 updated.

## S5 — Visual sync and output latency

- **Question:** can the controller show the state of what is being heard, within a frame, across engines and output devices?
- **Minimal implementation:** the PoC mixer plus a frame logger; a "flash on beat" test mode (screen flash + click) for manual A/V offset judgement.
- **Test procedure:** log `getOutputTimestamp`, `outputLatency`, `baseLatency` per engine; check P7; manual A/V judgement with wired output and with Bluetooth headphones; hide/show tab; seek while paused.
- **Pass/fail:** P7 and P8 pass; perceived offset within ±40 ms with wired output without calibration; with Bluetooth, within ±40 ms after one calibration step.
- **Time-box:** 1 day.
- **Decision:** latency source order and calibration UI (D-21).

- **Result (2026-10-25, #45):** headless Chromium and Firefox (Playwright 1.63) on a running AudioContext: Chromium with its fake audio output, Firefox on a PulseAudio null sink, 44.1 kHz. The proof-of-concept page ([`/poc/`](../poc/index.html), [`src/poc`](../src/poc)) plays the long-blend plan on two generated demo tracks (124 and 122.5 BPM) with the Try screen's mixer ([`src/ui/mixer`](../src/ui/mixer)) driven by the controller loop ([`src/ui/controller/loop.ts`](../src/ui/controller/loop.ts)). Assertions in [`tests/controller/controller.spec.ts`](../tests/controller/controller.spec.ts), run in CI on both engines.

  | Check | Criterion | Chromium | Firefox |
  |---|---|---|---|
  | P7: frames where the mixer's DOM differs from `stateAt(beat(heardTime))`, 5 s across the bass swap | 0 | 0 of 310 | 0 of 314 |
  | P7: frame-to-frame jitter of the heard beat against the frame clock | ≤ one frame (16.7 ms) | ≤ 0.1 ms typical, ≤ 6.7 ms in 12 runs | ≤ 3.9 ms |
  | Latency source; reported base + output latency; heard time behind `currentTime` | | output timestamp; 10 + 32 ms; 34–38 ms | output timestamp + reported latency; 0 + 31–36 ms; 30–39 ms |
  | P8: context suspended mid-transition | Paused at the right beat | paused at exactly the beat rendered at suspension; resumed from it; 0 mismatching frames after | same |
  | P8: no frames for 3 s (as in a hidden tab), then the next frame | matches the sound | 6.2 beats further on (3 s at 124 BPM), 0 mismatching frames | same |
  | Ring and caption on a control two bars before it moves | | shown ("kill at 25", "full at 25") | same |

  - **Chromium's output timestamp includes the output latency.** Its `contextTime` is `currentTime` minus about 40 ms (base 10 + output 32 ms), and its `performanceTime` is within one audio callback of `performance.now()`. Carried forward to the frame time, it moves smoothly. Chromium's `currentTime` moves in steps of 8.7 and 20.3 ms, which is why it is not the first source.
  - **Firefox's output timestamp does not.** It returns `currentTime − outputLatency` together with `performance.now() − outputLatency`, both taken at the call. Carried forward, it lands on `currentTime`, so the mixer ran 31 ms early, and it moves in the steps of the audio callback: one frame in ten moved 0 or 21 ms, a jitter of 18 ms. Two fixes, both engine-neutral. When the timestamp, carried forward to the moment of reading, lags `currentTime` by less than half the reported latency, the reported latency is subtracted from it. And a heard clock smooths frame to frame: it predicts each frame from the last, corrects 15 % of the difference, and follows a jump over 50 ms or a gap over 250 ms at once ([`src/audio/clock.ts`](../src/audio/clock.ts)).
  - **One Chromium run showed a single 55 ms jump** in about 15 runs, and it did not come back in 12 later runs. The controller follows the audio clock by design, so the test allows a jump over one frame only where `currentTime` itself jumped or stalled, and records it.
  - **React is not on the per-frame path.** React renders the mixer once; a renderer writes only the SVG attributes and styles that changed, and every control carries the value it shows in `data-value`, which the frame log reads back.
  - **Not covered by the automated checks:**
    - The perceived offset on real outputs. A headless engine reports a latency, but there is no speaker to measure it against. The ±40 ms criteria (wired without calibration, Bluetooth after one calibration step) are checked by hand on the PoC page: turn on *Flash on beat*, compare the flash with the kick, and adjust *Offset* until they agree. To do with the P9 listening session (#46).
    - A real hidden tab for 30 s. The test stops the frame loop for 3 s, which is the same gap a hidden tab makes, because headless browsers do not throttle background tabs reliably. The 30 s check is manual.
  - **Decision (D-21):** source order output timestamp (with the correction above), then `currentTime − (outputLatency + baseLatency)`, then `currentTime − baseLatency`, smoothed by the heard clock. Calibration is one offset in milliseconds (positive = heard later), checked with *Flash on beat*. The PoC page has both; #19 moves the offset to Settings.

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

## S9 — AI explainer grounded in outcome facts _(brief v0.4)_

- **Question:** can a language model, given only a pairing's outcome facts, explain what the listener hears and why, correctly enough for beginners, without inventing facts?
- **Minimal implementation:** the outcome-facts JSON for a reference set of 20 pairings on 5 track pairs (half that work, half that do not, for different reasons: phrases misaligned, breakdown against a peak, a downbeat moved by a beat, a long bass clash, a key clash); a fixed system prompt; a script that calls the model through the same proxy shape the app will use. Andrei writes a short expert explanation for each pairing. Only facts and explanations are committed, never audio.
- **Test procedure:** generate an explanation per pairing three times; Andrei rates each against his own (right / partly / wrong) blind to which run it is; check every claim against the facts; time and cost per explanation.
- **Pass/fail:** ≥ 16/20 rated right, none rated wrong in more than one of three runs; no claim that the facts do not support; median response under 5 s.
- **Time-box:** 1 day plus Andrei's ratings.
- **Decision:** whether the explainer ships for the pilot, which facts it needs that are missing, and the prompt and model to start from.
