# DJ Flow Lab — MVP Architecture (proposal)

- **Status:** Proposal for review, alongside [product brief v0.2](product-brief.md)
- **Scope:** The Transition Builder MVP (milestones M0–M5 in [backlog.md](backlog.md))

## 1. Goals that shape the design

1. **One source of truth for a transition.** The audio you hear, the controller you see, and the explanation you read all come from the same transition plan. They cannot drift apart because none of them keeps its own copy of the timing.
2. **Seek anywhere, instantly.** Any moment of a transition can be reconstructed from the plan alone, so seeking, replaying, and switching variants are cheap.
3. **Musical time, not clock time.** Plans are written in bars and beats; seconds are derived at playback.
4. **Facts, hypotheses, and opinions stay labeled.** The information layers from brief §10 are fields in the data, not only words in the UI.
5. **Local first.** Audio never leaves the user's machine. No accounts, no backend, until Assisted mode needs a model.

## 2. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | One language for engine, analysis, and UI; the engine's types document the plan format. |
| Build and dev server | Vite | Fast, simple, first-class Web Worker support. |
| UI | React 19 | Widely known; component model suits decks, mixer, and timeline. |
| State | Zustand | Small store with selectors; keeps the audio clock out of React renders. |
| Audio | Web Audio API (native) | Sample-accurate scheduling of gain and filter changes; no dependency needed for the MVP mixer. |
| Analysis | Own TypeScript code in a Web Worker | The MVP needs a constant-tempo grid and bar-level energy, which are simple enough to own. Avoids AGPL/GPL libraries (Essentia.js, aubio) that would constrain licensing. |
| Waveforms and timeline | Canvas 2D, own component | DJ-style overlays (bar lines, phrases, plan lanes, playhead) on two synchronized decks are easier to own than to bend a library to. |
| Controller | SVG React components | Crisp at any size, easy to animate from the plan. |
| Local storage | IndexedDB (via `idb`) | Analysis results and user corrections, keyed by a file fingerprint. |
| Tests | Vitest (unit), Playwright (end-to-end) | The engine is pure TypeScript and runs in Node; Playwright drives a real browser for audio-graph and UI checks. |
| Lint and format | oxlint, Prettier | oxlint is the Vite template default and is fast enough to run on every save. |
| CI | GitHub Actions | Typecheck, lint, unit tests, build on every PR. |
| Hosting | Static site (GitHub Pages, Cloudflare Pages, or Vercel) | No server needed for M0–M5. |
| Later: Assisted mode | Claude API via a small serverless function | Keeps the API key off the client; the model returns structured choices that the engine validates. |

## 3. Module layout

```
src/
  engine/        Pure TypeScript, no DOM. The heart of the product.
    model.ts       Track, BeatGrid, Section, Strategy, TransitionPlan, Variant types
    time.ts        Bars/beats <-> seconds, given grids and tempo ratio
    evaluate.ts    planStateAt(plan, beat) -> every control's value at that moment
    validate.ts    Checks a plan against mixer capabilities and the grids
    strategies/    One file per strategy: parameters -> TransitionPlan
  analysis/      Runs in a Web Worker
    decode.ts      File -> AudioBuffer (main thread) -> channel data to worker
    peaks.ts       Multi-resolution waveform peaks, 3-band colouring
    tempo.ts       Onset envelope, BPM estimate, beat phase
    downbeat.ts    First-downbeat estimate (low-band energy), with confidence
    structure.ts   Bar-level energy and novelty -> section-change hypotheses
  audio/         Web Audio, browser only
    graph.ts       Two channel strips + crossfader + master
    scheduler.ts   Turns a plan into AudioParam automation from a given position
    transport.ts   Play, pause, seek, loop; owns the AudioContext clock
    render.ts      OfflineAudioContext render of a plan to WAV
  content/       Authored explanations per strategy (Markdown + placeholders)
  ui/            React components: Deck, Timeline, Mixer, Transport, ExplanationPanel, VariantSwitcher
  store/         Zustand stores: session, tracks, plans, playback
```

The rule: `engine` imports nothing from the other folders, and `ui` never touches Web Audio directly.

## 4. Core data model (sketch)

```ts
type Layer = 'measured' | 'hypothesis' | 'interpretation' | 'preference' | 'instruction';

interface Labeled<T> { value: T; layer: Layer; confidence?: number; source: 'analysis' | 'user' | 'strategy' | 'model'; }

interface BeatGrid { bpm: Labeled<number>; firstDownbeatSec: Labeled<number>; beatsPerBar: 4; }

interface Section { startBar: number; endBar: number; kind: 'intro' | 'groove' | 'breakdown' | 'build' | 'drop' | 'outro' | 'unknown'; label: Labeled<string>; }

interface Track { id: string; fingerprint: string; name: string; durationSec: number; grid: BeatGrid; sections: Section[]; key?: Labeled<string>; }

type Control = 'trim' | 'eqHigh' | 'eqMid' | 'eqLow' | 'filter' | 'fader' | 'crossfader';

interface AutomationPoint { beat: number; value: number; curve: 'step' | 'linear' | 'exp'; }

interface Lane { deck: 'A' | 'B' | 'master'; control: Control; points: AutomationPoint[]; }

interface Annotation { atBeat: number; untilBeat?: number; lanes: Lane['control'][]; title: string; why: string; layer: Layer; }

interface TransitionPlan {
  id: string; strategyId: string; params: Record<string, number | string>;
  exitBarA: number; entryBarB: number; overlapBars: number; handoffBar: number;
  tempo: { masterDeck: 'A'; rateB: number };   // playback-rate sync
  lanes: Lane[]; annotations: Annotation[];
  intention?: Labeled<string>;
}
```

`beat` in a plan is counted from the exit point (beat 0 = the first beat of the transition), which keeps a plan independent of where in A it starts.

## 5. Playback and synchronization

```
            TransitionPlan
           /       |       \
 scheduler.ts  evaluate.ts  annotations
 (AudioParam    (values at   (what to explain
  automation)    any beat)    at any beat)
      |            |              |
  Web Audio    Mixer UI      Explanation panel
      \            |              /
       `---- transport clock (AudioContext.currentTime) ----'
```

- **Audio.** On play or seek at beat _b_, the scheduler cancels pending automation, sets every parameter to `planStateAt(plan, b)`, and schedules the remaining points with `setValueAtTime` / `linearRampToValueAtTime`. Both decks start from offsets computed by `time.ts`, so they are beat-aligned by construction.
- **Visuals.** A single `requestAnimationFrame` loop reads `AudioContext.currentTime`, converts it to a beat (accounting for `outputLatency`), and calls `planStateAt`. The mixer and timeline render that state. React is not on the hot path; components subscribe to a lightweight playback store.
- **Seeking and variants.** Because everything is a function of the plan and the beat, switching variant mid-playback means "reschedule from the current beat with the other plan".
- **Channel strip.** `AudioBufferSourceNode → trim (Gain) → EQ low (lowshelf) → EQ mid (peaking) → EQ high (highshelf) → filter (low-pass and high-pass Biquads, bypassed at centre) → fader (Gain) → crossfader (Gain, equal-power curve) → master`. Fader and crossfader curves are defined once in `engine` and shared with the UI so a fader at 70% looks and sounds like 70%.

## 6. Analysis pipeline (MVP)

1. Decode the file with `decodeAudioData` on the main thread; transfer mono channel data to the worker.
2. Compute waveform peaks at several zoom levels and a 3-band energy profile for colouring.
3. Estimate BPM from an onset-strength envelope with autocorrelation, constrained to 70–180 BPM and folded into the genre range (110–145) by default.
4. Estimate beat phase and the first downbeat from low-frequency (kick) energy, with a confidence score.
5. Compute per-bar energy (low, mid, high) and a novelty curve; mark likely section changes on 8-bar boundaries (M4).
6. Store the result in IndexedDB with the user's corrections layered on top. User corrections always win and are labeled `source: 'user'`.

Accuracy target for the MVP: correct BPM and downbeat on at least 8 of 10 tracks from a small reference set in the target genres, with correction taking under 30 seconds when wrong. A reference set of royalty-free tracks with hand-annotated grids lives in `test/fixtures` (or is described there when licensing prevents committing audio).

## 7. Strategies (first two)

| Strategy | Shape | What it teaches |
|---|---|---|
| **Long blend with bass swap** | B enters with its low EQ cut at A's exit phrase; mids and highs fade in over the overlap; at the handoff bar, A's lows go out and B's come in on the downbeat; A fades out over the next phrase. | Two kick drums and two bass lines fight; swapping the low end on a phrase boundary hands over the groove without a gap. Long overlaps keep the energy steady. |
| **Phrase-boundary cut** | B is cued so its drop or groove lands on A's next phrase boundary; at that downbeat, A is cut (fader or crossfader) and B takes over at full level, optionally with a short high-pass on A in the bar before. | A decisive change creates contrast and resets the listener's attention; it works when the new track should feel like an arrival rather than a continuation. |

Each strategy is a pure function `(trackA, trackB, points, params) → TransitionPlan` with unit tests that check timing, ranges, and that every key action has an annotation.

## 8. Testing strategy

- **Engine:** exhaustive unit tests (time conversion, plan evaluation at boundaries, validation, each strategy).
- **Analysis:** tests against synthetic click tracks with known BPM and phase, plus the reference set when available.
- **Audio:** Playwright tests that render a plan with `OfflineAudioContext` and check, for example, that low-band energy of A drops at the handoff bar.
- **UI:** Playwright smoke test of the full flow (load two fixtures, set points, play, switch variant).

## 9. What is deliberately deferred

Key lock (time-stretching, e.g. SoundTouch or Rubber Band WASM), key detection, loops and FX, Rekordbox XML import, accounts and sync, and the language model for Assisted mode. The plan format leaves room for each: `tempo` can gain a `keyLock` flag, `Control` can gain FX controls, and `source: 'model'` is already a label.
