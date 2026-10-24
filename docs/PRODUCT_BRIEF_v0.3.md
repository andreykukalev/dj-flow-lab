# DJ Flow Lab — Product Brief

- **Version:** 0.3 (technical refinement, for review)
- **Status:** Product intent unchanged from v0.2; technical decisions, constraints, and acceptance criteria refined for implementation
- **Changes from v0.2:** technical refinement only. Time domains and grid terms added to the vocabulary (§4a); MVP scope wording made precise about the phrase grid versus detection, and technical out-of-scope items listed (§9); §9a now separates decisions from assumptions; §9b acceptance criteria rewritten to be testable, with test types and provisional thresholds; privacy claim made precise (§12a); technical risks (§12) and open technical uncertainties (§15) added. Product philosophy, learning loop, interaction modes, and the Transition Builder concept are unchanged. Supporting documents: [TECHNICAL_AUDIT_v0.2.md](TECHNICAL_AUDIT_v0.2.md), [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md), [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md), [MVP_IMPLEMENTATION_PLAN.md](MVP_IMPLEMENTATION_PLAN.md), [RISKS.md](RISKS.md). Passages changed in this version are marked _(v0.3)_.
- **Product category:** Music learning and creative technology
- **Changes from v0.1:** added a shared vocabulary (§4a), the learning loop (§5a), working assumptions for the MVP (§9a), acceptance criteria for each must-have (§9b), the information layers as a product rule (§10), privacy and rights (§12a) and open questions (§15). The original text is otherwise kept. New or changed passages are marked _(v0.2)_.

---

## 1. Product Overview

DJ Flow Lab is a music-learning product that helps DJs develop musical thinking and make more intentional mixing decisions.

It helps DJs understand track structure, recognize musical opportunities, explore different transition strategies, and learn how mixing decisions influence the listening experience.

Rather than teaching only how to operate DJ equipment, DJ Flow Lab focuses on **why** a mixing decision works musically, **when** to make it, and **what** it contributes to the music.

The initial product experience is a **Transition Builder**: an interactive environment where DJs work with their own tracks, explore transition possibilities, listen to the results, and observe synchronized visual demonstrations of the corresponding DJ controller actions.

The long-term vision is to help DJs move beyond mechanically mixing tracks toward creating intentional, emotionally coherent musical journeys.

## 2. Vision

Make musical thinking accessible, understandable, and practical for every DJ who wants to develop beyond technical competence.

DJ Flow Lab helps users connect three things:

1. **Musical intention** — what they want the listener to feel or experience.
2. **Musical understanding** — why a particular moment, structure, or combination of tracks might support that intention.
3. **Practical execution** — how to translate that understanding into concrete mixing decisions.

The product makes the relationship between intention, action, and sound easier to understand through listening, experimentation, visualization, and reflection.

## 3. The Problem

Learning to DJ often involves acquiring technical skills: beatmatching, phrasing, EQ, fader control, effects, and equipment operation. These skills are necessary, but technical competence does not automatically produce musical judgment.

A DJ may know how to perform a transition without understanding:

- Why one entry point feels natural while another feels awkward.
- Why a technically clean transition can still sound musically unconvincing.
- How the arrangement of two tracks affects the transition.
- When to introduce a new musical idea and when to preserve the existing groove.
- How EQ, filters, loops, and faders change the musical relationship between tracks.
- How to turn a desired feeling into a practical mixing decision.

This creates a gap between knowing the mechanics of DJing and understanding how to use those mechanics musically. DJ Flow Lab aims to address that gap.

## 4. Target Audience

**Primary audience.** Beginner and intermediate DJs who can perform basic mixing operations but want to develop stronger musical judgment. They may know how to beatmatch and operate a controller but struggle to understand which transitions to make, why they work, and how to develop their own style.

**Secondary audience.** More experienced DJs who want to explore unfamiliar transition approaches, experiment with their music library, or understand alternative ways to connect tracks.

**Initial musical focus.** Electronic dance music, particularly House and Deep House, Disco House, Progressive House, Melodic House, Progressive Trance, and Trance.

These genres define the initial audience and testing environment, not a fundamental limitation. _(v0.2)_ In practice they share properties the MVP relies on: a steady tempo, a 4/4 grid, and phrases built in multiples of 8 bars. Tracks that break these assumptions (live drums, tempo drift, odd phrase lengths) should degrade gracefully into manual correction rather than fail. _(v0.3)_ Re-edits of live-played disco are the known exception within the target genres: their tempo drifts, so a single-BPM grid fits them only over short spans. The MVP detects poor grid fit and says so (D-10) rather than supporting variable tempo.

## 4a. Shared vocabulary _(v0.2)_

The product, the code, and the explanations use the same words:

| Term | Meaning |
|---|---|
| **Outgoing track (A)** | The track currently playing, which the transition leaves. |
| **Incoming track (B)** | The track the transition introduces. |
| **Exit point** | The bar in A where the transition starts. |
| **Entry point** | The bar in B that lines up with A's exit point. |
| **Overlap** | The span, in bars, during which both tracks are audible. |
| **Handoff** | The moment the musical lead moves from A to B. Often a bass swap, sometimes a cut. |
| **Phrase** | A musically complete unit, typically 8, 16, or 32 bars in the target genres. |
| **Section** | A larger arrangement block: intro, groove, breakdown, build, drop, outro. |
| **Strategy** | A reusable transition approach (for example, long blend with bass swap), with parameters. |
| **Transition plan** | A concrete strategy applied to two specific tracks and points: timed control changes plus their explanations. |
| **Variant** | One of several plans for the same pair of tracks, kept side by side for comparison. |
| **Beat grid** _(v0.3)_ | A track's BPM plus one known downbeat ("the 1"). Every bar line is computed from these two numbers. |
| **Phrase grid** _(v0.3)_ | Phrase lines every 8, 16, or 32 bars, counted from a chosen bar. Arithmetic on the beat grid, not detection. |
| **Section change** _(v0.3)_ | A point where the analysis thinks the arrangement changes. Always a hypothesis the user can move or delete. |

_(v0.3)_ **Five kinds of time.** The engine keeps these apart and converts between them in one place (D-08):

| Time | Unit | Meaning |
|---|---|---|
| File time | seconds | Position in one track's audio. |
| Track beat | beats | Position on one track's beat grid. |
| Bar:beat | display | What the user reads, e.g. bar 97, beat 1. |
| Transition beat | beats | The shared timeline of a transition; beat 0 is the first beat of A's exit bar; it advances at A's tempo. |
| Audio clock | seconds | The browser's audio clock. The single source of truth for when things happen (D-04). |

## 5. Core Product Philosophy

- **Music first.** Technique serves musical expression. A transition is not successful merely because it is technically clean.
- **Understand why, not just how.** Recommendations explain the musical reasoning behind them. The goal is not dependence on presets but the development of the user's own judgment.
- **Learn through listening.** Musical understanding develops through hearing differences, testing alternatives, and reflecting on results. Explanations are connected to audible examples.
- **Preserve creative agency.** There is rarely one universally correct transition. The product presents possibilities and trade-offs rather than pretending that musical taste can be reduced to a single optimal answer.
- **Make musical structure tangible.** Phrases, arrangement changes, tension, release, energy, texture, and musical roles connect directly to practical mixing decisions.
- **Technology should serve emotion.** Automation is valuable when it helps the DJ understand, explore, or realize a musical intention. Automation alone is not the objective.

## 5a. The learning loop _(v0.2)_

Every feature should strengthen one step of this loop, and the interface should make the next step obvious:

1. **Listen** — hear both tracks and where their sections change.
2. **Intend** — decide what the transition should do for the listener.
3. **Try** — build a plan and play it, watching the controller.
4. **Compare** — hear a different approach to the same moment.
5. **Reflect** — name what changed and why one version fit the intention better.

A feature that does not serve a step of this loop is a candidate for removal.

## 6. Core Value Proposition

DJ Flow Lab helps DJs understand not only what to do, but why it works musically. It turns transition experimentation into a learning experience in which users can:

- Explore possible transition points.
- Understand the musical opportunities at those points.
- Compare different ways of executing the same transition.
- Hear how control changes affect the combined sound.
- See how those actions unfold over time.
- Develop the ability to make similar decisions independently.

**Core promise:** From knowing how to mix tracks to understanding how to connect them musically.

## 7. Initial Product: Transition Builder

The first product experience focuses on a single transition between two tracks. The user imports two tracks, chooses how much guidance they want, explores a transition plan, and listens to the result while seeing the associated controller actions. The experience connects musical reasoning, audible results, and practical execution.

### Three interaction modes

- **Manual mode.** The user chooses the entry and exit points and defines the intended musical result. DJ Flow Lab helps translate that decision into a technically executable transition plan.
- **Assisted mode.** The user selects or accepts candidate points and describes the intended feeling or musical function. The system proposes several possible transition approaches and explains their differences.
- **Auto mode.** The system suggests candidate points and generates a proposed transition based on track analysis and selected preferences. Automated suggestions are presented as hypotheses to explore, not objectively correct musical decisions.

The three modes share the same underlying transition engine.

_(v0.2)_ **Sequencing the modes.** The modes differ only in who fills in each input of the engine (points, intention, strategy, parameters). The MVP therefore builds the engine and Manual mode first, then adds analysis-based suggestions (the core of Auto mode), then intent interpretation (the core of Assisted mode). Each step reuses the same plan format, player, and controller.

| Input to the engine | Manual | Assisted | Auto |
|---|---|---|---|
| Exit and entry points | User | User picks from suggestions | System suggests |
| Intention | User picks from a list | User describes in words, system interprets | System infers from preferences |
| Strategy and parameters | User | System proposes 2–3, user picks | System proposes |
| Explanation | System | System | System |

## 8. Core User Experience

A typical first-time experience:

1. The user imports two tracks.
2. DJ Flow Lab analyzes available musical information, such as tempo, beat positions, arrangement changes, and other useful audio features.
3. The user selects Manual, Assisted, or Auto mode.
4. The user chooses transition points or reviews suggested candidates.
5. The system generates a transition plan.
6. The user plays the transition and sees synchronized controller movements.
7. The user pauses, seeks to another moment, or replays the transition.
8. The user experiments with an alternative approach and compares the results.
9. The user understands not only how the transition was executed, but why the proposed approach might work.

The experience encourages exploration rather than implying that the first generated result is necessarily the best one.

## 9. MVP Scope

The MVP validates one central proposition:

> Can DJ Flow Lab help a DJ understand and execute a transition more effectively by connecting musical reasoning, synchronized audio, and visible controller actions?

### Must have

- Import two local audio tracks.
- Display basic waveforms and useful musical timing information.
- Support user-selected transition points.
- Generate one executable transition plan.
- Play both tracks in synchronization with the plan.
- Demonstrate the transition using a virtual controller.
- Synchronize fader, EQ, and filter visualizations with the audio.
- Support play, pause, seeking, and replay.
- Explain the musical purpose of key actions in the transition.
- Allow users to compare at least two transition approaches.

### Should have

- Suggested transition points based on track analysis.
- Basic arrangement-change detection, shown as hypotheses on top of the phrase grid. _(v0.3)_ The phrase grid itself is a must-have (it is arithmetic on the beat grid); detecting where sections actually change is the should-have.
- Simple transition styles, such as gradual blending and more decisive handoffs.
- Adjustable transition duration and control parameters.
- A clear distinction between detected facts, algorithmic suggestions, and subjective musical interpretations.
- _(v0.2)_ Render a transition to an audio file, so users can listen back away from the app (supports the "record and listen back" part of deliberate practice).
- _(v0.2)_ A short reflection note per variant ("what changed, what did you prefer, why").

### Out of scope for the first MVP

- Generating complete multi-track DJ sets.
- Replacing Rekordbox or professional DJ software.
- Direct integration with physical DJ hardware.
- Supporting every DJ effect and advanced technique.
- Perfect automatic interpretation of musical emotion.
- Building a social network or music discovery platform.
- Training a general-purpose AI model to understand all aspects of music.
- _(v0.2)_ User accounts, cloud storage of tracks, or any server-side audio processing.
- _(v0.2)_ Teaching beatmatching by ear. The product syncs tempo so that attention goes to musical decisions.
- _(v0.3)_ Key lock (changing tempo without changing pitch). It needs custom DSP in an AudioWorklet; the MVP shows the pitch change in semitones instead.
- _(v0.3)_ Tracks with varying tempo. Detected and flagged; not gridded.
- _(v0.3)_ Tempo changes during playback (ramping a deck back to its own tempo after the transition).
- _(v0.3)_ Reopening local files automatically after a reload. The user selects the files again; everything else is restored.
- _(v0.3)_ Mobile browsers.

The MVP proves the core learning experience before expanding into a broader platform.

## 9a. Technical decisions and assumptions _(v0.3)_

Decisions are settled for the MVP and recorded in [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md). Assumptions are plausible but must be proven by the named spike in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md) before the work that depends on them.

**Decisions**

| # | Decision | Ref. |
|---|---|---|
| 1 | Static web app on Azure Static Web Apps; all audio work runs in the browser; no backend in the MVP. | D-01 |
| 2 | Native Web Audio nodes only: no audio library and no AudioWorklet. | D-02 |
| 3 | One authoritative timeline: the browser's audio clock, tied to transition beats by a playback anchor set on every start. Timers and animation frames never trigger audio. | D-04 |
| 4 | Play, resume, seek, replay, loop and variant switch all go through one operation, "start at beat _b_", which rebuilds the audio state from the plan. | D-05 |
| 5 | Tempo sync by a constant playback rate on deck B; deck A is the tempo master; pitch change shown in semitones. | D-07 |
| 6 | Beat grid = BPM + any downbeat; two-point correction is the main precision tool; phrase lines are a grid with a user-set offset. | D-09 |
| 7 | Generic two-channel mixer chain with −6 dB master headroom; isolator-style 3-band EQ (true kill), bipolar filter, faders, crossfader; normalized control positions with one shared mapping to audio units. | D-11 to D-14 |
| 8 | Transition plans are versioned data (schema v1): an initial state plus ordered control events in transition beats, with explanations linked by id. Strategies are pure functions that produce plans; UI components contain no transition logic. | D-16 |
| 9 | One compiled form of the plan drives both the audio scheduler and the controller; the state at any beat is computed without reference to earlier frames. | D-17, D-21 |
| 10 | Plans are validated before scheduling; plans with errors are never played. | D-19 |
| 11 | Audio is never stored or uploaded; analysis and corrections are kept in IndexedDB by file fingerprint; JSON export is the backup. | D-22 to D-24, D-28 |
| 12 | Explanations are authored, not generated (unchanged from v0.2). A language model, when added for Assisted mode, may choose and configure strategies but never writes control events. | §10 |

**Assumptions to prove**

| Assumption | Proven by |
|---|---|
| The anchor model stays sample-accurate through seeks and pauses on Chromium and Firefox (validated offline on Chromium only). | S1 / proof of concept |
| AIFF can be supported everywhere through a small in-house parser where the browser cannot decode it (Chromium cannot). | S2 |
| Two 10-minute tracks fit in memory on an 8 GB machine in every supported browser. | S2 |
| MP3 timing is consistent across browsers, or differences can be detected. | S2 |
| The isolator EQ sums flat and kills cleanly; filter sweeps are free of artefacts. | S3 |
| The controller can be kept within a frame of what is heard, with calibration for Bluetooth output. | S5 |
| In-browser BPM and downbeat estimation is accurate enough to be a useful default. | S6 |
| Local storage survives normal use, with export as a backup. | S7 |

## 9b. Acceptance criteria for the must-haves _(v0.3)_

Each criterion names how it is tested: **U** = unit test (Node), **I** = integration test in real browsers (Chromium and Firefox, automated), **M** = manual check with a written checklist. Thresholds marked _provisional_ are set by a spike and may change once measured. Audio correctness and visual correctness are always tested separately.

| Must have | Criterion | Test |
|---|---|---|
| Import two local tracks | WAV (16/24/32-bit), FLAC, MP3, and AIFF/AIFC (uncompressed) load on either deck in every Tier 1 browser; AIFF uses the in-house parser where the browser cannot decode it. | I |
| | A corrupt, unsupported, or too long (> 15 min, _provisional_) file shows a specific message on that deck and leaves the other deck untouched. | I |
| | No network request is made while loading, analysing, or playing. | I |
| Waveforms and timing | Each deck shows a waveform, bar lines, a 1-based bar counter, BPM to two decimals, and the phrase grid with its offset. | I, M |
| Beat-grid correction | Nudge (±1 ms, ±1/16 beat), BPM ±0.01, double/halve, "set the 1 here", and two-point BPM each produce the grid defined in D-09. | U |
| | Using two-point correction, a track whose estimated grid is wrong can be corrected so that kicks sit within 10 ms (_provisional_) of the grid at both ends of a 64-bar span. | M (S6 reference set) |
| User-selected points | Exit and entry points snap to bars (and preferably to phrase lines), can be moved, and are stored as 1-based bars. | U, I |
| One executable plan | A strategy produces a schema-v1 plan that passes validation; every rule in D-19 has a test that rejects (error) or flags (warning) a violating plan. | U |
| Synchronized playback (engine) | With synthetic click tracks at different tempi, deck onsets stay within 1 ms of each other over 64 bars. | I |
| Pause and resume | 50 pause/resume cycles produce no cumulative offset (≤ 1 sample) compared with uninterrupted playback. | I |
| Seek and replay | After any seek, including into the middle of a ramp, every control's audio parameter matches the plan's state at that beat (within 1e-4 of the normalized value), and deck timing matches play-through within 1 sample. Replay always starts at the same beat. | I |
| Automation timing | Each scheduled change takes effect within one audio render quantum (128 frames) of its scheduled time; steps are declicked over 5 ms. | I |
| Audio processing | At neutral settings the mixer is transparent (±0.5 dB, _provisional_); low-band kill ≥ 40 dB below 100 Hz (_provisional_); no discontinuities at steps, starts, stops, or seeks. | I |
| Virtual controller (visual) | On every animation frame, rendered control positions equal the plan's state at the latency-compensated audio time. | I (instrumented) |
| | With wired output, controller motion is perceived within ±40 ms of the sound (_provisional_); with Bluetooth, after one calibration step. | M |
| Interruptions | If the audio context is suspended or interrupted during playback, the transport shows Paused at the right beat and resumes correctly. After a hidden tab is shown again, the controller matches the sound on the next frame. | I, M |
| Explanations | Each key event in a plan has an annotation that resolves and contains no unfilled placeholders; it appears when its beat is reached and after a seek into its range. | U, I |
| Compare two approaches | Switching variant during playback continues from the same beat with no gap longer than the 10 ms transport fade, and audio and controller both switch to the new plan. | I, M |
| Local persistence | After a reload, re-selecting the same files restores grid corrections, points, and variants. Clearing site data leaves the app working with a clean state. | I |

_(v0.3)_ The v0.2 criterion "drift stays under 5 ms over a 64-bar overlap" is withdrawn. It mixed engine timing (measured at well under 1 ms) with beat-grid accuracy (which dominates real-world drift). Both are now tested separately above.

## 10. Product Principles for AI

AI helps interpret user intent, explain possible approaches, and support exploration. It is not responsible for every technical decision.

The system distinguishes between:

- **Measured information:** estimated BPM, beat positions, and audio features.
- **Structural hypotheses:** possible phrases, arrangement changes, and transition opportunities.
- **Musical interpretations:** possible functions such as building expectation, sustaining groove, or releasing tension.
- **User preferences:** desired style, intensity, smoothness, and creative intent.
- **Execution instructions:** specific control changes and their timing.

Execution instructions are validated against the capabilities of the audio engine.

The product communicates uncertainty where appropriate. Audio analysis can suggest musical opportunities, but it cannot guarantee that a transition will feel right.

_(v0.2)_ **These layers are part of the data model, not only the copy.** Every piece of information shown to the user carries its layer and, where relevant, a confidence. The interface labels each layer consistently (for example: _measured_, _likely_, _interpretation_, _your choice_, _action_), and anything below "measured" can be corrected or overridden by the user. A language model may produce interpretations and preferences; it never produces execution instructions directly. It chooses and configures a strategy, and the engine turns that into validated instructions.

_(v0.3)_ In engineering terms, execution instructions are the control events of a schema-v1 transition plan (D-16). They are produced only by strategy functions or by the user's own edits, and they are validated against the mixer's capabilities (D-19) before anything is scheduled.

## 11. Success Criteria

The first MVP is evaluated through observed user behavior, not only feature completion.

### Primary validation questions

- Can users create and play a transition using their own tracks?
- Can they understand the relationship between controller movements and audible changes?
- Can they explain why one transition approach differs musically from another?
- Do they voluntarily experiment with alternative approaches?
- Can they apply something learned to a new transition without following the same instructions?
- Do they want to return and use the product with additional tracks?

### Proposed initial measures

These are hypotheses to test, not established benchmarks:

- At least 8 of 10 pilot participants complete a transition.
- At least 7 of 10 can explain one meaningful musical decision after using the product.
- At least 6 of 10 try an alternative transition approach without being prompted.
- Several participants return for another session using different tracks.
- Some participants demonstrate willingness to pay for continued access.

A small pilot can reveal usability problems and promising signals, but cannot establish market demand on its own.

_(v0.2)_ To support the pilot, the app keeps a local, opt-in session log (tracks loaded, plans created, variants compared, notes written; no audio and no file names unless the participant agrees) that the participant can export and share.

## 12. Main Risks

- **Technically correct, musically weak results.** A transition may align beats and avoid obvious conflicts while still feeling unnatural. Musical quality must be evaluated through listening and user testing.
- **Overconfident audio analysis.** Automatic phrase detection and structural interpretation may be wrong. Users need ways to correct the system and retain manual control.
- **Too much information.** The interface could overwhelm beginners with waveforms, controls, analysis, and explanations. Every visual element should help answer a specific musical question.
- **Automation undermining learning.** If users only press Generate, they may never develop musical judgment. The experience should make experimentation and comparison central.
- **Scope expansion.** Supporting multiple tracks, numerous effects, every genre, and complete set generation too early could delay validation of the core proposition.
- _(v0.2)_ **Harmonic clashes.** The target genres are melodic; two tracks in clashing keys can sound wrong however well the transition is executed. The MVP does not detect key. It should at least let the user enter each track's key and mention harmonic compatibility in explanations, and key detection is a candidate for the next release.
- _(v0.2, revised v0.3)_ **Pitch shift from tempo sync.** Without key lock, matching tempo changes the incoming track's pitch by 12·log₂(rate) semitones: about half a semitone for a 3% tempo change and one semitone for 6%. The MVP shows the change in semitones and warns from half a semitone (provisional).
- _(v0.3)_ **Technical risks.** The highest are beat-grid imprecision (a 0.1 BPM error drifts about 100 ms over 64 bars at 124 BPM), AIFF files that some browsers cannot decode, and memory use with long tracks. All technical risks, with mitigations and warning signs, are in [RISKS.md](RISKS.md).

## 12a. Privacy and rights _(v0.3)_

Users work with music they own or license.

- **What happens to audio.** Audio files are read and decoded in the user's browser and held in memory only while the page is open. They are never uploaded, never written to browser storage, and never redistributed.
- **What is stored, and where.** Analysis results (beat grid, sections, loudness), the user's corrections, transition points, variants, and notes are stored in the browser's IndexedDB on that device, keyed by a fingerprint (SHA-256) of the file. Nothing is synchronised between devices. Browsers may clear this storage (for example after a period of non-use or when space runs low), so the app offers export and import of this data as JSON.
- **Reopening files.** Browsers do not let a web page reopen a local file without the user choosing it again. After a reload, the user selects the files again and the app restores everything else.
- **Network.** The app makes no network requests other than loading its own files from the host. This is enforced by the Content Security Policy and checked by an automated test. The host (Azure Static Web Apps) keeps standard access logs (IP address, browser, requested app files) like any website.
- **Pilot session log.** Off by default; stored locally; exported only by the participant (§11).

## 13. Long-Term Direction

If the Transition Builder proves useful, DJ Flow Lab could evolve into a broader environment for developing musical judgment in DJing. Potential future directions include:

- More advanced transition strategies.
- Multi-track transition planning.
- Personal transition libraries and reusable experiments.
- Structured practice missions.
- Recording review and guided reflection.
- Adaptive exercises based on a user's current skills.
- Exploration of energy, texture, tension, and release across longer mixes.
- Tools that help DJs understand their own musical preferences and develop a distinctive style.
- _(v0.2)_ Importing beat grids and cue points from Rekordbox (XML export), so experienced users start from grids they already trust.
- _(v0.2)_ Key detection and harmonic-compatibility guidance.

These directions should follow evidence from the initial product rather than define the first release.

## 14. Guiding Principle

DJ Flow Lab should not aim to make every DJ mix the same way. It should help each DJ understand music well enough to make more intentional, informed, and personal decisions.

The goal is not to automate musical taste. It is to help musical taste develop.

## 15. Open questions

### Product questions _(v0.2, status v0.3)_

Recommended answers are in bold and are what the backlog assumes until changed. Question 1 is decided (browser web app, hosted on Azure Static Web Apps).

1. **Platform.** Browser web app, desktop app (Tauri/Electron), or a web app with a Python analysis server? → **Browser web app; analysis in the browser.**
2. **Tempo sync.** Playback-rate only (pitch moves with tempo) in the MVP, or key lock from the start? → **Playback rate first, key lock later.**
3. **Controller.** A generic two-channel mixer, or a look modeled on a specific controller the pilot users own? → **Generic two-channel mixer.**
4. **Strategies in the MVP.** Which two approaches form the first comparison? → **(a) Long blend with bass swap, (b) Phrase-boundary cut (decisive handoff).** A filter-sweep handoff is the third candidate.
5. **Explanations.** Who writes the musical reasoning for each strategy? → **Drafted in the repo, reviewed and rewritten by Andrei as the domain expert.**
6. **AI in the MVP.** Any language model before Assisted mode? → **No. Add it with Assisted mode, behind a small server-side proxy that holds the API key.**
7. **Key.** Manual key entry in the MVP, detection later? → **Yes.**
8. **Pilot.** Who are the first pilot users, and will sessions be moderated in person or remote? This shapes onboarding and the session log.

### Technical uncertainties _(v0.3)_

These are not guessed; each has a time-boxed experiment in [TECHNICAL_SPIKES.md](TECHNICAL_SPIKES.md).

1. Does the playback-anchor engine behave identically in Firefox (and Safari) to the Chromium results? → S1, S8.
2. Which formats decode natively in each browser, do browsers agree on MP3 timing, and what is the real memory ceiling? → S2.
3. Isolator EQ or shelving EQ; crossover frequencies; filter resonance; fader taper; whether −6 dB headroom is enough. → S3.
4. How reliable are the browser's output-latency figures, and how much calibration is needed for Bluetooth? → S5.
5. Is in-browser BPM/downbeat estimation good enough to be the default, or should the first-run flow lead with setting "the 1" by hand? → S6.
6. How often do tag edits change a file's fingerprint in practice, and how durable is browser storage? → S7.
