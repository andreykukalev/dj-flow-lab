# DJ Flow Lab — MVP Backlog

- **Status:** Created as GitHub issues on 2026-10-24. The issues are the source of truth; this page is the overview.
- **Based on:** [product brief v0.3](PRODUCT_BRIEF_v0.3.md), [technical decisions](TECHNICAL_DECISIONS.md) and [implementation plan](MVP_IMPLEMENTATION_PLAN.md). Issues #4, #7, #9–#13, #16–#19 and #29 were updated for v0.3 on 2026-10-24.

Each milestone ends with something you can open in a browser and try. Each milestone is a tracking issue with the `milestone` label, and its work items are attached as sub-issues in build order.

## Labels

| Group | Labels |
|---|---|
| Type | `type:feature`, `type:chore`, `type:spike` |
| Area | `area:engine`, `area:audio`, `area:analysis`, `area:ui`, `area:controller`, `area:content`, `area:infra` |
| Priority (brief §9) | `mvp:must`, `mvp:should`, `later` |
| Knowledge layer touched (brief §10) | `layer:measured`, `layer:hypothesis`, `layer:interpretation` (only where it matters) |
| Grouping | `milestone` (tracking issues) |

## M0 — Foundations (#1)

An empty but real app, with CI, preview deploys, and the core types in place.

- #2 Scaffold the web app · `mvp:must`
- #3 Run checks on every pull request · `mvp:must`
- #4 Musical timing model and transition plan schema v1 · `mvp:must`
- #5 Deploy to Azure Static Web Apps with preview environments · `mvp:must`

## M0.5 — Technical proof of concept (#40)

Prove the highest-risk technical assumptions before building product UI on the engine. Done when P1–P10 in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md) pass on Chromium and Firefox.

- #41 Browser audio test harness on Chromium and Firefox (P0, S8)
- #42 Two-deck engine: anchor, sync, seek, automation (S1)
- #43 Decoding matrix, MP3 offsets, memory, AIFF fallback (S2)
- #44 Mixer DSP: isolator EQ, filter sweeps, declicking, headroom (S3)
- #45 Virtual controller locked to the audio clock (S5)
- #46 Proof-of-concept gate: two real tracks, one transition, two engines

## M1 — Two tracks, one grid (#6)

Load two of your own tracks, see their structure, and play them in sync.

- #47 BPM and downbeat accuracy on real tracks (S6), before #9 · `mvp:must`
- #48 Storage durability and track identity (S7), before #11 · `mvp:should`
- #7 Import a local track onto each deck · `mvp:must`
- #8 Render deck waveforms · `mvp:must`
- #9 Estimate BPM and the first downbeat · `mvp:must`
- #10 Show the beat grid and let the user correct it · `mvp:must`
- #11 Remember analysis and corrections per track · `mvp:should`
- #12 Build the two-channel mixer audio graph · `mvp:must`
- #13 Play both decks in sync with a shared transport · `mvp:must`

## M2 — First transition you can watch (#14)

Choose where to leave A and enter B, generate a long blend, and watch the mixer perform it while you listen.

- #15 Select exit and entry points · `mvp:must`
- #16 Compile, evaluate and validate transition plans · `mvp:must`
- #17 Strategy: long blend with bass swap · `mvp:must`
- #18 Schedule a plan's control changes on the audio clock · `mvp:must`
- #19 Virtual mixer that performs the plan · `mvp:must`
- #20 Transition timeline with seek and replay · `mvp:must`
- #21 Explain the musical purpose of each key action · `mvp:must`

## M3 — Compare approaches (#22)

Hear two different ways of making the same transition and understand the difference. This completes the brief's must-have list.

- #23 Strategy: phrase-boundary cut · `mvp:must`
- #24 Keep variants and switch between them while listening · `mvp:must`
- #25 Compare two variants side by side · `mvp:must`
- #26 Adjust transition duration and strategy parameters · `mvp:should`
- #27 Edit a plan by hand on the timeline · `mvp:should`

## M4 — Structure and suggestions (#28)

The app points at musically promising moments, labeled as hypotheses you can accept, move, or ignore.

- #29 Detect likely section changes · `mvp:should`
- #30 Suggest exit and entry points with reasons · `mvp:should`
- #31 Label every piece of information by knowledge layer · `mvp:should`
- #32 Enter a track's key and show harmonic compatibility · `mvp:should`

## M5 — Pilot ready (#33)

Something you can hand to ten DJs and learn from.

- #34 Guide a first transition with demo tracks · `mvp:should`
- #35 Render a transition to an audio file · `mvp:should`
- #36 Write a reflection note per variant · `mvp:should`
- #37 Opt-in session log and export for the pilot · `mvp:should`

## Later (#38)

Assisted mode with Claude via the Static Web App's managed API, Auto mode orchestration, key lock, key detection, a filter-sweep strategy, loops and FX, Rekordbox XML import, and a reusable transition library.
