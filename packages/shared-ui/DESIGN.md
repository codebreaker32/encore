---
name: Encore
description: The TV as the live director of your own comedy special; a real room, cut on your laughs, honestly scored.
colors:
  house: "#07060a"
  gold: "#ffd79a"
  gold-dim: "#b8995f"
  red: "#c81e3a"
  paper: "#f5efe6"
  paper-dim: "rgba(245,239,230,0.42)"
  paper-soft: "rgba(245,239,230,0.6)"
  green: "#2fb463"
  unsure: "#8a8a8a"
  rule: "rgba(255,215,154,0.18)"
  frame: "#1a1620"
  dead-a: "#2a1216"
  dead-b: "#1a0c0f"
  dead-text: "#ff9aa7"
typography:
  display:
    fontFamily: "BigShouldersDisplay-ExtraBold"
    fontSize: "88px"
    lineHeight: 1.02
    letterSpacing: "0.04em"
  headline:
    fontFamily: "BigShouldersDisplay-ExtraBold"
    fontSize: "72px"
    lineHeight: 1
    letterSpacing: "0.05em"
  title:
    fontFamily: "BigShouldersDisplay-Bold"
    fontSize: "52px"
    lineHeight: 1
    letterSpacing: "0.08em"
  numeral:
    fontFamily: "BigShouldersDisplay-Bold"
    fontSize: "46px"
    lineHeight: 1.15
    letterSpacing: "0.02em"
    fontVariation: "tabular-nums"
  label:
    fontFamily: "BigShouldersDisplay-SemiBold"
    fontSize: "28px"
    lineHeight: 1.2
    letterSpacing: "0.14em"
  quote:
    fontFamily: "AtkinsonHyperlegibleNext-Medium"
    fontSize: "36px"
    lineHeight: 1.3
    letterSpacing: "normal"
  lead:
    fontFamily: "AtkinsonHyperlegibleNext-Regular"
    fontSize: "26px"
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "AtkinsonHyperlegibleNext-Regular"
    fontSize: "24px"
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  none: "0px"
  dot: "9px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "22px"
  xl: "32px"
  2xl: "44px"
  3xl: "54px"
  edge-x: "90px"
  edge-top: "54px"
  edge-bottom: "72px"
components:
  lower-third:
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
  lower-third-rule:
    backgroundColor: "{colors.red}"
    width: "420px"
    height: "4px"
  lower-third-clock:
    textColor: "{colors.gold}"
    typography: "{typography.numeral}"
  lower-third-clock-last30:
    textColor: "{colors.red}"
    typography: "{typography.numeral}"
  title-card:
    backgroundColor: "{colors.house}"
    textColor: "{colors.paper}"
    typography: "{typography.display}"
    padding: "0 240px"
  live-mark:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
  live-dot:
    backgroundColor: "{colors.red}"
    rounded: "{rounded.dot}"
    size: "18px"
  replay-mark:
    textColor: "{colors.gold-dim}"
    typography: "{typography.label}"
  replay-dot:
    backgroundColor: "{colors.gold-dim}"
    rounded: "{rounded.dot}"
    size: "18px"
  caption-what:
    textColor: "{colors.gold}"
    typography: "{typography.numeral}"
  caption-why:
    textColor: "{colors.paper}"
    typography: "{typography.lead}"
  caption-small:
    textColor: "{colors.gold-dim}"
    typography: "{typography.label}"
  hint-key:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
  hint-label:
    textColor: "{colors.gold-dim}"
    typography: "{typography.body}"
  cta:
    textColor: "{colors.paper}"
    typography: "{typography.title}"
  cta-key:
    textColor: "{colors.red}"
    typography: "{typography.title}"
  bill-choice:
    textColor: "{colors.paper-dim}"
    typography: "{typography.numeral}"
  bill-choice-on:
    textColor: "{colors.paper}"
    typography: "{typography.numeral}"
  bill-choice-focused:
    textColor: "{colors.gold}"
    typography: "{typography.numeral}"
  bill-choice-underline:
    backgroundColor: "{colors.red}"
    height: "5px"
  ledger-number:
    textColor: "{colors.paper}"
    typography: "{typography.numeral}"
    width: "200px"
  ledger-number-good:
    textColor: "{colors.gold}"
    typography: "{typography.numeral}"
  ledger-number-not-measured:
    textColor: "{colors.gold-dim}"
    typography: "{typography.body}"
  ledger-row:
    padding: "6px 0"
  strip-frame:
    backgroundColor: "{colors.frame}"
    height: "150px"
    rounded: "{rounded.none}"
  strip-tag:
    textColor: "{colors.paper}"
    typography: "{typography.body}"
  strip-tag-reaction:
    textColor: "{colors.gold}"
  strip-tag-dead:
    backgroundColor: "{colors.dead-b}"
    textColor: "{colors.dead-text}"
  mic-listening-dot:
    backgroundColor: "{colors.green}"
    rounded: "{rounded.dot}"
    size: "14px"
---

# Design System: Encore

## Overview

**Creative North Star: "House-Right Camera"**

The television is the live director of the performer's own special. Every screen is a shot: a full-bleed photographic room (a still plate or a muted licensed clip), pushed in slowly over the length of a set, graded dark at the top and bottom, vignetted, and covered in fine film grain. Over the shot sits only what a broadcast would carry: a lower-third with a thin red rule, a LIVE mark, the director's caption, and the remote hints as words. Shots change by a hard cut (one black frame); nothing crossfades. When a laugh lands, the room cuts to a laughing face and the stage light hits the frame for 400 ms; when a line dies, the wide holds and the caption counts the silence.

The interface recedes into the broadcast vocabulary: condensed capitals (Big Shoulders Display) for venue names, verdict words and numerals; a hyperlegible sentence face (Atkinson Hyperlegible Next) for every explanation, never smaller than 24 px at 1920×1080 so it reads from 3 m. Secondary text is tinted from the gold; grey appears on screen only with its one meaning, "unsure", which is never counted against the performer. The honesty rules of the product are visual rules here: what was not measured is printed as "not measured" in gold-dim rather than shown as a zero, a recording says REPLAY rather than LIVE, and the CC BY credits ride on the bill.

The build is React Native for a 10-foot television (Android TV / Fire OS / Vega): Views, Images, Animated and video only, no SVG, no gradient library (gradients are stacked bands), no icon glyphs (the QR code, stripes, pitch trace and gradients are all made of Views). Every size in the code is a comp pixel at 1920×1080 passed through `sp()`, which scales it to the device.

**Key Characteristics:**
- Full-bleed photographic rooms with push-in, grade, vignette and 14% grain; the room is the layout.
- Hard cuts (40 ms of house black), never crossfades.
- Lower-third with a 420×4 red rule; never a box, never a panel, never glass.
- Condensed tracked capitals for names and numbers; hyperlegible sentences at a 24 px floor.
- Secondary text is gold-dim; grey means "unsure" and nothing else.
- Red is reserved: LIVE, the red rule, the clock's last 30 s, the OK key in a call to action, the focused choice's underline.
- Words instead of icons: "OK end set", "Back stop", never a glyph.
- Everything measured is printed with its reason; anything not measured says so.

## Colors

A house-black room lit by one tungsten lamp: gold for what the light touches, paper for what must be read, and a single broadcast red.

### Primary
- **Tungsten Gold** (`gold`): the stage light. Verdict words ("LAUGH"), the set clock, the tier name in the lower-third, the focused choice on the bill, a ledger number that cleared the house standard, gold cuts on the strip, an in-tune pitch bar, and the light pulse wash itself (18% over the frame, decaying to 0).
- **Gold Dim** (`gold-dim`): every secondary sentence: captions' "why", hints' labels, notes under the clock, ledger explanations, the bill's credits, the REPLAY mark and its dot. This is the tint the world uses where another system would use grey.

### Secondary
- **Broadcast Red** (`red`): LIVE dot (with a 36 px, 35% glow behind it), the lower-third's rule, the focused choice's underline on the bill, the clock inside the last 30 s, and the "OK" key inside a call to action. Nowhere else.

### Tertiary
- **Mic Green** (`green`): the one 14 px dot on the bill that says the phone is on the table and listening.
- **Unsure Grey** (`unsure`): pitch-trace bars where the phone could not tell, and nothing else. Grey never carries secondary text.
- **Dead-Air Maroon** (`dead-a`, `dead-b`, `dead-text`): the diagonal stripes of a dead-air frame on the cut sheet and its pink label; a mark of silence, never of error.

### Neutral
- **House Black** (`house`): every root background, the black frame of a cut, the title card, the base under every plate, the gradient bands of grades and edge fades, and the darkening wash (74%) under the cut sheet.
- **Paper** (`paper`): the primary reading colour: lower-third house name, LIVE, the title card line, the caption's reason, ledger keys and numbers, the MC's quote, hint keys.
- **Paper Dim / Paper Soft** (`paper-dim` at 42%, `paper-soft` at 60%): unselected choices on the bill and the earlier exchange in the green room; the only places paper is dimmed instead of switched to gold-dim.
- **Rule** (`rule`): gold at 18% for the 1 px dividers between ledger rows.
- **Frame** (`frame`): the plate behind a strip thumbnail before its image lands.

### Named Rules
**The Tungsten Rule.** Secondary text is gold-dim, never grey; grey has exactly one meaning on screen: the phone was unsure, and an unsure thing never counts against the performer.

**The One Red Rule.** Red marks what is live or what the remote must press: the LIVE dot, the red rule, the last 30 s of the clock, the OK key in a call to action, the focused choice's underline. It never decorates, never fills, never warns.

**The Not-Measured Rule.** A value the phone did not measure is printed as "not measured" in gold-dim sentence type at 24 px; it is never a zero, a dash, or an empty cell.

## Typography

**Display Font:** Big Shoulders Display, static instances by file name (`BigShouldersDisplay-Medium`, `-SemiBold`, `-Bold`, `-ExtraBold`); no fallback is wired, the TTFs ship with the app (SIL OFL).
**Body Font:** Atkinson Hyperlegible Next, static instances (`AtkinsonHyperlegibleNext-Regular`, `-Medium`, `-Bold`); SIL OFL.

**Character:** A condensed broadcast caption face set in tracked capitals beside a hyperlegible sentence face sized for 3 m. The display face names, counts and pronounces; the sentence face explains. Weights are chosen by family name, never by `fontWeight`; capitals are produced by the caller (`up()`), never by `textTransform`. Tracking is written as an em fraction of the comp size (`track(size, em)`), so it scales with the device.

Sizes below are comp pixels at 1920×1080; `sp()` scales them. Line heights are multiples of the size.

### Hierarchy
- **Display** (ExtraBold, 88 px, 1.02, +0.04em, caps, centred): the title card's one line in the MC's voice, with a 240 px side gutter.
- **Headline** (ExtraBold, 72 px cut sheet / 64 px green room, 1.0, +0.05em, caps): a screen's name. The bill's brand mark is the same voice at 40 px, +0.12em.
- **MC line** (Bold, 60 px, 1.08, +0.02em, caps): the MC speaking in the green room.
- **Call to action** (ExtraBold, 56 / 46 / 42 px, +0.06em, caps): "PRESS OK TO GO LIVE"; the key is red.
- **Title** (Bold, 52 px, +0.08em, caps): the lower-third's house name, tier in gold.
- **Numeral** (Bold, 46 / 44 px, 1.15, +0.02em, tabular): ledger numbers and the green room's per-set figure. The clock is Medium 44 px, +0.06em, tabular; the caption's verdict word is ExtraBold 44 px, +0.10em; the bill's choices are SemiBold 44 px, +0.03em, 1.1.
- **Small caps label** (SemiBold or Medium, 24–30 px, +0.10 to +0.16em, caps): LIVE / REPLAY (30, +0.14em), the bit counter (30, +0.12em), the wide's caption and the MC byline (28, +0.14em), the bill's row names (28 Medium, +0.16em), hint keys (26 Bold, +0.10em), strip tags (24 Medium, +0.06em).
- **Quote** (Atkinson Medium, 36 px, 1.3): the MC's debrief on the cut sheet.
- **Lead** (Atkinson Regular, 26 px, 1.3–1.4): the caption's reason, the cut sheet's subtitle, the MC's fix in gold.
- **Body** (Atkinson Regular, 24 px, 1.25–1.4; Medium for a set's title): every other sentence: hints' labels, notes, ledger keys and explanations, pair instructions, credits. Measures are capped at 680–1000 px.

### Named Rules
**The 24 px Floor Rule.** No text on the television is set below 24 px at 1920×1080. The smallest sizes are the sentence face at 24 and the display face at 24 (strip tags); nothing is "fine print".

**The Caller-Caps Rule.** The display face is uppercase by convention, applied to the string by `up()`; `textTransform` is never relied on, and the sentence face is never set in capitals.

**The Shadowed Over Photo Rule.** Any type that sits on a photographic shot carries the broadcast text shadow (0 2px 12px black at 80%; the lower-third widens it to 18px at 70%); type on house black carries none.

## Layout

The canvas is 1920×1080 comp pixels scaled by `sp()`; a 1280×720 stick renders the same composition at two thirds. The safe area is the single structural grid: 90 px from the left and right edges (`edge-x`), 54 px from the top (`edge-top`), 72 px from the bottom (`edge-bottom`). The four corners carry fixed roles on a shot: top-left the director's caption (its right edge held 640 px from the right so it never meets the LIVE mark), top-right the LIVE/REPLAY mark, bottom-left the lower-third, bottom-right the hints (and above them, 150 px up, the bit counter). The centre of a shot is empty; the room is the content.

Screens that need columns split the width, not the height: the bill holds a 1180 px room on the left (fading to house black across its last 320 px by a horizontal band gradient) and a running order from x = 1120 to the right edge; the cut sheet puts the strip full-width at y = 220, the ledger (1000 px wide) at y = 452 and the MC's note from x = 1180; the green room keeps the MC on the left (980–1000 px wide) and the ledger of sets from x = 1240. Vertical rhythm is small and even: 6 / 8 / 10 / 14 px between a label and its line, 22–32 px between groups, 44–54 px between sections.

The cut sheet's strip is proportional time: wides take their real duration, every cut or dead-air frame takes at least 9% of the strip so "LAUGH 0:22" fits on one line at 24 px, and consecutive or short wides merge until the strip holds about twelve frames; minute ticks run beneath. One primary action per screen, always as a sentence with its key in red: OK goes live, OK ends the set, OK goes again, OK talks. Navigation is OK / Back / Up / Down (Left / Right changes a value on the bill); there is no pointer, no scrolling, no focus ring beyond the gold word and red underline on the bill.

## Elevation & Depth

There are no shadows on surfaces and no stacked panels; depth is photographic. A shot is a plate at the back, then its grade (house-black bands darkening the top 30% to 15–22% and the bottom 38% to 55–65% depending on the shot), then the vignette raster, then film grain (a 512 px tile at 14%, 10% on the ledger screens), and finally type with the broadcast text shadow. The cut sheet and green room sit on the venue's wide darkened by 74% house black (cut sheet) or a left-heavy horizontal fade from 93% to 42% (green room): "house lights up". The open mic's neon clips take a 12% gold wash to pull them into the tungsten palette. The only glow is behind a live dot (a 36 px red circle at 35%).

### Shadow Vocabulary
- **Broadcast text shadow** (`text-shadow: 0 2px 12px rgba(0,0,0,0.8)`): on every line of type over a photograph.
- **Lower-third shadow** (`text-shadow: 0 2px 18px rgba(0,0,0,0.7)`): the house name, which sits on the brightest part of a wide.
- **Strip tag shadow** (`text-shadow: 0 1px 8px rgba(0,0,0,0.9)`): labels on 150 px thumbnails.

### Named Rules
**The Photographic Depth Rule.** Depth comes from the grade, the vignette and the grain on the shot, never from a box, a blur, a glass pane or a drop shadow on a surface.

**The Light Pulse Rule.** On every positive reaction cut, a tungsten-gold wash covers the frame at 18% and decays to 0 over 400 ms (ease-out quad). It fires on the count of positive reactions, never on a timer.

## Shapes

Everything is square-cornered: the red rule, the bill's underline, strip thumbnails, ledger rows, the title card, the dead-air stripes (a 400 px square of 10 px bars rotated 45° inside a clipped frame). The only circles are status dots: LIVE at 18 px (radius 9), the green mic dot and the green room's speaking dot at 14 px (radius 7), with the live glow a 36 px circle. There are no borders except the 1 px gold-at-18% rule between ledger rows, and no outlines around anything. Thumbnails are clipped with `overflow: hidden` and separated by 6 px of house black, not by strokes.

## Components

### The Shot (Plate / VideoPlate)
A full-bleed photograph or muted clip under the world's overlays. Still plates push in from scale 1.0 to 1.06 linearly over the whole set (never less than 30 s); the bill's preview pushes 1.0 → 1.04 over 90 s; a reaction holds at 1.07 and a finale at 1.04 without moving; the green room holds at 1.03. Grades: `wide` (15% / 55%), `reaction` (22% / 60%), `arena` (20% / 65%, singing's wide), `flat` (no bands, used with a 74% darken), `none`. A clip shows its poster until its first frame; if nothing has loaded within 1000 ms, or on error, the still plate the pack names takes over. At most three plates are mounted at once (a 1 GB stick decodes each at 1920×1080); one moving plate at a time.

### The Cut
When the shot key changes, a house-black View covers the new shot for 40 ms (a little over one frame at 60 Hz, so it survives a dropped frame) and lifts. The new shot mounts under the black so its plate decodes during it. The world cuts; it never crossfades, slides or zooms between shots.

### Lower-Third
- **Line:** house name in paper, " · ", tier in gold; Title type (52 px Bold, +0.08em, caps), one line, the widened shadow.
- **Rule:** 420×4 px broadcast red, 14 px below the line and 12 px above the clock.
- **Clock:** 44 px Medium gold tabular ("3:18"), with a 24 px gold-dim note after it ("of a 5:00 set"); inside the last 30 s of a live set the clock turns red.
- **Position:** bottom-left at the safe margin (72 px); the bill lifts it to 200 px to make room for its note. Never a box behind it.

### Live / Replay Mark
Top-right at the safe margins: an 18 px red dot with its 35% glow, "LIVE" (30 px SemiBold, +0.14em, paper), then a 24 px gold-dim sentence naming whose phone is the microphone and how words are handled ("mic on · Aman's phone · words on the phone"). A recorded set shows "REPLAY" in gold-dim with a gold-dim dot and no glow; nothing shows LIVE over a recording.

### Caption
Top-left, the director's voice. On a reaction: the verdict word in gold (44 px ExtraBold, +0.10em, caps) over a 26 px paper reason with the measured latency, then the gold-dim "more" (" · the room's third tonight · cut to the floor"). On a held wide or a card: one small-caps line in gold-dim (28 px SemiBold, +0.14em) with its emphasis in Bold paper ("WIDE · HELD 14 S · the house is listening"). Captions quote real numbers from the engine and never a scripted line.

### Title Card
Full-screen house black, one line in Display type (88 px ExtraBold, +0.04em, caps, centred, 240 px gutters), optionally a 28 px gold-dim byline beneath ("The Basement · Comedy Club · the phone is counting you in"). It carries the MC's intro, a between-bit line, a heckle, and the end; it lasts about one second during a set.

### Hints
Bottom-right at the safe margin: pairs of a key in paper small caps (26 px Bold, +0.10em) and a label in gold-dim sentence type (24 px), 8 px apart, items 32 px apart, baseline-aligned. Always words: "OK end set", "Back stop", "Up/Down row". No glyphs, no key caps.

### Call to Action
One per screen, in condensed capitals with the key in red: "PRESS OK TO GO LIVE" (56 px), "PRESS OK TO TALK" (46 px), "PRESS OK TO GO AGAIN AT THE COMEDY CLUB" (42 px), with a 24 px gold-dim line of alternatives beneath.

### Bill (Running Order)
Three rows (ACT, VENUE, MC): a row name in gold-dim small caps (28 px Medium, +0.16em), choices on one line in 44 px SemiBold caps 30 px apart, and under the focused row a 24 px gold-dim explanation. The selected choice is paper; when its row has focus it turns gold and takes a 5 px red underline; unselected choices are paper at 42%. Pairing shows a Views-drawn QR code (6 px modules) beside "ROOM ZRWQ" (44 px, code in gold); once a phone is listening, a 14 px green dot and a paper sentence replace it. CC BY credits run along the bottom in 24 px gold-dim at 80%.

### Cut Sheet Strip
The set as an edit timeline: 150 px thumbnails separated by 6 px, each the lifted still of the clip the director cut to, with a small-caps tag at bottom-left (24 px Medium, +0.06em): paper for a wide ("OPEN · WIDE", "CLOSE"), gold for a reaction ("LAUGH 1:13"), dead-text pink on maroon diagonal stripes for dead air ("DEAD 4.1 S"). Minute ticks in 24 px gold-dim tabular beneath. A one-line lead above explains the colours in words.

### Ledger
Headed "Measured, not judged" in 24 px gold-dim. Rows of a 200 px tabular numeral (46 px Bold paper; gold when it cleared the house standard; "not measured" in 24 px gold-dim sentence type when the phone did not measure it), a 330 px key in paper body, and a gold-dim explanation that names the measurement ("detection is an estimate; 0 unsure lines were not counted"). Rows are divided by a 1 px gold-at-18% rule with 6 px of vertical padding.

### Pitch Trace (singing)
A 1740×90 px band low in the frame under a soft house-black gradient (0 → 55% → 0), holding the last 12 s as 4 px square bars placed by distance from the window's median note (±6 semitones span the band): gold within 25 cents, paper at 45% when confidently off, unsure grey where the phone could not tell (held at the last known pitch so the trace keeps its place). A 24 px gold-dim legend on the left says so in words; the current note and judgement sit on the right in 30 px Medium gold ("A3 · in tune", or "listening").

### Light Pulse and Crowd Sound
A tungsten-gold full-frame wash at 18% decaying to 0 over 400 ms on each positive reaction. The sound cue is chosen by reaction kind and strength: a laugh under 0.35 is `laugh-small`, under 0.7 `laugh-medium`, else `laugh-big`; applause under 0.5 is `applause-small`, else `applause-big`; snaps, a cheer and a murmur have one cue each; heckles and silence carry no sound, the MC's card does the work. At the open mic and the club a room-tone loop plays under a live set at 25%. On Vega the sound layer is a deliberate no-op (silent, not broken).

### Asset Provenance
Every photo, clip and sound lives under `src/assets/{plates,clips,sounds}/` with a row in that folder's `CREDITS.md` (source page, direct URL, author, licence, size, edits). Every shipping raster carries its provenance embedded in the file (a JPEG comment or a PNG `impeccable:prompt` text chunk naming the source and the edit, or stating "Generated raster, not a photograph" for the grain and vignette). CC BY material is credited on the bill. New assets follow the same convention before they are referenced from `plates.ts` or `clips.ts`.

## Do's and Don'ts

### Do:
- **Do** start every screen from a full-bleed photographic room (plate or muted clip) with its grade, the vignette and 14% grain; the ledger screens darken it (74% house black or the green room's 93 → 42% fade) rather than replacing it.
- **Do** change shots with the 40 ms house-black cut; a wide pushes in 1.0 → 1.06 over the set, a reaction holds at 1.07.
- **Do** write secondary text in gold-dim and reserve grey for "unsure"; print "not measured" instead of a zero.
- **Do** keep every line of text at 24 px or larger at 1920×1080 and inside the 90 / 54 / 72 px safe margins, passed through `sp()`.
- **Do** set the display face by family file name (`BigShouldersDisplay-Bold`) with em-based tracking via `track()`, and uppercase it with `up()`.
- **Do** give every screen one call to action in condensed capitals with its key in red, and spell the remote as words in the hints.
- **Do** mark a recording REPLAY in gold-dim; show LIVE, the red dot and the glow only on a live set.
- **Do** put the broadcast text shadow under any type that sits on a photograph.
- **Do** add a CREDITS.md row and embed provenance in the file before a new photo, clip or sound ships; credit CC BY items on the bill.

### Don't:
- **Don't** draw a panel, a card, a glass pane, a box behind the lower-third, or a surface drop shadow; depth is the grade, the vignette and the grain.
- **Don't** crossfade, slide or zoom between shots; the world cuts.
- **Don't** use grey for secondary text, or any colour but gold-dim for it; grey means unsure.
- **Don't** use red for anything other than LIVE, the red rule, the last 30 s of the clock, the OK key in a call to action and the focused choice's underline.
- **Don't** use icons, glyphs or key caps where a word does the job; the only non-text marks are the status dots and the QR code.
- **Don't** set gradient text, `fontWeight` on a static font file, or `textTransform`; weights are family names and caps are applied to the string.
- **Don't** mount more than three plates at once or more than one moving plate; the stick has 1 GB.
- **Don't** use SVG, a gradient library or a blur; gradients are stacked bands of house black, the QR code, stripes and pitch trace are Views.
- **Don't** claim LIVE over a recording, show a scripted reaction, or print a value the phone did not measure.

## Open

Not yet finished, recorded here so the system above is not read as claiming them:
- The Vega build is unverified on the simulator: `VideoPlate.vega.tsx` is untested there and `CrowdSound.vega.tsx` is a deliberate no-op until audio can be auditioned. Every video and sound path falls back to the still plate and silence.
- The comedy club's clips are a live-music club and a bar (no comedy-night footage exists under the Pexels licence); the room reads as a small dark venue facing the stage, not literally a comedy club, and the listening wide's three mic stands read more like a band's stage than a comedian's single mic (finish review observation).
- Launcher icons in `src/assets/tv_icons/` (and `apps/tv-expo/assets/tv_icons/`) are Encore's own generated banners with embedded provenance; the Vega manifest declares no icon yet.

Resolved after the finish review (2026-10-10): the club clips were replaced under the same names; all 78 shipping rasters (plates, overlays, posters, strip thumbnails) carry embedded provenance (`impeccable embed-prompt --scan` reports 0 missing); the strip thumbnails are face-bearing frames with derivative rows in `assets/clips/CREDITS.md`.
