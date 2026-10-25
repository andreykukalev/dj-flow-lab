# Web MVP UX, adapted from the iOS mockups

- **Status:** v1, 2026-10-24. Agreed direction: the web MVP follows the iOS UX concept ([`design/ios/README.md`](../design/ios/README.md)) and its iPad mockups ([`design/ios/mockups/`](../design/ios/mockups/index.html)).
- **Scope:** how the five iPad landscape screens become the web MVP's screens, what changes in a desktop browser, and which backlog issue builds each part. The product scope stays the brief's ([PRODUCT_BRIEF_v0.3.md](PRODUCT_BRIEF_v0.3.md)); nothing here adds a feature outside it.

## 1. What carries over unchanged

- **The learning loop is the navigation.** Listen, Intend, Try, Compare, Reflect is a segmented control in the pair header. Every screen belongs to one step, and the next step is always one click away. Import comes before the loop.
- **One plan drives everything.** Timeline, plan lanes, mixer and "Why it moves" all read the same compiled plan at the same beat (D-17, D-20).
- **Knowledge layers are visible.** Chips for _measured_, _likely_ (dashed), _interpretation_, _your choice_ and _action_ (brief §10, #31).
- **Deck colours:** A blue, B orange, differing in lightness as well as hue, and always labelled A or B.
- **Precision by steps, speed by drag.** Dragging gets close; step buttons, keys and snapping get it right.

## 2. Layout in a browser

| Window width | Layout |
|---|---|
| ≥ 1200 px | The iPad landscape layouts as drawn. |
| 900–1199 px | Same screens; the right column (suggestions, "Why it moves", reflect) moves below the main area. |
| < 900 px | Not a target for the MVP. The app shows a short note asking for a wider window; phones are the iOS app's job. |

The app is dark only in the MVP, as in the mockups. Colours, type sizes, radii and chip styles are design tokens (CSS custom properties) so a light theme can be added later.

**App shell (iPad 1):** a left sidebar with Transitions, Tracks, Practice notes and Settings, and the note "Your tracks stay in this browser. Nothing is uploaded." Inside a pair, the header shows `A → B` names, the current strategy and variant, the loop control, and Render.

**Mode control:** the MVP is Manual only (Assisted and Auto are Later, #38), so the Manual · Assisted · Auto control is not shown. It appears when Assisted ships, in the place the mockups give it.

## 3. Screens

| Screen | Mockup | What it holds on the web | Differences from iOS | Issues |
|---|---|---|---|---|
| Import and pairs | iPad 1 | A and B slots, "Your tracks" with analysis status and progress, recent transitions, Start listening. | Files come from the file picker or drag and drop. A browser cannot reopen a file after a reload, so a remembered track shows "Select the file again" and is matched by fingerprint (D-22). No iCloud, Files or DRM rows. The key column shows only a key the user entered (#32); there is no key detection. | #7, #11, #48, #34 |
| Listen | iPad 2 | Per deck: overview bar and zoomed waveform with bars and phrase lines; grid tools (Tap the 1, Set the 1 here, Two-point fix, ×2, ÷2, nudge); exit and entry markers with a magnifier and snapping that prefers phrase lines; section chips (_likely_) with confirm, move, remove; suggestions column; footer "A 97 meets B 1 · B +1.22 %, +0.21 st · Next". | Mouse drag and hover magnifier; keys ←/→ move a marker by a bar, Shift by a phrase. Until M4 the suggestions column shows only the user's own choice. | #8, #10, #15, #29, #30 |
| Intend | iPad 3 | "What should this transition do for the listener?" with intention chips (Keep the groove going, Lift the energy, Reset the room, Let it breathe); two or three approach cards with _fits_ and _trade-off_, a mini lane preview, Try, and Keep as variant; one card may be shown "for contrast". | No free-text intention or "how the app reads it" panel until Assisted mode (#38). Approaches are the strategies that exist (long blend, phrase-boundary cut); the filter handoff card waits for that strategy (Later). | #56, #17, #23, #26 |
| Try | iPad 4 | Timeline with both decks on one bar ruler, overlap shaded, exit/entry, handoff and playhead lines, section chips and explanation markers; plan lanes (one per automated control); the mixer (two strips: high, mid, low, trim, filter, fader; crossfader) with a dashed ring and caption on a control about to move; "Why it moves" (now, listen for, next with a beat countdown, later); variants switch at the same beat; transport (replay, phrase back and forward, play/pause, loop overlap, position in transition bars and each deck's bars, tempo change in % and semitones, output latency offset). | Keyboard: Space play/pause, ←/→ bar, Shift+←/→ phrase, R replay, L loop overlap. Hovering an explanation marker shows its title. The output shows the browser's latency estimate and the calibration offset, not a route name (D-21). | #13, #19, #20, #21, #24, #45 |
| Compare and reflect | iPad 5 | Variants stacked with their lanes and one shared playhead; Hear 1 / Hear 2 switching at the same beat; optional blind test; what differs, as rows with layer chips; reflect panel with the intention, "Which one served it better?", a note, Render both, Save note. | None beyond keyboard shortcuts (1 and 2 switch variants). | #24, #25, #31, #35, #36 |

All mockups show the same moment (two bars before the bass swap of a 32-bar long blend, A bar 97 into B bar 1). The web build uses the same moment for its demo pair and screenshots, so screens can be compared with the mockups one to one.

## 4. Not carried over from iOS

Haptics, rotating the phone for the full mixer, the iPhone focus mixer, file bookmarks, background audio and Now Playing, route names, and Apple Pencil. None is in the web MVP's scope.

## 5. Accessibility

- Controls are announced as state and intent, for example "Deck B low EQ, killed, returns to full at bar 113" (from the plan, not invented).
- Every action has a keyboard path; focus is always visible.
- Text and chips meet WCAG AA contrast on the dark theme; deck colours are never the only cue.
- `prefers-reduced-motion` keeps the mixer in sync but drops decorative transitions.

## 6. Build order

The proof of concept builds the Try canvas mixer first (#45, S5) as the real component, not a throwaway. Then the app shell and design tokens (#55, M1) come before the first product screen (#7). Each later issue builds its part of a screen as listed above.
