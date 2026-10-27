# UX audit and redesign plan

October 2026. The audit was made by reading the code (`src/ui/set`, `src/poc`, `src/engine/set`) and rendering every screen with Playwright on `main` at 1280 px. The plan is carried out in five pull requests, listed at the end.

## 1. The main UX problems

The product's pieces all work, but they are stacked rather than composed: the Lab is the proof-of-concept page dropped under a versions panel, the four areas look like four equal buttons, and nothing on screen says what has been decided or what to do next.

| Where         | Problem                                                                                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everywhere    | No sense of place or progress. The four tabs are identical buttons; the Lab appears as a fifth tab only while it is open; disabled tabs give no reason; no screen says what is decided, what is open, or what the next useful action is.                          |
| Everywhere    | English-only, hard-coded copy in 20+ components and in the engine (`observations.ts`, `readings.ts`, `sheet.ts`, `autoPoint.ts`, `loopText.ts`). No language layer.                                                                                              |
| Everywhere    | Competing labels: `likely`, `interpretation`, `measured`, `your choice` chips repeat on every card and slot; most explanations live only in hover `title` attributes.                                                                                             |
| Everywhere    | Destructive actions (remove a track from the collection, remove a version) act at once, with no confirmation.                                                                                                                                                    |
| Your music    | The page opens with a privacy paragraph, a "not measured" note and a "Keep and pass the set" panel before any track. Tracks show file names, a dominating shape bar and a row of BPM, Confirm, Key, Sections that reads as the page's purpose. Primary action last. |
| Concepts      | Observations and readings are the same kind of card. A reading's three layers (idea, why, what to explore) are not visually distinct; evidence links jump to anchors; nothing marks the concept already chosen.                                                   |
| The set       | The arc chart takes the top third; each slot carries an unlabeled `Arc` slider and a repeated chip. Transitions are thin rows whose status is a bare word. Nothing summarises what remains before the set is playable.                                          |
| Lab           | The mixer and transport, the product's signature, are at the bottom of a 2,500 px page; grid tools and the versions panel come first; the mixer is never on screen with the mixing line; the header still says `proof of concept`; calibration sits in the transport. |
| Perform       | Content is right (who plays, cues, steps with why), but the header is prose, `Who plays when` repeats BPM/key/length from the set, and the rekordbox panel is two paragraphs. No summary of unresolved transitions.                                               |
| Collaboration | Two DJs exist (owner colours, `You are`, versions by author, picks) but a decision's state is visible only inside the Lab. The spine says `tried` or `agreed by both`, never who suggested what or what still needs listening.                                  |

## 2. Recommended information architecture

One journey, five places, the Lab at its centre: **Your music → Concepts → The set ⇄ Lab → Perform**. The four areas stay; the Lab becomes a first-class place rather than a mode of the set, because it is where every musical decision is made and heard.

**The journey bar** replaces the four equal buttons. Each step shows a number, its name and one line of state read from the store (`4 tracks ready`, `A Steady Climb chosen`, `1 of 3 tried`, `2 without a version`). A step that cannot be opened says why in that line. Moving between steps never loses work.

**The Lab** is reachable from any transition on the set and from the journey bar (which reopens the last transition). Inside, the hero comes first and the tools sit around it:

1. Top strip: `Transition 2 of 3 · deep-123 → peak-124 · Andrei brings it in`, status, previous/next transition, back to the set.
2. Hero, always visible together: the mixing line (both decks on one bar ruler with EQ, filter and fader lanes), the virtual mixer animating under it, and a sticky transport.
3. Left column, _The moment_: whole tracks with sections and the blend lane, blend start and area, Auto, Loop. Grid tools fold under _Grid_ and open by themselves only when the phrase check says the grid fits badly.
4. Right column, _Versions and decision_: save what plays, versions by author, compare on one playhead, bar-pinned comments, picks. Calibration folds under _Sync_.

**Header**: product name, then a compact right group: _You are_ (which DJ is at the screen; versions, comments and picks are signed by them), language (EN / RU), and a _Set_ menu holding pass / open / new set.

**Collaboration states** become one vocabulary used on the set, in the Lab and on the sheet: _not tried_, _tried_, _suggested by Andrei_, _versions to choose between_, _needs auditioning_ (a version the other DJ has not heard), _agreed by both_, _keep both for the night_. All derive from data the store already keeps, plus one per-version flag: heard by each DJ.

`/poc/` is untouched: the Lab reuses its components in a new composition under `src/ui/lab/`, and the PoC page keeps its own layout and English copy.

## 3. Design principles to preserve

- **Music first, verifiable by ear.** Every claim keeps its `Hear it` button; nothing is recommended that cannot be played.
- **Knowledge layers stay honest.** _measured_, _likely_, _interpretation_, _your choice_ remain, as one chip per card where the layer changes meaning. The "not measured yet: vocals, melody, key" statement stays, once per screen.
- **The app never picks.** Readings are offered, none marked best; the decision on a transition needs both DJs; `Keep both, choose on the night` stays a valid outcome.
- **One plan drives audio, mixer and words.** The Lab's timeline, mixer and sheet all read the compiled plan; the redesign rearranges, it does not re-implement.
- **Local first.** Audio never leaves the browser; the set is kept without audio in IndexedDB and passed as a file. The copy says exactly this, in both languages.
- **Visual identity.** Dark neutral surfaces, subtle 1 px borders, deck A blue / deck B orange, the purple `--explain` reserved for interpretation and the chosen concept, the yellow `--blend-mark` for the blend start. No new colours.
- **Nothing irreversible.** Undo/Redo/Reset in the Lab stay; destructive actions elsewhere gain a one-step confirmation.

## 4. Proposed changes per area

**Your music** (prepare the material). The track list leads: title, owner colour, length, tempo with its confidence, key if typed, a small shape. Each track carries one clear state: _analysing_, _ready_, _estimate to confirm_, _file needed_, _could not decode_. The save/pass/open/new actions move to the header's _Set_ menu; the _not measured_ note becomes one short line.

**Concepts** (the most important area). Observations become a compact strip with `Hear` buttons. Readings become comparable cards with three fixed layers: **The idea** (name, three words, the narrative, the functions in order), **Why it might work** (each line with its layer and a `Hear` button inline), **What to explore** (the question). The chosen reading is marked and offers `Back to the set`; switching concepts keeps the previous set's work by pair of tracks.

**The set** (the playable journey). A summary strip: the concept, the functions as a line, the transition tally. The arc becomes a small strip where the line is _your intention_ and the dots are _measured drive_; the per-slot slider is labelled `Intended energy`. Slots become rows; each transition is a wider row with status in the shared vocabulary, who mixes it, the version count and `Open in the Lab`.

**Lab** (the core). See section 2. The header says the strategy in plain words without `proof of concept`; the transport shows position in bars and both decks; `Your take` stays beside the mixer; Auto's reasons keep their list form.

**Perform** (the performance sheet). Order first; one section per transition with its intention, cue line, steps table and version name; a warnings box listing unresolved items (`Transition 2 has no version`, `Track 3 needs its file`); rekordbox export as a short form.

### Reference patterns used

| Reference                  | Pattern taken                                                                      | Adapted as                                                                                             | Not copied                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| DJ.Studio transition editor | A transition frame, automation lanes, a _next transition_ button                   | Previous/next transition in the Lab strip; the blend lane handles; lanes on the mixing line            | Curve-preset editing of every setting: the plan is generated from a musical choice     |
| Ableton Session View       | Non-linear trying versus the linear Arrangement; _capture_                         | Concepts and the Lab are the session, the set and the sheet the arrangement; `Save as a version`       | The clip grid: our material is two tracks and a moment                                 |
| Figma comments             | Comments pinned to a position                                                      | Bar-pinned comments shown as markers on the mixing line and listed by bar                              | Real-time multiplayer and mentions: two DJs at one screen, or passing a file           |
| Mixmap                     | Explanations beside each connection; alternatives; nothing changes until approved  | Explanations with evidence beside each suggestion; alternatives per slot; nothing moves by itself      | The free canvas and the chat assistant: a set is time and order, taste is not a chat   |

## 5. Localization approach (en/ru)

No library: `src/i18n/` holds `en.ts` and `ru.ts` as flat key maps with `{param}` placeholders and inline plural forms (`{n|one|few|many}` for Russian, `{n|one|other}` for English), `t(key, params)`, and a React context with `useT()`. The language is read from `localStorage` (`dj-flow-lab.lang`) and, with none saved, from `navigator.language` (`ru*` → ru, else en). The set file and IndexedDB formats do not change.

- The engine stays pure and keeps English as its default: functions that produce prose take an optional translator, so unit tests keep passing and the store passes the current language in. Cached prose is recomputed on a switch.
- Authored content (the readings' names, words, ideas and questions) lives in the dictionary and is looked up by reading id, so a set saved in English shows its concept in Russian. User text (track titles, DJ names, version names, comments, reasons) is never translated.
- DJ terminology stays as DJ terms: BPM, EQ, LOW/MID/HI, CFX, PLAY, LOOP IN, hot cue, rekordbox, the section terms INTRO…OUTRO and the functions OPEN…RESOLVE.
- Register: both DJs are addressed as «вы». Your music → Ваша музыка, Concepts → Концепции, The set → Сет, Lab → Лаборатория, Perform → К выступлению (the heading reads Подготовка к выступлению), Explore my tracks → Исследовать треки, Why it might work → Почему это может сработать, What to explore → Что попробовать, Energy arc → Энергетическая дуга, blend start → точка сведения, transition area → зона перехода.
- Layout: Russian strings run 20 to 40 % longer; buttons wrap rather than truncate; the journey bar scrolls under 900 px. Both languages are checked on every screen at 1280 px and 900 px.
- Tests: unit tests for the dictionaries (same keys, same parameters, plurals), the journey bar's state lines in both languages, and the existing browser suite kept green in English.

## 6. Risks

| Risk                                        | Mitigation                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaking `/poc/` while reusing its components | Components keep their English labels when no language provider is present; the Lab composes them in `src/ui/lab/`; the PoC suite runs on every PR |
| Browser tests locate elements by English text | English remains the default in tests; renamed labels are updated in the same PR                                                                   |
| Prose generated inside the engine           | Optional translator argument with an English default; dictionaries in `src/i18n`                                                                  |
| Saved sets carry a reading's English name   | Display name looked up by reading id for authored readings                                                                                        |
| Layout at narrower widths                   | The Lab's hero stacks below 1100 px; below 900 px the app keeps working but is not a target                                                       |
| CI time (5 minutes per job)                 | New browser tests are few and short; unit tests carry the dictionary checks                                                                       |

## 7. Implementation stages

Each stage is one pull request with CI under 5 minutes, merged once green.

1. **Foundation**: `src/i18n`, the language selector, the journey bar with state lines, the header's _You are_ and _Set_ menu, confirmations, every planning screen and the Lab's versions panel translated, the engine's translator argument.
2. **The Lab as the core**: the `src/ui/lab/` composition, previous/next transition, comments as markers on the mixing line, the PoC components localized with English kept for `/poc/`.
3. **Your music and Concepts**: the track library hierarchy and states, the three-layer concept cards, switching concepts without losing work by pair.
4. **The set and Perform**: slot rows, transition rows with the shared vocabulary, the summary strip, intended energy versus measured drive, the warnings box, the shortened rekordbox form, the _heard by_ flag.
5. **Validation and backlog**: the brief's scenarios in both languages, screenshots at 1280 px and 900 px, closing shipped issues and updating the ones this work touches, the final summary.

Not in scope: a new backend, a language model, key detection, vocal or melody analysis, rekordbox import, hot cues and jumps, real-time collaboration.
