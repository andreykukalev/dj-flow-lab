# DJ Flow Lab — MVP Backlog

- **Status:** Created as GitHub issues on 2026-10-24, re-cut for brief v0.4 on 2026-10-25. The issues are the source of truth; this page is the overview.
- **Based on:** [product brief v0.4](PRODUCT_BRIEF_v0.4.md), [technical decisions](TECHNICAL_DECISIONS.md) and [implementation plan](MVP_IMPLEMENTATION_PLAN.md). Issues #4, #7, #9–#13, #16–#19 and #29 were updated for v0.3 on 2026-10-24. On 2026-10-25 the backlog was refined for the UX concept in [WEB_UX.md](WEB_UX.md): #55 and #56 were added, and #7, #8, #10, #12, #15, #19–#21, #24, #25, #36 and #45 now name the screen and mockup they build. On 2026-10-25, after the proof of concept, the backlog was re-cut for [brief v0.4](PRODUCT_BRIEF_v0.4.md): choosing the moment is the centre of the product. M2 became "Find the moment" with hot cues (#59), jumps (#60) and pairings (#61); M3 gained the outcome of a pairing (#62, #63); the AI explainer became M5 (#58: #64, #65, #66) and the pilot moved to M6. #10, #15, #16, #27, #34 and #55 carry a "v0.4 refinement" section. Andrei then decided that the app performs and the user can take over, with their moves recorded as an editable script (#68).

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

## M0.5 — Technical proof of concept (#40), done

Prove the highest-risk technical assumptions before building product UI on the engine. Passed on 2026-10-25: P1–P8 and P10 on Chromium and Firefox, and the listening check on two real tracks. The outcome is in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md) (proof of concept, result).

- #41 Browser audio test harness on Chromium and Firefox (P0, S8)
- #42 Two-deck engine: anchor, sync, seek, automation (S1)
- #43 Decoding matrix, MP3 offsets, memory, AIFF fallback (S2)
- #44 Mixer DSP: isolator EQ, filter sweeps, declicking, headroom (S3)
- #45 Virtual controller locked to the audio clock (S5), built as the Try screen's mixer
- #46 Proof-of-concept gate: two real tracks, one transition, two engines

## M1 — Two tracks, one grid (#6)

Load two of your own tracks, see their structure, and play them in sync.

- #47 BPM and downbeat accuracy on real tracks (S6), before #9 · `mvp:must`
- #48 Storage durability and track identity (S7), before #11 · `mvp:should`
- #55 App shell, learning-loop navigation and design tokens · `mvp:must`
- #7 Import a local track onto each deck · `mvp:must`
- #8 Render deck waveforms · `mvp:must`
- #9 Estimate BPM and the first downbeat · `mvp:must`
- #10 Show the beat grid and let the user correct it · `mvp:must`
- #11 Remember analysis and corrections per track · `mvp:should`
- #12 Build the two-channel mixer audio graph · `mvp:must`
- #13 Play both decks in sync with a shared transport · `mvp:must`

## M2 — Find the moment (#14)

The space of possibilities: mark moments in both tracks, pair any moment of A with any moment of B, move them with jumps, and hear each pairing at once with the mixer performing it. Pairings that do not line up play rather than being refused.

- #59 Hot cues on each track · `mvp:must`
- #60 Jumps by beat, bar and phrase · `mvp:must`
- #15 Select exit and entry points · `mvp:must`
- #16 Compile, evaluate and validate transition plans · `mvp:must`
- #17 Strategy: long blend with bass swap · `mvp:must`
- #18 Schedule a plan's control changes on the audio clock · `mvp:must`
- #19 Virtual mixer that performs the plan · `mvp:must`
- #20 Transition timeline with seek and replay · `mvp:must`
- #21 Explain the musical purpose of each key action · `mvp:must`
- #61 Try any pairing of moments in one action · `mvp:must`

## M3 — Hear what happened, compare approaches (#22)

Understand what each pairing did and why, and hear two ways of making the same transition. This completes the brief's must-have list.

- #62 Outcome facts for a played pairing · `mvp:must`
- #63 Explain what happened in a pairing · `mvp:must`
- #23 Strategy: phrase-boundary cut · `mvp:must`
- #24 Keep variants and switch between them while listening · `mvp:must`
- #68 Take over a control and record it as an editable script · `mvp:must`
- #56 Intend: choose what the transition should do and pick approaches · `mvp:should`
- #25 Compare two variants side by side · `mvp:must`
- #26 Adjust transition duration and strategy parameters · `mvp:should`
- #27 Edit a plan by hand on the timeline · `mvp:should`

## M4 — Structure and suggestions (#28)

The app points at musically promising moments, labeled as hypotheses you can accept, move, or ignore. Detected sections also make the outcome facts richer (#62).

- #29 Detect likely section changes · `mvp:should`
- #30 Suggest exit and entry points with reasons · `mvp:should`
- #31 Label every piece of information by knowledge layer · `mvp:should`
- #32 Enter a track's key and show harmonic compatibility · `mvp:should`

## M5 — AI explainer (#58)

An AI "brain" that explains a played pairing: what the listener hears, why it worked or did not, and what to try next. It reads the outcome facts, never audio, and never writes control events (brief v0.4 §10).

- #64 AI explainer grounded in outcome facts (S9) · `mvp:should`
- #65 Explainer API proxy on Static Web Apps, with the privacy changes · `mvp:should`
- #66 Ask why: AI explanation of a played pairing · `mvp:should`

## M6 — Pilot ready (#33)

Something you can hand to ten DJs and learn from.

- #34 Guide a first transition with demo tracks · `mvp:should`
- #35 Render a transition to an audio file · `mvp:should`
- #36 Write a reflection note per variant · `mvp:should`
- #37 Opt-in session log and export for the pilot · `mvp:should`

## Later (#38)

Assisted mode (intent interpretation, through the explainer proxy), Auto mode orchestration, key lock, key detection, a filter-sweep strategy, loops and FX, Rekordbox XML import, and a reusable transition library.
