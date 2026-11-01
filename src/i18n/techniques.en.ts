// The mixing techniques (src/ui/techniques), in English. Kept apart from en.ts because
// most of it is authored teaching text; the keys join the same dictionary.

export const techniquesEn = {
  // Sections of the app
  'part.nav': 'Sections',
  'part.plan': 'Plan a set',
  'part.techniques': 'Mixing techniques',

  // The section
  'tech.title': 'Mixing techniques',
  'tech.lead':
    'Faders, EQ and loops only: the base everything else stands on. Once you can make great transitions with these three, effects are extra material on top. Each technique plays on whole lesson tracks; watch the mixing line and the mixer, listen, then try it at your own controller on similar tracks from your library.',
  'tech.loading': 'Preparing the lesson tracks…',
  'tech.progress': '{n} of {total} practised',
  'tech.listTitle': 'Techniques',
  'tech.level.basics': 'Basics',
  'tech.level.intermediate': 'Intermediate',
  'tech.level.loops': 'Loops',
  'tech.level.advanced': 'Advanced',
  'tech.tool.faders': 'Faders',
  'tech.tool.eq': 'EQ',
  'tech.tool.loop': 'Loop',
  'tech.position': '{level} · technique {n} of {total}',
  'tech.prev': 'Previous technique',
  'tech.next': 'Next technique',
  'tech.listenTo': 'Listen to',
  'tech.with': 'With the technique',
  'tech.withoutHint':
    'The same moment without the technique. Listen for what goes wrong, then switch back: playing goes on at the same bar.',
  'tech.takeHint':
    'Grab any knob or fader while it plays: your moves become “Your take”, to compare with the technique.',
  'tech.floorTitle': 'What the floor hears',
  'tech.whyTitle': 'Why it works',
  'tech.whenTitle': 'When to use it',
  'tech.whenNotTitle': 'When not to',
  'tech.stepsTitle': 'On the mixer, step by step',
  'tech.stepsLead': 'The step that is playing is highlighted. Click a step to hear it from there.',
  'tech.stepAt': 'A {a} · B {b}',
  'tech.tracksTitle': 'Practise on your own tracks',
  'tech.practiceTitle': 'Exercise',
  'tech.done': 'Practised',
  'tech.doneHint': 'Mark it when you have done it at your own controller and listened back.',
  'tech.pairTitle': 'The lesson tracks',
  'tech.pair.friendly': 'Made for mixing: intros and outros with the beat alone',
  'tech.pair.melodic': 'Melodic: melodies and chords in two different keys',
  'tech.pair.awkward': 'Awkward: a 4-bar intro and an abrupt ending',
  'tech.areaLabel': 'blend',
  'tech.part.kick': 'kick',
  'tech.part.bass': 'bass',
  'tech.part.hats': 'hats',
  'tech.part.pad': 'chords',
  'tech.part.lead': 'melody',
  'tech.bands':
    'In these tracks the kick and bass sit in LOW, the chords and the melody in MID, the hats in HIGH, so every EQ move is heard. The filter is not used.',

  // ------------------------------------------------------------- 1. Phrase entry
  'tech.phraseEntry.name': 'Enter on the phrase',
  'tech.phraseEntry.summary':
    'Faders only: B starts on a phrase line of A, so every change lands where the music already changes.',
  'tech.phraseEntry.floor':
    'Nothing seems to happen, and that is the point: A’s outro thins out on its own, B’s beat is already there, and when the new phrase begins B’s bass arrives as if A had planned it.',
  'tech.phraseEntry.why':
    'Dance music moves in phrases of 8 and 16 bars, and listeners feel them without counting. A change on a phrase line sounds intended; the same change two bars later sounds like a mistake. Here the producers also left room: A’s outro has no bass from its bar 57, B’s intro has none until its bar 9, so the faders alone are enough.',
  'tech.phraseEntry.when':
    'Tracks with DJ-friendly intros and outros (beat only, no bass, no melody), on close tempos. The first technique to master: everything else is built on phrase-aligned timing.',
  'tech.phraseEntry.whenNot':
    'When both tracks have bass or melody in the bars that overlap: the faders cannot separate them, they only make both quieter. Then you need EQ.',
  'tech.phraseEntry.tracks':
    'Two tracks with a clean intro and outro of 8 or 16 bars of beat only, within 3 BPM of each other: typically house or tech house “DJ edits” or extended mixes.',
  'tech.phraseEntry.practice':
    'Mix the two tracks three times: B’s bar 1 on A’s phrase line, two bars early and two bars late. Record all three and listen back without looking: can you tell which one was on the phrase?',
  'tech.phraseEntry.without': 'Two bars off the phrase',
  'tech.phraseEntry.withoutHear':
    'B starts two bars after A’s phrase line, so its bass enters in the middle of A’s phrase and nothing lines up: the change sounds accidental.',
  'tech.phraseEntry.in.title': 'B comes in on A’s phrase line',
  'tech.phraseEntry.in.body':
    'Raise B’s fader smoothly over the 8 bars of A’s last phrase with bass. B plays only kick and hats here, so there is room.',
  'tech.phraseEntry.phrase.title': 'New phrase: B leads (HANDOFF)',
  'tech.phraseEntry.phrase.body':
    'On the downbeat of the new phrase B’s bass arrives while A drops its own. Both changes happen on the same bar: that is why the phrase matters.',
  'tech.phraseEntry.out.title': 'A fades out',
  'tech.phraseEntry.out.body':
    'Lower A’s fader over its last 8 bars of kick and hats, finishing on the next phrase line.',

  // ------------------------------------------------------------- 2. Bass swap
  'tech.bassSwap.name': 'Bass swap',
  'tech.bassSwap.summary':
    'One bass at a time: B comes in with its LOW cut, and the two lows trade places on one downbeat.',
  'tech.bassSwap.floor':
    'The groove never stops, but on one beat the floor feels a new bassline take over. It feels like the music lifted, not like it got louder.',
  'tech.bassSwap.why':
    'Two basslines and two kicks at once fight in the same frequencies: they mask each other, the low end gets muddy and louder at the same time, and the speakers have no headroom. Keeping one low end at a time keeps the mix clear, and the moment of the swap becomes a musical event the floor feels in the body.',
  'tech.bassSwap.when':
    'Whenever both tracks have bass in the bars that overlap: the most used EQ move in house and techno. Swap on the first beat of a phrase, or on the bar where B’s music changes.',
  'tech.bassSwap.whenNot':
    'Basslines in clashing keys that you would rather not hear even for a beat: then keep the overlap short (see the cut). Swapping off the phrase line sounds like a hiccup.',
  'tech.bassSwap.tracks':
    'Two grooving tracks where the bass plays almost all the time, on close tempos: for example two tech house tracks, from the middle of one into the groove of the other.',
  'tech.bassSwap.practice':
    'Do the swap on the phrase line, then two beats late. Then try it as a quick 1-beat turn of both LOW knobs, then as a 1-bar move. Listen back: which sounded like one bassline handing over to the other?',
  'tech.bassSwap.without': 'Faders only',
  'tech.bassSwap.withoutHear':
    'Both basses and kicks play together for over a phrase: the low end swells and blurs, and there is no moment where B takes over.',
  'tech.bassSwap.in.title': 'B in, its LOW cut',
  'tech.bassSwap.in.body':
    'Before raising B’s fader, turn its LOW fully down. Raise the fader over 2 bars: the floor hears B’s hats join, A still carries the bass.',
  'tech.bassSwap.bass-swap.title': 'Bass swap on the one',
  'tech.bassSwap.bass-swap.body':
    'On the downbeat of the phrase, A’s LOW down and B’s LOW up together, one hand on each knob.',
  'tech.bassSwap.out.title': 'A leaves',
  'tech.bassSwap.out.body':
    'Without its bass A is only texture now. Lower its fader over the last 4 bars of the phrase.',

  // ------------------------------------------------------------- 3. Cut
  'tech.cut.name': 'Cut on the one',
  'tech.cut.summary':
    'No blend at all: A’s breakdown builds the tension, and on the downbeat B’s drop replaces A’s.',
  'tech.cut.floor':
    'The breakdown makes the floor wait for the drop. The drop comes, on time, but it is a different track: a surprise and a release at once.',
  'tech.cut.why':
    'A breakdown promises a drop on a known bar. Keeping the promise with another track’s drop gives the floor both what it expects and something new. Because the tracks never overlap, their keys and melodies cannot clash: a cut is also the cleanest way between tracks that do not blend.',
  'tech.cut.when':
    'From a breakdown or build-up into a drop; between tracks in clashing keys or with busy melodies; when you want contrast and impact rather than a smooth handoff.',
  'tech.cut.whenNot':
    'In a deep, hypnotic set where a sudden change breaks the trance, and anywhere off the phrase line: a cut on the wrong bar is the most audible mistake there is.',
  'tech.cut.tracks':
    'A track with a clear breakdown of 8 or 16 bars, and a second track whose drop is strong. Cue the second track on the first beat of its drop.',
  'tech.cut.practice':
    'Cue B on its drop, play A’s breakdown and count the bars out loud. Cut with both faders on the one, then try it a beat early. Record both and listen back.',
  'tech.cut.without': 'Smooth instead of cut',
  'tech.cut.withoutHear':
    'B fades in under A’s breakdown: the two melodies in different keys rub, then both drops play together. The tension leaks away and the drop loses its punch.',
  'tech.cut.wait.title': 'A’s breakdown builds, B waits',
  'tech.cut.wait.body':
    'B is cued on the first beat of its drop, its fader down. Count A’s 8 bars of breakdown and get both hands on the faders.',
  'tech.cut.cut.title': 'Cut on the downbeat',
  'tech.cut.cut.body':
    'On the one, A’s fader down and B’s up, in one movement. B starts already at full drop.',

  // ------------------------------------------------------------- 4. Long EQ blend
  'tech.longBlend.name': 'Long EQ blend',
  'tech.longBlend.summary':
    'Two phrases on each side: B’s highs and mids come in under A, the basses swap, and A’s mids and highs step back.',
  'tech.longBlend.floor':
    'For a minute both tracks play, yet it sounds like one piece of music slowly changing. Nobody can say when the new track started.',
  'tech.longBlend.why':
    'Each band of B arrives where A leaves it room, so the total level and the spectrum stay steady and the ear never hears a seam. The bass swap in the middle is the only moment of change; everything else is a slow shift of who leads, a HANDOFF spread over 32 bars.',
  'tech.longBlend.when':
    'Deep, minimal, progressive and melodic house and techno, where a long story suits the music; tracks whose grooves and keys go together.',
  'tech.longBlend.whenNot':
    'Tracks in clashing keys or with busy vocals: a long overlap only makes the clash last. Also in a peak-time set where the floor needs change rather than continuity.',
  'tech.longBlend.tracks':
    'Two tracks in compatible keys (same or neighbouring on the Camelot wheel), with long grooving sections and little vocal.',
  'tech.longBlend.practice':
    'Do the blend over 32 bars, then over 16 and over 8 with the same moves compressed. Listen back: at which length did it still sound like one piece of music?',
  'tech.longBlend.without': 'Faders only',
  'tech.longBlend.withoutHear':
    'Both tracks play at full EQ for half a minute: the basses fight, the hats double up and the mix gets louder and blurrier.',
  'tech.longBlend.in.title': 'B in: highs and mids first',
  'tech.longBlend.in.body':
    'Start B with LOW off and MID and HIGH at a quarter. Raise its fader over the first phrase, and bring MID and HIGH up to the middle by the swap.',
  'tech.longBlend.bass-swap.title': 'Bass swap in the middle',
  'tech.longBlend.bass-swap.body': 'On the phrase line, A’s LOW down and B’s LOW up together.',
  'tech.longBlend.handOver.title': 'A steps back',
  'tech.longBlend.handOver.body':
    'Turn A’s MID and HIGH down to a quarter over the next phrase: B’s melody and hats take the front.',
  'tech.longBlend.out.title': 'A fades out',
  'tech.longBlend.out.body': 'Lower A’s fader over the last phrase of the blend.',

  // ------------------------------------------------------------- 5. Staircase
  'tech.staircase.name': 'Staircase: one band per phrase',
  'tech.staircase.summary':
    'B takes over one band at a time: the hats on the first phrase, the chords on the second, the bass on the third.',
  'tech.staircase.floor':
    'Every 8 bars something new arrives: first fresh hats, then new chords, then a new bassline. The floor feels a steady build instead of one change.',
  'tech.staircase.why':
    'Each phrase line becomes a small event, so the transition itself turns into a BUILD. Because only one band changes at a time, A and B never compete in the same register, and the listener’s attention moves with the band that changed.',
  'tech.staircase.when':
    'When you want the transition to raise the energy step by step; tracks with clear, separate parts (hats, chords, bass).',
  'tech.staircase.whenNot':
    'Tracks where one sound covers several bands (a wide pad, a full vocal): cutting its MID leaves a strange half-sound.',
  'tech.staircase.tracks':
    'Two tracks with clean, separated elements, for example minimal or tech house, with at least 16 bars of groove before the point where you want the bass to change.',
  'tech.staircase.practice':
    'Do the staircase as heard, then reverse the order: bass first, hats last. Listen back: which order built up, and which felt like it fell apart?',
  'tech.staircase.without': 'All bands at once',
  'tech.staircase.withoutHear':
    'B comes in complete over one bar and both tracks play in full for three phrases: no steps, just more of everything.',
  'tech.staircase.high.title': 'Phrase 1: HIGH',
  'tech.staircase.high.body':
    'B in with LOW and MID cut, only its hats audible. Turn A’s HIGH down over the phrase: B’s hats replace A’s.',
  'tech.staircase.mid.title': 'Phrase 2: MID',
  'tech.staircase.mid.body':
    'On the phrase line, B’s MID up to the middle and A’s MID down: new chords replace the old ones.',
  'tech.staircase.bass-swap.title': 'Phrase 3: LOW',
  'tech.staircase.bass-swap.body':
    'On the next phrase line, the bass swap: now B leads in every band.',
  'tech.staircase.out.title': 'A fades out',
  'tech.staircase.out.body': 'A has little left in any band; lower its fader over the last phrase.',

  // ------------------------------------------------------------- 6. Mid swap
  'tech.midSwap.name': 'Mid swap: one melody at a time',
  'tech.midSwap.summary':
    'Two melodic tracks in different keys: B plays without its MID until A’s melody ends, then the melodies swap on the phrase line.',
  'tech.midSwap.floor':
    'A’s melody finishes its phrase undisturbed, and on the next downbeat a new melody begins, as if the song simply moved on.',
  'tech.midSwap.why':
    'Melodies and chords live in the middle of the spectrum. Two of them at once, in different keys, sound out of tune, however well the beats match. Hiding B’s MID while A’s melody plays, and swapping on a phrase line, lets the groove blend while the harmony changes in one clean step.',
  'tech.midSwap.when':
    'Melodic house and techno, tracks with vocals or leads, keys that do not match. Combine it with the bass swap a few bars earlier.',
  'tech.midSwap.whenNot':
    'Tracks whose melodies are written to work together (same key): there the overlap can be the most beautiful moment of the mix.',
  'tech.midSwap.tracks':
    'Two tracks with a lead or vocal in different keys. Look for the bar where A’s melody ends its phrase and the bar where B’s begins.',
  'tech.midSwap.practice':
    'Do the mid swap, then the same transition with B’s MID open from the start. Record both. Where exactly did the second version start to sound out of tune?',
  'tech.midSwap.without': 'MID left open',
  'tech.midSwap.withoutHear':
    'B’s chords play under A’s melody in another key, then A’s chords under B’s melody: the beats are matched, but the music sounds out of tune.',
  'tech.midSwap.in.title': 'B in, LOW and MID cut',
  'tech.midSwap.in.body':
    'Only B’s hats and the top of its kick are heard; A’s melody keeps the front.',
  'tech.midSwap.bass-swap.title': 'Bass swap first',
  'tech.midSwap.bass-swap.body':
    'Halfway through, swap the basses: B’s groove now carries the floor while A’s melody finishes.',
  'tech.midSwap.mid.title': 'Mid swap on the phrase line',
  'tech.midSwap.mid.body':
    'A’s melody ends with its phrase. On the downbeat, A’s MID down and B’s MID up: B’s melody starts at that moment.',
  'tech.midSwap.out.title': 'A fades out',
  'tech.midSwap.out.body': 'Only A’s hats are left; lower its fader over 4 bars.',

  // ------------------------------------------------------------- 7. Loop B's intro
  'tech.loopIntro.name': 'Loop the intro of B',
  'tech.loopIntro.summary':
    'B’s intro is only 4 bars long. A 4-bar loop plays it twice, so B’s beat has 8 bars under A before its bass arrives.',
  'tech.loopIntro.floor':
    'B’s kick and hats settle in under A for a whole phrase, and the bass swap lands on A’s phrase line as if B had a long intro.',
  'tech.loopIntro.why':
    'The blend needs 8 bars of B without bass, but the track has only 4. Looping them gives back the missing bars without changing where B’s bass starts. Because the loop is 4 bars long on B’s downbeats, it repeats a whole musical unit and the repetition is not heard as a stutter.',
  'tech.loopIntro.when':
    'Tracks with a short intro, or an intro that starts with bass after a few bars; radio edits; any time you need more bars of B before a point than the track has.',
  'tech.loopIntro.whenNot':
    'When the intro has a melody or vocal that would sound odd repeated, or when the grid is not exact: a loop on a shaky grid stumbles on every pass.',
  'tech.loopIntro.tracks':
    'A radio edit or a track that starts almost at once, and an outgoing track with a long outro. Set an exact grid on the short track first.',
  'tech.loopIntro.practice':
    'With Quantize on, set a 4-bar loop on B’s bar 1, start B on A’s phrase line and press RELOOP/EXIT at the end of the second pass. Then try 2 passes of a 2-bar loop. Listen back: did the repetition sound like part of the track?',
  'tech.loopIntro.without': 'No loop',
  'tech.loopIntro.withoutHear':
    'Without the loop the blend can only start 4 bars before the swap: B arrives late and the bass swap comes before the floor has heard B’s groove.',
  'tech.loopIntro.loop.title': 'B in on a 4-bar loop',
  'tech.loopIntro.loop.body':
    'B’s bars 1–4 play twice with LOW cut, the fader up over the first bar. The loop row on the mixing line shows each pass.',
  'tech.loopIntro.bass-swap.title': 'Loop out, bass swap',
  'tech.loopIntro.bass-swap.body':
    'Leave the loop at the end of the second pass: B goes on to its bar 5, where its bass starts. Swap the LOWs on that downbeat.',
  'tech.loopIntro.out.title': 'A fades out',
  'tech.loopIntro.out.body': 'Lower A’s fader before its abrupt end.',

  // ------------------------------------------------------------- 8. Loop A's outro
  'tech.loopOutro.name': 'Loop the end of A',
  'tech.loopOutro.summary':
    'A ends abruptly after 8 bars of outro. Looping them keeps A’s beat under B’s melody and breakdown, until B’s drop.',
  'tech.loopOutro.floor':
    'B’s melody and then its breakdown play over a steady kick, and B’s drop arrives with no gap. The floor never loses the beat.',
  'tech.loopOutro.why':
    'Without the loop A stops at its bar 40, in the middle of B’s build, and B’s 4-bar breakdown would leave the floor without a beat. An 8-bar loop of A’s outro holds the groove for 8 bars more, so the energy is carried until B is ready to take it.',
  'tech.loopOutro.when':
    'Tracks that end suddenly, have a short outro, or whose last bars you want to stretch; when B needs more time before its strong part.',
  'tech.loopOutro.whenNot':
    'When A’s last bars have a melody or vocal that would repeat noticeably; when B’s groove can carry the floor on its own.',
  'tech.loopOutro.tracks':
    'A track with a short outro or a hard ending, and a second track with a breakdown soon after its intro.',
  'tech.loopOutro.practice':
    'Set an 8-bar loop on A’s outro before it ends, bring B in, and choose when to release the loop. Try releasing it one pass earlier. What did the floor lose?',
  'tech.loopOutro.without': 'No loop',
  'tech.loopOutro.withoutHear':
    'A has to leave by its bar 40: it fades out during B’s build, and B’s breakdown comes with no beat under it.',
  'tech.loopOutro.in.title': 'B in, LOW cut',
  'tech.loopOutro.in.body': 'Raise B’s fader over a bar; A still carries the bass.',
  'tech.loopOutro.bass-swap.title': 'Bass swap, A goes into its loop',
  'tech.loopOutro.bass-swap.body':
    'On A’s outro, swap the LOWs and set an 8-bar loop on A from that downbeat.',
  'tech.loopOutro.loop.title': 'A’s outro plays twice',
  'tech.loopOutro.loop.body':
    'A’s kick and hats hold the groove while B’s melody and breakdown arrive.',
  'tech.loopOutro.out.title': 'A fades out before B’s drop',
  'tech.loopOutro.out.body':
    'Lower A’s fader over the second pass, so it is gone exactly when B’s drop starts.',

  // ------------------------------------------------------------- 9. Tension
  'tech.tension.name': 'Tension by taking the bass away',
  'tech.tension.summary':
    'B’s breakdown plays over A’s groove; 4 bars before B’s drop A loses its bass, and the bass returns as B’s.',
  'tech.tension.floor':
    'Suddenly the floor feels light, without the low end it was dancing to, and starts waiting. On the downbeat B’s drop brings the bass back with full force.',
  'tech.tension.why':
    'Removing an element can build more anticipation than adding one (BUILD by subtraction). The bass is what the body dances to, so its absence is felt at once, and its return is the RELEASE. Here the bass comes back as a new track, so the release also marks the handoff.',
  'tech.tension.when':
    'Before a drop or a strong section of B; to give a transition a peak; when B starts with a breakdown that can sit over A’s groove.',
  'tech.tension.whenNot':
    'Too often: the trick works because it is rare. And never for more than a phrase: without bass for too long the floor stops waiting.',
  'tech.tension.tracks':
    'A grooving track and a second track with a breakdown followed by a strong drop. Cue the second track at the start of its breakdown, 8 bars before the drop.',
  'tech.tension.practice':
    'Take the bass away 4 bars before the drop, then 1 bar, then 8. Record all three. Which one made you wait for the drop the most, and which one lost the floor?',
  'tech.tension.without': 'Bass kept until the drop',
  'tech.tension.withoutHear':
    'A’s bass plays right up to B’s drop: the drop arrives, but nothing prepared it, so it lands softer.',
  'tech.tension.in.title': 'B’s breakdown over A’s groove',
  'tech.tension.in.body':
    'Raise B’s fader over 2 bars at the start of its breakdown, and turn A’s MID down: B’s chords and melody replace A’s, A keeps its beat.',
  'tech.tension.cut.title': 'A’s bass out: 4 bars of waiting',
  'tech.tension.cut.body':
    'On the bar 4 bars before the drop, turn A’s LOW fully down at once. Only A’s hats and the top of its kick are left.',
  'tech.tension.drop.title': 'The drop: B’s bass in, A out',
  'tech.tension.drop.body':
    'On the downbeat of B’s drop, B’s LOW up and A’s fader down in one movement.',

  // ------------------------------------------------------------- 10. Bass teaser
  'tech.teaser.name': 'Bass teaser',
  'tech.teaser.summary':
    'Before the swap, B’s bass replaces A’s for one beat, twice, at the end of a bar: a taste of what is coming.',
  'tech.teaser.floor':
    'Twice the bassline flickers into something new and comes back. The floor notices and expects the change, and when the swap comes it feels like an answer.',
  'tech.teaser.why':
    'A short hint creates expectation: the listener hears the new bassline before it arrives, so the swap is not a surprise but a payoff. Played on the fourth beat, the hint sits in the gap before a bar line, where the ear expects movement anyway.',
  'tech.teaser.when':
    'With basslines that are clearly different (another note or rhythm); in an energetic set where the transition can be a playful moment.',
  'tech.teaser.whenNot':
    'With basslines in clashing keys (the hint sounds like a wrong note) or in a deep set where any flicker breaks the flow.',
  'tech.teaser.tracks':
    'Two grooving tracks with clearly different basslines, on close tempos, and a bass swap you already do with confidence.',
  'tech.teaser.practice':
    'Practise the teaser with both LOW knobs alone first: down and up again in exactly one beat. Then place it on the fourth beat of two bars before the swap. Record and listen: did the hints sound deliberate?',
  'tech.teaser.without': 'Plain bass swap',
  'tech.teaser.withoutHear':
    'The swap without hints: clean, but the new bassline arrives with nothing that prepares it.',
  'tech.teaser.in.title': 'B in, LOW cut',
  'tech.teaser.in.body': 'As in the bass swap: B’s fader up over 2 bars, its bass cut.',
  'tech.teaser.tease.title': 'Two teasers, on the fourth beat',
  'tech.teaser.tease.body':
    'On beat 4 of two bars, B’s LOW up and A’s LOW down for one beat, then back. B’s bass is heard for a moment.',
  'tech.teaser.bass-swap.title': 'The swap itself',
  'tech.teaser.bass-swap.body': 'On the phrase line, the swap for good: now the hint pays off.',
  'tech.teaser.out.title': 'A fades out',
  'tech.teaser.out.body': 'Lower A’s fader over the last 4 bars.',

  // ------------------------------------------------------------- 11. Loop bridge
  'tech.loopBridge.name': 'Loop bridge',
  'tech.loopBridge.summary':
    'Everything together: A goes into a 4-bar loop of drums and bass, B’s breakdown plays over it, A’s bass leaves for tension, and B’s drop takes over.',
  'tech.loopBridge.floor':
    'The beat never stops: B’s breakdown floats over A’s groove, the bass disappears for a few bars, and B’s drop lands with the whole floor waiting for it.',
  'tech.loopBridge.why':
    'A breakdown on its own empties the floor of rhythm; under it, a loop of A’s drums and bass keeps the bodies moving while B’s melody tells its story. The loop holds A exactly as long as B’s breakdown lasts, the mid swap keeps one melody at a time, and taking A’s bass away prepares the drop. Each tool does one job, and together they make a transition of their own.',
  'tech.loopBridge.when':
    'When B has a breakdown you want to play and A has a groove worth holding; for a peak moment of the set.',
  'tech.loopBridge.whenNot':
    'Before you are confident with the loop, the mid swap and the bass cut separately: here they must happen on time, together.',
  'tech.loopBridge.tracks':
    'A groovy track with a 4-bar section of drums and bass, and a melodic track with an 8-bar breakdown before a drop.',
  'tech.loopBridge.practice':
    'Plan it on paper first: which bar the loop starts, how many passes, where the bass leaves, where the drop is. Then do it at the controller, record, and compare with your plan.',
  'tech.loopBridge.in.title': 'B in, LOW and MID cut',
  'tech.loopBridge.in.body': 'Raise B’s fader over a bar: only its hats join A.',
  'tech.loopBridge.bridge.title': 'A loops, B’s breakdown on top',
  'tech.loopBridge.bridge.body':
    'Set a 4-bar loop on A and turn its MID down: a bed of drums and bass. B’s MID up: its chords and melody float over it.',
  'tech.loopBridge.cut.title': 'A’s bass out',
  'tech.loopBridge.cut.body': 'On the second pass, turn A’s LOW down: 4 bars of waiting.',
  'tech.loopBridge.drop.title': 'B’s drop',
  'tech.loopBridge.drop.body': 'On the downbeat of B’s drop, B’s LOW up and A’s fader down.',
} as const
