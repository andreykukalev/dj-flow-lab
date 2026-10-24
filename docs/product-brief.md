# DJ Flow Lab — Product Brief

- **Version:** 0.2 (draft for review)
- **Status:** Refined product definition, MVP scope proposed
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

These genres define the initial audience and testing environment, not a fundamental limitation. _(v0.2)_ In practice they share properties the MVP relies on: a steady tempo, a 4/4 grid, and phrases built in multiples of 8 bars. Tracks that break these assumptions (live drums, tempo drift, odd phrase lengths) should degrade gracefully into manual correction rather than fail.

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
- Basic phrase and arrangement-change detection.
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

The MVP proves the core learning experience before expanding into a broader platform.

## 9a. Working assumptions for the MVP _(v0.2)_

These are the defaults the backlog is built on. Each is listed in §15 so it can be challenged.

1. **Web app, local files.** The product runs in a desktop browser (Chrome, Edge, Firefox, Safari). Audio is decoded and analyzed on the user's machine and is never uploaded.
2. **Constant-tempo grid.** Each track is described by one BPM and the position of its first downbeat. The user can correct both (nudge, halve/double BPM, set "the 1").
3. **Tempo sync by playback rate.** The incoming track's speed is adjusted to match the outgoing track, which also shifts its pitch, like a turntable or a controller without key lock. Key lock (time-stretching) comes later.
4. **A generic two-channel mixer.** The virtual controller shows, per channel: trim, 3-band EQ (high, mid, low), a bipolar filter (low-pass ← → high-pass), and a channel fader; plus a crossfader. No jog wheels, loops, or FX in the first pass.
5. **Explanations are authored, not generated.** In the MVP, each strategy carries hand-written musical explanations for its key actions, filled in with facts about the specific tracks. A language model is added later for Assisted mode.
6. **Time is measured in beats.** Plans are written in bars and beats relative to the transition, not in seconds, so the same plan stays musically correct after a tempo change.

## 9b. Acceptance criteria for the must-haves _(v0.2)_

| Must have | Done when |
|---|---|
| Import two local tracks | The user can drop or choose MP3, WAV, AIFF, or FLAC files onto deck A and deck B; unsupported files show a clear message. |
| Waveforms and timing | Each deck shows a waveform with bar lines, a bar counter, and BPM. Phrase markers every 8/16/32 bars are drawn from the downbeat. |
| User-selected points | The user can set the exit point on A and the entry point on B, snapped to bars, and move them. |
| One executable plan | Choosing a strategy produces a plan whose every control change is within the mixer's range and timed on the beat grid. |
| Synchronized playback | Both decks play beat-aligned through the transition; drift stays under 5 ms over a 64-bar overlap. |
| Virtual controller | Faders, EQ knobs, and filters move in step with the audio during playback and seeking. |
| Transport | Play, pause, seek (click on the timeline), and replay the transition from its start; seeking lands controls and audio in the right state instantly. |
| Explanations | Each key action in the plan has a short "why" that appears at the moment it happens and on hover in the timeline. |
| Compare two approaches | The user can keep at least two variants and switch between them while listening, from the same musical position. |

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
- _(v0.2)_ **Pitch shift from tempo sync.** Without key lock, large tempo differences (above roughly 6%) audibly change the incoming track's pitch. The MVP warns when the tempo gap is large.

## 12a. Privacy and rights _(v0.2)_

Users work with music they own or license. DJ Flow Lab never uploads, stores remotely, or redistributes audio. Analysis results (beat grid, phrases, user corrections) are stored locally in the browser, keyed by a fingerprint of the file, so returning to a track does not repeat the analysis.

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

## 15. Open questions _(v0.2)_

Decisions the backlog depends on. Recommended answers are in bold and are what the backlog assumes until changed.

1. **Platform.** Browser web app, desktop app (Tauri/Electron), or a web app with a Python analysis server? → **Browser web app; analysis in the browser.**
2. **Tempo sync.** Playback-rate only (pitch moves with tempo) in the MVP, or key lock from the start? → **Playback rate first, key lock later.**
3. **Controller.** A generic two-channel mixer, or a look modeled on a specific controller the pilot users own? → **Generic two-channel mixer.**
4. **Strategies in the MVP.** Which two approaches form the first comparison? → **(a) Long blend with bass swap, (b) Phrase-boundary cut (decisive handoff).** A filter-sweep handoff is the third candidate.
5. **Explanations.** Who writes the musical reasoning for each strategy? → **Drafted in the repo, reviewed and rewritten by Andrei as the domain expert.**
6. **AI in the MVP.** Any language model before Assisted mode? → **No. Add it with Assisted mode, behind a small server-side proxy that holds the API key.**
7. **Key.** Manual key entry in the MVP, detection later? → **Yes.**
8. **Pilot.** Who are the first pilot users, and will sessions be moderated in person or remote? This shapes onboarding and the session log.
