# MVP implementation plan

- **Status:** v0.3, 2026-10-24
- **Principle:** pure, testable layers first (timing, plan), then the audio engine, then what users see. Nothing user-facing is built on top of the engine until the proof of concept passes.
- **References:** [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) (D-xx), [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md) (S-x, P1–P10), [RISKS.md](RISKS.md) (R-xx). Product milestones M1–M5 and their GitHub issues are in [backlog.md](backlog.md).

## Dependency graph

```
P0 Test harness ──┬──────────────────────────────────────────────┐
P1 Timing model ──┼─> P2 Plan model ──┐                          │
P3 Files/decoding ┼───────────────────┼─> P4 Audio engine core ──┼─> P6 Plan execution ─> P7 Visual controller
                  │                   └─> P5 Mixer DSP ──────────┘                │
                  │                                                     ══ PoC gate (P1–P10) ══
                  └──> P8 Persistence      P9 Analysis (after P3)        P10 Compatibility & release checks
```

P1, P2, P3 can proceed in parallel. P8 and P9 can start once P3 is done but are not needed for the PoC (grids are entered by hand there).

---

## P0 — Test harness and tooling
- **Scope:** Playwright projects for Chromium and Firefox; an in-page helper to run `OfflineAudioContext` renders and return measurements; synthetic fixture generator (click tracks, sines, noise; WAV/AIFF/FLAC/MP3 via ffmpeg, committed as small files); remove unused `zustand` (D-26); CI runs unit + integration tests on both engines (S8).
- **Done when:** CI is green on a pull request with one offline-render test running in both Chromium and Firefox; S8 flakiness numbers are recorded.

## P1 — Musical timing model (`src/engine/time.ts`, `grid.ts`)
- **Scope:** time domains (D-08); `BeatGrid` with `anchorSec`, `phraseOffsetBars` (D-09), replacing `firstDownbeatSec` in the current `model.ts`; bar numbering (bar 1 = first full bar at or after file time 0); two-point BPM; double/halve; nudges; phrase grid; transition-beat ↔ deck file time; rate and semitone pitch change (D-07).
- **Done when:** unit tests cover every conversion and correction, including property tests (round-trips for random grids; anchor set at any downbeat yields the same grid). Existing 12 tests are migrated.

## P2 — Plan model, mappings, compiler, validation (`src/engine/plan/`, `mixer.ts`)
- **Scope:** `TransitionPlanV1` (D-16) replacing the lane model in `model.ts`; control ranges, defaults, and mapping functions (D-14); `compile` and `stateAt` (D-17); `validate` with every error and warning in D-19; hand-written long-blend plan fixture for the PoC.
- **Done when:** unit tests: `stateAt` at every boundary (on, between, before first, after last event, at curve changes); `stateAt` equals a fresh evaluation for any random sequence of beats (history independence); each validation rule rejects or warns with a specific message; compiled output is identical for permuted event order.

## P3 — File handling and decoding (`src/audio/decode.ts`, `aiff.ts`)
- **Scope:** file input and drop; SHA-256 fingerprint before decoding (D-22); native `decodeAudioData`; AIFF/AIFC PCM fallback (D-03); length limit and error messages; release file bytes; decoded metadata (`decodedFrames`, `sampleRate`, engine).
- **Done when:** S2 matrix recorded for Chromium, Firefox (and WebKit as a smoke test); AIFF parser unit-tested against ffmpeg fixtures (16/24/32-bit, `sowt`, `fl32`, mono/stereo); unsupported and corrupt files produce the right message in an integration test; memory figures for 2 × 10-minute tracks recorded.

## P4 — Audio engine core (`src/audio/context.ts`, `transport.ts`, `deck.ts`)
- **Scope:** lazy `AudioContext` and gesture resume; anchor (D-04); `startAt(beat)`, `pause()`, `replay()`, loop region, all via one path (D-05); deck sources with grid offsets and rate (D-07); transport gate fades; `statechange` handling (D-06); external store for transport state.
- **Done when:** P1, P2 (transport part), P3, and P8 pass in CI on both engines.

## P5 — Mixer DSP (`src/audio/mixer.ts`)
- **Scope:** D-11 chain; isolator EQ or shelving fallback per S3 (D-12); bipolar filter (D-13); master headroom and meter; declicking (D-15); direct-control smoothing.
- **Done when:** S3 pass/fail criteria are encoded as integration tests and pass on both engines; listening check sheet signed off.

## P6 — Plan execution (`src/audio/scheduler.ts`)
- **Scope:** compiled segments → sampled linear ramps on the audio clock (D-18); restart from any beat including mid-ramp; variant switch = `startAt(currentBeat)` with another plan; refuse plans with validation errors.
- **Done when:** P2 (control-state part), P4, P5, P6 pass in CI on both engines; scheduling never throws for any plan that passes `validate` (property test with generated plans).

## P7 — Visual controller (`src/ui/mixer/`, `src/ui/clock.ts`)
- **Scope:** one `requestAnimationFrame` loop; heard-time computation and calibration offset (D-21); minimal SVG mixer bound to `stateAt`; pause/seek/hidden-tab recovery; frame logger for tests.
- **Done when:** P7 and P8 pass; S5 manual checks recorded for wired and Bluetooth output.

## PoC gate
All of P1–P10 in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md) pass. Outcome recorded in `TECHNICAL_DECISIONS.md` (confidence levels updated, decisions revised where a spike failed). Only then do the product UI issues of M1–M2 proceed on this engine.

## P8 — Persistence (`src/store/db.ts`)
- **Scope:** IndexedDB layout (D-24); corrections layered over analysis; pairs, variants, notes; `storage.persist()`; quota handling; versioning and migrations; JSON export/import; re-selecting files after reload and restoring by fingerprint (D-23); name+duration secondary match (D-22).
- **Done when:** S7 criteria pass; reload test restores grid, points, and variants after re-selecting the same files; clearing site data leaves the app working.

## P9 — Analysis (`src/analysis/`)
- **Scope:** decimated mono hand-off; worker pipeline (D-25): peaks and 3-band colouring, BPM, downbeat, grid fit (D-10), per-bar energy, loudness; algorithm version.
- **Done when:** synthetic-signal unit tests pass (BPM ±0.01, downbeat ±5 ms on click tracks); S6 criteria met or the S6 decision taken (analysis as default vs suggestion); no long task > 50 ms on the main thread during analysis of a 10-minute track.

## P10 — Browser compatibility and release checks
- **Scope:** Tier 1 automated suite on Chromium and Firefox; Tier 2 Safari manual checklist on macOS (decode matrix, sync, controller, interruption, persistence); privacy network test (D-28); performance budget (60 fps mixer during playback on a mid-range laptop; analysis time).
- **Done when:** checklist results committed for each release candidate; privacy test green; known-limitations section of the README updated.

---

## Changes this plan implies for the existing backlog

The GitHub issues were written before this refinement. Proposed changes, to apply after review:

| Change | Issues |
|---|---|
| Add a milestone **M0.5 — Technical proof of concept** with issues for P0, S1, S2, S3, S5, S8 and the PoC gate, before M1 | new |
| Revise the time model (anchor, two-point correction, phrase grid) and plan model (events, schema v1) | #4 |
| Replace "drift under 5 ms" with the D-20 tolerances | #13, #19 |
| Add AIFF fallback, length limit, fingerprint before decode | #7 |
| BPM precision 0.02 / grid fit / drift warning; rename "phrase markers" to "phrase grid" | #9, #10 |
| Isolator EQ, mappings, headroom, declicking | #12 |
| Event-based plan, compiler, validation rules | #16, #17 |
| Sampled linear ramp scheduling; restart-from-beat | #18 |
| Re-select files after reload; storage durability; export as backup | #11 |
| Section detection explicitly a _hypothesis_ layer, separate from the phrase grid | #29 |
| Add S6 (analysis accuracy) and S7 (storage durability) spikes before #9 and #11 | new |
