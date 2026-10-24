# DJ Flow Lab for iPhone and iPad: UX concept

- **Status:** Draft 1 for review, 2026-10-24. UX concept and mockups only; no app code yet.
- **Based on:** [product brief v0.3](../../docs/PRODUCT_BRIEF_v0.3.md), [architecture](../../docs/architecture.md), [technical decisions](../../docs/TECHNICAL_DECISIONS.md) and [backlog](../../docs/backlog.md). The web MVP is the reference product; this document describes how the same Transition Builder works on touch devices.
- **Mockups:** ten screens in [`mockups/`](mockups/index.html) (open `mockups/index.html` in a browser). The editable source is a design canvas in claude.ai, linked from the pull request that added this folder.

## 1. What the iOS app is for

The iOS app teaches the same thing as the web MVP: why a transition works, when to make it, and how to carry it out. It is not a performance DJ app and does not replace Rekordbox or a controller.

What touch devices add to the learning loop:

- **Practice away from the laptop.** Listening, comparing and reflecting work well on a sofa with headphones.
- **Controls you can touch.** Seeing a knob move under your finger in time with the sound makes the link between action and sound more direct than a mouse does.
- **iPad as a learning canvas.** In landscape, an iPad shows both tracks, the plan, the mixer and the explanation at once, which is the brief's core experience.

## 2. Platform basis (decided)

Decided with Andrei on 2026-10-24:

| Layer | Choice | Why |
|---|---|---|
| UI | SwiftUI, iPadOS and iOS from one target | Native gestures, haptics, sheets, size classes, accessibility. |
| Audio | AVAudioEngine | Sample-accurate start times, low output latency, proper interruption and route-change handling, background audio. |
| Engine | The existing pure-TypeScript engine (`src/engine`: timing, plan schema v1, strategies, validation, compile, `stateAt`) running in JavaScriptCore | Plans, strategies and explanation content stay one codebase with the web app. The engine was designed without browser APIs, so this needs no rewrite. |
| Contract | Transition plan schema v1 (D-16) and compiled segments (D-17) as JSON between the TS engine and Swift | The Swift side only schedules and renders what the engine compiled, exactly as the web scheduler and controller do. |

UX consequences of this choice, used throughout the mockups:

- Imported files can be reopened automatically after a relaunch (saved file bookmarks), which the web MVP cannot do (brief §9).
- Haptics mark bars, phrase lines and snapping.
- Output latency is known per route (wired, AirPods, speaker), so the controller can stay aligned with what is heard (D-21).

## 3. Principles carried over, and what changes on touch

Unchanged from the brief: music first, explain why, labeled knowledge layers (_measured_, _likely_, _interpretation_, _your choice_, _action_), and one plan driving audio, controller and explanations.

Touch-specific rules:

1. **The learning loop is the navigation.** Listen, Intend, Try, Compare, Reflect is a segmented control on iPad and a five-step progress bar on iPhone. Every screen belongs to one step, and the next step is always one tap away.
2. **The mode is always visible.** Manual, Assisted and Auto sit next to the loop on iPad and in a menu button on iPhone. Switching mode never discards the user's own choices.
3. **Show what is moving, not everything.** The iPad shows the full mixer; the iPhone shows only the controls that are moving now ("focus mixer"), with the full mixer one rotation away.
4. **Precision by steps, speed by drag.** Dragging is for getting close; step buttons (−16, −1, +1, +16 bars) and snapping are for getting it right. Small screens rely more on steps.
5. **Targets are at least 44 pt.** Knobs in demonstration mode are display-only; when they become editable (backlog #27), they use vertical drag, not rotation.

## 4. Layouts by device

### iPad, landscape (primary)

Regions, top to bottom on the left, with a fixed column on the right (mockup iPad 4):

- **Header:** pair, current strategy and variant, learning-loop control, mode control, render and share.
- **Timeline:** both decks on one shared bar ruler, A above B; overlap shaded; exit/entry line, handoff line and playhead drawn across both decks; section hypotheses as dashed _likely_ chips; explanation markers between the decks.
- **Plan lanes:** one line per automated control (A low, B low, B fader, A fader), aligned with the timeline, so the user sees the shape of the plan.
- **Virtual mixer:** two channel strips (high, mid, low, trim, filter, fader) and the crossfader. A control that is about to move gets a dashed ring and a caption ("kill at 113").
- **Why it moves (right column):** the current explanation with its layer, a "listen for" cue, the next event with a beat countdown, and what comes later. Below it, the variant switcher.
- **Transport:** replay, phrase back and forward, play/pause, loop overlap, position in transition bars and in each deck's bars, tempo change in % and semitones, output route and its latency offset.

### iPad, portrait and Split View

When the app is narrower than about 700 pt (portrait with Split View, Stage Manager windows), it switches to the iPhone layouts. In full-width portrait, the timeline and plan lanes stay on top, the mixer goes below, and "Why it moves" becomes a resizable bottom sheet.

### iPhone, portrait

One step of the loop per screen (mockups iPhone 1–4). The waveform moves under a fixed centre line, so the user never has to hit a thin marker with a finger. In Try, the screen shows a compact two-deck timeline, the focus mixer, the transport and an explanation sheet.

### iPhone, landscape

Turning the phone in Try shows the full mixer with a mini timeline and a one-line explanation ticker (mockup iPhone 5).

## 5. Screens

| Mockup | Loop step | What the user does | Must-haves served (brief §9) |
|---|---|---|---|
| iPad 1 · Import and pairs | before Listen | Picks outgoing and incoming tracks; imports from Files or by drag and drop; sees analysis status per track. | Import two local tracks |
| iPad 2 · Listen | Listen | Corrects the beat grid, drags exit and entry with a magnifier, confirms or removes section hypotheses, picks from suggested points with reasons. | Waveforms and timing; user-selected points |
| iPad 3 · Intend | Intend | Describes the intended effect in words (Assisted) or picks one (Manual); checks how the app read it; sees two or three approaches with fit and trade-off, including one shown for contrast. | Explain; compare approaches |
| iPad 4 · Try | Try | Plays the transition, watches the mixer, reads why each action happens, loops the overlap, switches variant at the same beat. | Plan, synchronized playback, controller, explanations |
| iPad 5 · Compare and reflect | Compare, Reflect | Switches between variants at the same beat, optionally blind; reads what differs; writes a note; renders both to audio. | Compare two approaches; reflection note; render |
| iPhone 1 · Pairs and import | before Listen | Sees recent pairs; adds tracks from Files, the share sheet or the music library. | Import |
| iPhone 2 · Listen | Listen | Moves exit and entry with drag, step buttons and suggestions. | User-selected points |
| iPhone 3 · Try | Try | Plays with the focus mixer and an explanation sheet. | Playback, controller, explanations |
| iPhone 4 · Compare and reflect | Compare, Reflect | Two large Hear buttons, differences, note. | Compare; reflection note |
| iPhone 5 · Full mixer | Try | Full mixer in landscape. | Controller |

The mockups show a fixed moment (two bars before the bass swap of a 32-bar long blend, A bar 97 into B bar 1) so that every screen tells the same story. Track names are invented.

## 6. Touch and haptics

| Gesture | Where | Result |
|---|---|---|
| Drag horizontally | Timeline, waveforms | Scrub; playback follows on release (D-05 "start at beat _b_"). Light haptic on each bar, stronger on phrase lines. |
| Pinch | Timeline | Zoom between whole track and 4 bars. |
| Drag a marker handle | Exit, entry (iPad) | Move with a magnifier showing kicks against the grid; snaps to bars, prefers phrase lines; haptic on snap. |
| Drag the waveform | Exit, entry (iPhone) | The line stays fixed in the middle; the track moves under it. |
| Tap | Explanation marker, moving control | Opens its explanation; tapping a control highlights its lane. |
| Long-press | Section hypothesis | Menu: confirm, move, remove. |
| Tap rhythmically | "Tap the 1" | Sets the downbeat and tempo by tapping along. |
| Double-tap | Editable control (later, #27) | Back to default. |
| Rotate iPhone | Try | Switches between focus mixer and full mixer. |

Haptics are optional (Settings) and never replace a visible or audible cue.

## 7. Importing local files on iOS

- **Sources:** the Files picker (iCloud Drive, On My iPhone/iPad, USB drives and SD cards, third-party file providers), "Share → DJ Flow Lab" from other apps, drag and drop from Files on iPad, and music-library tracks stored on the device without copy protection.
- **Not possible:** streaming and copy-protected music-library tracks cannot be decoded. The track list says so in plain words instead of failing silently (mockup iPad 1).
- **Formats:** WAV, AIFF, FLAC, ALAC, MP3 and AAC, decoded natively. The 15-minute limit from the web MVP stays until memory is measured on devices.
- **Reference, not copy:** files are opened where they live and remembered with a bookmark, so they reopen after a relaunch. If a file moved or its iCloud copy is not downloaded, the app asks the user to locate it, or downloads it with progress.
- **Identity and storage:** the SHA-256 fingerprint (D-22) keys analysis, corrections, points, variants and notes, as on the web, so the same file gives the same results on both. Audio is never uploaded.

## 8. Audio and the controller on iOS

- **Heard time:** the controller is drawn at the time the user hears, using the route's output latency (D-21). Bluetooth headphones get a one-time calibration (tap along to a click); the transport shows the active route and its offset.
- **Interruptions:** a call, Siri, or unplugging headphones pauses at the current beat, and Play resumes from it (D-06).
- **Silent switch and background:** playback ignores the silent switch and continues with the screen locked, with Now Playing controls; the controller simply resumes on the next frame.
- **Tempo:** deck B's rate change is shown in % and semitones, as on the web (D-07). Key lock remains out of scope.

## 9. Modes and AI on iOS

- Manual, Assisted and Auto work as in the brief §7. The intention field accepts typing and dictation.
- The app reads the intention back as labeled _interpretation_ rows the user can change, and offers two or three strategies with "fits" and "trade-off". One may be deliberately contrary ("for contrast"), so comparing teaches something.
- Assisted mode is the only feature that needs a network connection (the server-side proxy from brief §15 Q6). The rest of the app works offline, and Assisted shows clearly when it is unavailable.

## 10. Accessibility

- VoiceOver reads controls as state and intent: "Deck B low EQ, killed, returns to full at bar 113."
- Explanations support Dynamic Type; the mixer and timeline keep fixed sizes but expose values to VoiceOver.
- Deck colours (blue A, orange B) differ in lightness as well as hue, and every deck is also labeled A or B.
- Reduce Motion keeps the controller in sync but drops decorative transitions.

## 11. Scope compared with the web MVP

| Topic | Web MVP | iOS app |
|---|---|---|
| Reopen files after reload | No (re-select files) | Yes (bookmarks) |
| Haptic bar and phrase feedback | No | Yes |
| Engine, strategies, explanations | TypeScript | Same TypeScript, via JavaScriptCore |
| Audio | Web Audio | AVAudioEngine |
| Physical controllers, key lock, multi-track sets | Out of scope | Out of scope |
| Apple Pencil, MIDI controllers | n/a | Later candidates, not in the first iOS release |

## 12. Open questions, with recommendations

1. **Order of devices.** iPad first, with the iPhone layouts in the same app but polished second. → **iPad-first pilot on TestFlight.**
2. **Minimum OS.** → **iOS and iPadOS 17**, which covers current SwiftUI APIs used here.
3. **Keep a copy of imported files?** → **Reference by default**, with an optional "Keep a copy on this device" for iCloud files that are often offloaded.
4. **Editing a plan by touch (backlog #27).** → Drag points on the plan lanes with bar snapping; hold a second finger for fine steps. To be mocked when #27 is designed for the web.
5. **Sync between web and iOS.** Out of scope for now (no accounts); JSON export/import (D-24) moves a pair's corrections and variants between devices.

## 13. Next steps

1. Review these screens with Andrei and two or three DJs from the pilot group; adjust layouts.
2. Turn the iPad Try screen into a clickable prototype to test the timeline and focus-mixer interactions.
3. Write the iOS implementation plan: JavaScriptCore bridge for the engine, AVAudioEngine mixer and scheduler (including a spike on sample-accurate EQ and filter automation), file import and bookmarks, and the sync tests that mirror the web acceptance criteria in brief §9b.
