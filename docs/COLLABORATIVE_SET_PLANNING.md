# Collaborative set planning: discovery and prototype 1

- **Status:** discovery draft 1, 2026-10-25. Product discovery and UX prototyping only; no app code.
- **Mockups:** design canvas "DJ Flow Lab · Set planning together" (claude.ai, linked from the pull request that added this file). The board sources are in [`design/collab-set/src/`](../design/collab-set/src/).
- **Builds on:** [PRODUCT_BRIEF_v0.4.md](PRODUCT_BRIEF_v0.4.md) (choosing the moment, simplicity invites exploration, AI as the explainer), [MUSICAL_LANGUAGE.md](MUSICAL_LANGUAGE.md) (functions and structure terms), [WEB_UX.md](WEB_UX.md) (progressive disclosure, knowledge-layer chips) and the iOS mockups ([`design/ios/`](../design/ios/README.md)), whose visual language the boards reuse.
- **Andrei's direction (2026-10-25):** DJ Flow Lab helps DJs uncover the stories hidden in their collections, explore unexpected connections between tracks and turn them into a cohesive set. The question is not "which tracks mix well?" but "what story can we tell with this music, and how do we make sure the listener feels it?". Three levels in one cycle: **Discover** (connections), **Imagine** (concepts), **Explore** (sequences, transitions, key moments). The product offers possibilities, not prescriptions, and every concept must be verifiable by ear. Andrei's message described the first two concepts ("Into the Unknown", "Hidden Euphoria") and ended there; the other two on the canvas are ours.

## 1. Reference products

"Exists" is what the product does today, as far as we know from its public material. "For us" is our hypothesis, not a validated benefit.

| Product | User problem it solves | Pattern worth learning | For us (hypothesis) | Do not copy, and why |
|---|---|---|---|---|
| **DJ.Studio** | Building a mix offline, without performing it live. | Exists: a timeline of overlapping tracks, a transition editor with automation and effects, "Harmonize" ordering by BPM and key, Automix, stems, library import from rekordbox, Serato, Traktor and others, export to audio, Mixcloud, YouTube and Ableton. | A set laid out on time; zooming from the whole mix into one transition. | Automix and harmonic ordering as the entry point: they answer "what mixes well", not "what story". Its goal is a rendered mix; ours is a set two people will perform. A DAW-dense automation surface contradicts "simplicity invites exploration". |
| **Ableton Live, Session View** | Trying combinations of musical material without committing to an order. | Exists: a grid of clips and scenes, launched in time with launch quantisation; a session can be recorded into the Arrangement. | Sections as things you launch against each other, quantised to the phrase: "hear A's outro into B's intro" in one action. Capturing a take while experimenting (already in the PoC as "Your take"). | The clip grid as the whole interface: it serves producers and live performers, and asks beginners to think in clips and scenes before music. |
| **Figma** | Many people deciding together on visual work. | Exists: comments pinned to a place in the design, multiplayer editing, version history, branches on some plans. | Comments pinned to a bar of a transition; versions of a transition side by side; a decision with a reason that stays attached. | Real-time multiplayer as the first step: our users mostly need asynchronous and same-room work (assumption, §3). The infinite canvas (see Miro). |
| **Miro** | Mapping ideas and their relationships, then converging. | Exists: free canvas, sticky notes, connectors, voting sessions. | Voting on alternatives; the idea that a set can branch. | A free canvas as the planning surface: a set is made of time and order, which a canvas hides. Alternatives stay local to a slot or a transition instead (§4). |
| **Spotify** | Finding, collecting and sharing music without effort. | Exists: playlists that anyone can scan; collaborative playlists showing who added each track; Blend, a shared playlist built from two people's listening. | A light library: title, owner, one shape, play. Showing who brought each track. Blend's framing: two tastes as the material, not a conflict. | Opaque recommendation ("made for you"): it contradicts "verifiable by ear". Engagement patterns (endless shuffle, autoplay) that keep listening passive. |
| **rekordbox** (added) | Preparing and performing on Pioneer gear: Andrei's DDJ-400. | Exists: playlists, hot cues and memory cues, comments and colours per track, an XML format that carries playlists and cues in and out. | The destination of "prepare to perform": a playlist in set order with the cues and notes the plan needs, imported by each DJ on their own computer. | Its analysis-first browser. We hand over to rekordbox; we do not rebuild it. |

Mixed In Key (energy levels and key) is a useful counter-reference: a single 1 to 10 energy number is easy to read and hides why a track feels the way it does. We show a track's shape and the moments that make it, not a score.

## 2. Discovery

### Primary user and job to be done

Two hobbyist or semi-regular DJs with a shared slot coming up (a B2B at a party, a bar, a small club). One usually drives the preparation; the other contributes between sessions. They have different libraries, tastes and often experience levels, own their music on their own computers, and perform on a controller such as a DDJ-400 with rekordbox.

> "When we have a set to play together, help us find the story in our music, agree on how it unfolds, and walk in on the night knowing what we will play and why."

### The core problem

Not a lack of tracks. Two people have to converge on one intention and judge connections between music they do not both know, without a shared place to hear, compare and decide. (Hypothesis, to test in interviews.)

### Moments of uncertainty and creative friction

| Moment | What the DJs are asking | Where the product answers |
|---|---|---|
| Discover | "I don't know your tracks." | Your music: observations, each with the bars to hear |
| Imagine | "Do we mean the same thing?" | Concept Explorer: named stories, checkable by ear |
| Explore | "If we move this track, what breaks?" | The spine: transition status on every joint |
| Test | "Does this pair actually work?" | Transition Lab: sections and pairings, one action to hear |
| Decide | "We disagree. Now what?" | Same-beat compare, bar-pinned comments, a pick with a reason |
| Prepare | "Will I remember this on the night?" | Set sheet in controller language, rekordbox export |
| Perform | "Who plays what, and when?" | Turns on the sheet; a phone view of the next move (later) |
| Learn | "What did we actually do?" | Recording against the plan (later) |

### The smallest useful end-to-end workflow

1. Each DJ adds their tracks (15 in the scenario). Ownership is recorded.
2. Your music shows four or five observations about the shared collection, each with "hear it". **Explore my tracks.**
3. Concept Explorer offers three or four readings. The DJs pick one, or type their own.
4. The spine opens with a first order that serves the chosen concept; the drawn arc is the concept's shape.
5. For each joint, the Transition Lab: pick sections, try pairings, keep versions.
6. Where they disagree, compare two versions at the same beat, comment on bars, pick with a reason.
7. Prepare to perform: the set sheet and a rekordbox XML with playlist, cues and notes.

### Assumptions to test first

| We assume | How we find out |
|---|---|
| Most pairs prepare together in one room, at least for the final session. | Interview 5 to 8 pairs about their last joint set. |
| The hardest part is judging pairings of unfamiliar tracks, not choosing tracks. | Ask them to narrate their last prep; time each activity. |
| A concept that names a story helps two people agree faster than a track list. | The same 15 tracks with and without Concept Explorer; time to an agreed order. |
| Concept claims are trusted only if they can be heard. | Count "Doesn't sound like that" and listen-backs per claim. |
| Hearing two sections together beats auditioning full tracks. | Time to a confident yes or no per pairing. |
| Alternatives per slot are enough; nobody asks for a free canvas. | Watch for workarounds in the prototype. |
| The set sheet and rekordbox export are enough to perform the plan on a DDJ-400. | Andrei performs a 4-track plan from the sheet alone. |
| Sharing the plan without audio works because both own the tracks. | Ask how pairs exchange music today. The biggest risk (§7). |

### Prototype 1 versus later

| Prototype 1 | Later, if the evidence asks for it |
|---|---|
| One set, two DJs on one computer, everything tagged with who made it | Pass the set as a file between sessions; live co-editing after that |
| Your music with observations | Groove similarity across collections |
| Concept Explorer, 3 to 4 readings, own story by text | More readings on request; concept history |
| Spine with drawn arc, transition status, alternatives per slot | Branching whole sequences |
| Transition Lab = today's Transition Builder plus sections, pairings and versions by author | Loops and effects beyond the loop-in strategy |
| Compare and decide | Blind tests between the two DJs |
| Set sheet, print, rekordbox XML | Phone view on the night; recording review |

## 3. Product models

| Model | Good | Risk |
|---|---|---|
| A. Linear set planner | Everyone understands a playlist; close to rekordbox. | Transitions become gaps; alternatives vanish; it drifts toward sorting by BPM and key, which existing tools do. |
| B. Transition workspace | The deepest musical learning; it is the Transition Builder we already have. | No arc: a chain of good pairs that may not tell a story. |
| C. Canvas of paths | Alternatives are visible; good for divergent thinking. | Loses time, which a set is made of; messy; hard to read as a play order; heavy for beginners. |
| **D. Spine plus lab (recommended)** | The arc and the moment each have their own place. Concepts frame the spine; the lab is where a pair is judged by ear. | Alternatives exist only per slot and per transition, never as a free graph: less freedom than C, by design. |

With Andrei's direction, D gets two screens in front of it: Discover and Imagine produce the story, the spine and lab explore it. That is still one primary model, not four combined.

## 4. The core experience (the boards)

| Board | Step | What it holds | Key rules |
|---|---|---|---|
| 1 · Your music | Discover | Observations about the shared collection, each with the tracks involved and "hear it"; a compact list of all tracks (owner, BPM, key, shape, elements present); one track on demand with its distinctive moments and its owner's note. Primary action: **Explore my tracks**. | First glance: title, owner, BPM, key, shape. Sections, energy per bar and cues only on demand. Keys come from rekordbox or the DJ; there is no key detection. Elements present are _likely_. |
| 2 · Concept Explorer | Imagine | Four readings: name, three words, the idea, a shape, the functions in order, "why this might work" with links to the observations, the question to explore, how many tracks from each DJ. "Hear the idea" plays the key moments in order. Below: the chosen concept's claims, each with its bars and "Doesn't sound like that". "Describe your own" reads typed words into a concept. | Every reading is _interpretation_ and names its evidence. None is marked as best. Choosing one is _your choice_, shown with who chose it. |
| 3 · The spine | Explore | The concept as the set's story; the drawn arc (_your choice_) against each track's energy in the part played (_likely_); track cards with owner, BPM and key, structure bar, role; a joint between each pair showing its status and who mixes it; alternatives per slot; an open slot with what it needs; open decisions; what the other DJ changed. | Tracks never move by themselves. Joints: agreed by both, versions to choose between, tried, not tried. The DJ bringing the next track in mixes that transition. |
| 4 · Transition Lab | Explore | Both tracks' whole-length structure with the paired sections bright and hot cues numbered; the pairings grid (A moments by B moments, each tried one with its one-line outcome); the selected pairing on one bar ruler with lanes; approach (long blend, loop-assisted, phrase cut) and overlap; the outcome in facts and words; versions by author. | Pairings that do not work stay playable (brief v0.4). The approach changes the plan, never the pairing. |
| 5 · Compare and decide | Explore | Two versions on one playhead with Hear 1 and Hear 2, blind option; what differs; comments pinned to bars; the pick, phrased as the concept's question, with a reason; "where you stand" (_interpretation_) and a third version that tries both ideas. | Switching keeps the beat. The app never picks. "Keep both, choose on the night" is a valid decision. |
| 6 · Prepare to perform | Perform | Who plays when, by deck; each transition as steps in DDJ-400 names at bars (PLAY, LOW, LOOP IN and OUT, faders) with why; rekordbox XML export (playlist, plan's hot cues, a memory cue at each exit, notes in comments); print; a phone view of the next move. | The sheet comes from the agreed plans; nothing on it is new information. The phone view counts bars from a tap; it does not read the controller (no hardware integration, brief §9). |

Discovery boards: "Journey, friction and product models" and "Where AI helps, and where it stays out".

## 5. Collaboration model, simplest first

1. **Prototype 1: one computer, two DJs.** Every track, version, comment and pick carries its author. This tests the decision flow without any sync.
2. **Next: pass the set.** A set file carries the plan, notes, versions and decisions, not audio. Each DJ re-attaches their own copies of the tracks, matched by fingerprint as the MVP already does after a reload (D-22).
3. **Later, only with evidence:** live co-editing.

## 6. Where AI helps

The model turns facts into words and words into choices the engine can check. Analysis measures, the engine plays, the DJs decide. This extends brief §10 (AI as the explainer; the model never writes control events and never receives audio).

| Step | What the model does | What it gets | What it never does |
|---|---|---|---|
| Discover | Writes observations about the collection, each pointing to the bars that show it. | Per-track features, owners' notes, rekordbox comments | Claims a pattern it cannot point to |
| Imagine | Proposes 3 to 4 concept readings in the musical language; reads a typed story into an arc and functions. | Observations, both DJs' words | Presents one set as the right one |
| Explore | Explains why a candidate could fill a slot; critiques the spine on request. | A shortlist ranked by the analysis, the story, the spine | Reorders or swaps tracks by itself |
| Test | Explains a played pairing; turns a wish into a strategy and settings. | Outcome facts, the plan's actions | Writes control events |
| Decide | Summarises agreement and disagreement; proposes a version that tries both ideas. | Comments, picks, reasons, differences | Picks the winner or scores taste |
| Prepare (next) | Words each plan step in the controller's names; a practice list. | The agreed plans, the controller model | Changes timing or steps |
| Learn (later) | Asks reflective questions where the performance left the plan. | Plan against the recording | Grades the performance |

**Build first:** the pairing explainer (already planned), then "where you stand" (cheap, text only), then concept readings (the heart of the direction and the riskiest, because it depends on observations the analysis cannot make yet).

## 7. What this needs, and the risks

- **Analysis we do not have yet.** Elements present per section (vocal, bass, melody, atmosphere) needs a spike, probably source separation or a small classifier running in the browser. Groove similarity ("the same bass pattern") is a research spike. Key comes from rekordbox XML or the DJ.
- **Music sharing and rights.** The plan can travel without audio, but a DJ can only listen to a pairing with a track they have. If pairs routinely lack each other's files, the async model fails. This is the first interview question.
- **rekordbox XML import.** Hot and memory cues in an imported XML must land on the DJ's existing tracks without overwriting their own cues. Needs a spike against the rekordbox version Andrei uses.
- **Concepts that sound wise but are not.** Mitigated by evidence links, "Doesn't sound like that", and the rule that a reading with no evidence is not shown.
- **Scope.** Six screens is a lot for a prototype. If one must go, Compare and decide folds into the Lab, which already has versions.

## 8. Open questions for Andrei

1. Concepts 3 and 4 on the canvas ("Two Rooms, One Night", "Pressure and Breath") are our proposals. Your message ended after the second concept; are there others you had in mind?
2. Should Concept Explorer also work for one DJ alone? It seems to, which would make it useful before any collaboration exists.
3. Is one track each, alternating decks, the default B2B turn, or should turns be free per slot?

## Sources

- [DJ.Studio](https://dj.studio/), product page (features listed in §1).
- [pyrekordbox: rekordbox XML format](https://pyrekordbox.readthedocs.io/en/stable/formats/xml.html) (playlists, tracks, position marks).
- Ableton Live, Figma, Miro and Spotify capabilities are described from their public products as of 2026; verify specifics before quoting them externally.
