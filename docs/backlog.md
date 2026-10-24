# DJ Flow Lab — MVP Backlog (draft)

- **Status:** Draft for review. Not yet created as GitHub issues.
- **Based on:** [product brief v0.2](product-brief.md) and [architecture proposal](architecture.md)

Each milestone ends with something you can open in a browser and try. Issues are listed in build order; the number in brackets is the planned issue order, not a GitHub number.

## Labels

| Group | Labels |
|---|---|
| Type | `type:feature`, `type:chore`, `type:docs`, `type:research` |
| Area | `area:engine`, `area:audio`, `area:analysis`, `area:ui`, `area:controller`, `area:content`, `area:infra` |
| Priority (brief §9) | `mvp:must`, `mvp:should`, `later` |
| Knowledge layer touched (brief §10) | `layer:measured`, `layer:hypothesis`, `layer:interpretation` (only where it matters) |

## M0 — Foundations

Goal: an empty but real app, with CI and the core types in place.

1. **[01] Scaffold the web app** — Vite + React + TypeScript (strict), ESLint, Prettier, Vitest, Playwright, folder layout from architecture §3. `type:chore` `area:infra`
2. **[02] CI on pull requests** — GitHub Actions: install, typecheck, lint, unit tests, build. `type:chore` `area:infra`
3. **[03] Engine data model and time conversion** — `model.ts` and `time.ts` with tests (bars/beats ↔ seconds, tempo ratio, beat 0 at exit point). `type:feature` `area:engine` `mvp:must`

## M1 — Two tracks, one grid

Goal: load two of your own tracks, see their structure, and play them in sync.

4. **[04] Import two local tracks** — drop or pick a file per deck, decode, show name, duration, and errors for unsupported files. `area:audio` `area:ui` `mvp:must`
5. **[05] Waveform rendering** — multi-resolution peaks in a worker, canvas deck view with zoom and scroll, 3-band colouring. `area:analysis` `area:ui` `mvp:must`
6. **[06] BPM and first-downbeat estimation** — worker analysis with confidence; tests on synthetic click tracks. `area:analysis` `layer:measured` `mvp:must`
7. **[07] Beat grid overlay and correction** — bar lines, bar counter, 8/16/32-bar phrase markers; nudge grid, halve/double BPM, "set the 1 here". `area:ui` `mvp:must`
8. **[08] Remember analysis per track** — IndexedDB by file fingerprint, user corrections layered on top. `area:analysis` `mvp:should`
9. **[09] Two-channel audio graph** — channel strips (trim, 3-band EQ, filter, fader), crossfader, master; shared fader/crossfader curves. `area:audio` `mvp:must`
10. **[10] Transport with tempo sync** — play, pause, seek, replay on a shared clock; B's playback rate matched to A; warning above ~6% tempo gap. `area:audio` `mvp:must`

## M2 — First transition you can watch

Goal: choose where to leave A and enter B, generate a long blend, and watch the mixer perform it while you listen.

11. **[11] Select exit and entry points** — click to set A's exit bar and B's entry bar, snapped to bars, draggable; shows overlap on both decks. `area:ui` `mvp:must`
12. **[12] Plan evaluation and validation** — `planStateAt(plan, beat)` and `validate(plan)` with tests at every boundary. `area:engine` `mvp:must`
13. **[13] Strategy: long blend with bass swap** — pure function to plan, parameters (overlap length, handoff bar), unit tests. `area:engine` `mvp:must`
14. **[14] Plan scheduler** — turn a plan into AudioParam automation from any beat; reschedule on seek and pause. Offline-render test of the bass swap. `area:audio` `mvp:must`
15. **[15] Virtual mixer** — SVG two-channel mixer driven by `planStateAt` at animation-frame rate, with a "control moved" highlight. `area:controller` `mvp:must`
16. **[16] Transition timeline** — plan lanes under the decks (per control), playhead, click to seek, "replay transition" button. `area:ui` `mvp:must`
17. **[17] Explanations for key actions** — annotation format, authored content for the long blend, panel that shows the current "why" in time with playback, layer labels. `area:content` `area:ui` `layer:interpretation` `mvp:must`

## M3 — Compare approaches

Goal: hear two different ways of making the same transition and understand the difference. This completes the brief's must-have list.

18. **[18] Strategy: phrase-boundary cut** — second strategy, parameters, tests, authored explanations. `area:engine` `area:content` `mvp:must`
19. **[19] Variants and A/B switching** — keep several plans for the same pair, switch while playing from the same beat, loop the transition region. `area:ui` `area:audio` `mvp:must`
20. **[20] Comparison view** — side-by-side summary of two variants: what each does, when the handoff happens, which controls move, and the musical trade-off. `area:ui` `area:content` `mvp:must`
21. **[21] Adjustable parameters** — overlap length, handoff bar, curve shape, filter depth; the plan regenerates live and the explanation updates. `area:ui` `area:engine` `mvp:should`
22. **[22] Edit the plan by hand** — move or remove automation points on the timeline; the plan is marked "your version". `area:ui` `mvp:should`

## M4 — Structure and suggestions

Goal: the app points at musically promising moments, labeled as hypotheses you can accept, move, or ignore.

23. **[23] Section-change detection** — bar-level energy and novelty, hypotheses on 8-bar boundaries with confidence; correctable labels (intro, breakdown, drop, …). `area:analysis` `layer:hypothesis` `mvp:should`
24. **[24] Suggested exit and entry points** — rank candidate pairs from sections (e.g., A's outro start ↔ B's intro, A's breakdown ↔ B's build), each with a one-line reason. `area:engine` `layer:hypothesis` `mvp:should`
25. **[25] Information layer labels across the UI** — consistent badges for measured / likely / interpretation / your choice / action, with a short legend. `area:ui` `mvp:should`
26. **[26] Manual key entry and harmonic hint** — enter each track's key; show compatibility and mention it in explanations. `area:ui` `area:content` `mvp:should`

## M5 — Pilot ready

Goal: something you can hand to ten DJs and learn from.

27. **[27] First-run guide** — a short guided first transition with two bundled royalty-free demo tracks. `area:ui` `area:content` `mvp:should`
28. **[28] Render transition to audio file** — OfflineAudioContext render to WAV for listening back. `area:audio` `mvp:should`
29. **[29] Reflection notes per variant** — prompt "what changed, which did you prefer, why", saved locally and included in export. `area:ui` `mvp:should`
30. **[30] Opt-in session log and export** — local event log (no audio, file names only with consent), JSON export for the pilot. `area:infra` `mvp:should`
31. **[31] Deploy** — static hosting with preview deploys per PR. `area:infra` `mvp:should`

## Later (not in the MVP)

Assisted mode with intent interpretation (Claude API via serverless proxy), Auto mode orchestration, key lock (time-stretch), key detection, a filter-sweep strategy, loops and FX, Rekordbox XML import of grids and cues, reusable transition library.
