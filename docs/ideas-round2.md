# Idea rounds 2 and 3 (2026-10-10)

The guitar concept was dropped on 2026-10-10: no guitar, and the team judged it generic. Constraints for the replacement: Fire TV track, **nothing to buy** (phone + laptop + Vega simulator; the Google TV is dev-only), one person on camera, ~3 build days for the pivot, reuse the stack (couch-link, TV shell, loop engine, coach agent, pitch-judge). The team's filter after round 2: **the idea must be impossible on a phone**; the TV is the stage, arena, audience or shared window for the room.

## Round 2: 20 concepts, 3 judge lenses (official rubric + platform; impact + privacy; strategist + GitHub crowding)

| # | Idea | Mean /100 | "Seen it" 0–10 | Ships in 3 days? | Note |
|---|---|---|---|---|---|
| 1 | Offbook: teleprompter that fades words as you prove you know them; a stumble brings the line back | 72.7 | 3.7 | 0.80 | Rejected by the team: a phone idea put on a TV |
| 2 | Loupe: phone camera as a TV video magnifier + AI reader for low vision | 70.3 | 3.3 | 0.58 | Strongest need; frame-streaming risk on a 1 GB stick |
| 3 | Booth: play-by-play commentary practice over a synthetic game | 69.7 | 2.0 | 0.67 | Most original; niche |
| 4 | Kibitz: live grandmaster chess on the TV, the couch guesses the move on phones (Lichess open API) | 68.7 | 3.0 | 0.65 | Views-only chessboard = OSS "Vega support for an RN library" |
| 5 | Studio Wall: drawing class, phone watches your paper, lines overlaid on the reference | 64.0 | 4.3 | 0.43 | |
| 6 | Alankar: sargam/solfège scale drills, the swara you miss loops slower | 63.7 | 5.7 | 0.87 | 85% reuse; "karaoke" perception risk |
| 7–20 | Receipts (call the next ball), Cube Class, Backrow, Shadow Nets ×2, Cascade (juggling), Boots & Cats, Sideline (coding agent on TV), Hammer (fantasy auction), Hearth, Two Windows, Talking Stick, Dibs, Now Serving | 47–63 | | | TV added little, or the demo needed people the team doesn't have |

GitHub crowding (hackathon-era Fire TV repos, keyword in name/description/readme): singing 0, vocal 0, public speaking 0, pronunciation 0, phonics 0, reading practice 1, rhythm 2, guitar 1; fitness 10, workout 6, trivia 4, sign language 3.

## Round 3 direction: "impossible on a phone"

Shortlist with TV mockups in `docs/mockups/` (sources in `docs/mockups/src/`, rendered with Playwright via `shoot.mjs`):

| Idea | One line | Why only a TV | Reuse | Mockup |
|---|---|---|---|---|
| **Handshadow** | Hand-shadow puppet theatre: the phone tracks your hands, the TV is the lit stage, an AI narrator improvises | The puppeteer stands aside with the phone on their hands; the room watches the stage | ~45% | `handshadow.png` |
| **The Crowd** | The TV is a live audience of 100 that laughs, murmurs and heckles based on your pauses, pace and punchlines | A crowd on a 6-inch screen is a widget; at 50 inches across the room it is an audience | ~60% | `crowd.png` |
| **Breakout** | An AI game master turns one photo of your living room into an escape room; prove each step by showing the object to the phone | The game master faces the whole team; the phone is just the scanner | ~50% | `breakout.png` |
| **Pan Pal** | The kitchen TV that hears your stove: the phone on the counter listens to the pan (sizzle, boil) and checks colour on request | Hands dirty, eyes on the pan, screen across the kitchen | ~55% | `panpal.png` |

### Round 3a: the room as stage, arena, audience (`docs/ideas/round3-stage.json`)

| Idea | One line | Why only a TV | Reuse | Days | Mockup |
|---|---|---|---|---|---|
| **Lantern** | The TV is a pitch-dark cave; your phone is the torch; things only move when no beam is on them | The beam and the creatures live on a big surface the room watches; the phone screen stays black | 50% | 3 | `lantern.png` |
| **Sock Stage** | Phone inside a sock puppet behind the sofa: tilt = head, raise = enter, your voice = mouth; the TV is the theatre | The phone is hidden inside the sock; the show exists only on the stage the audience faces | 55% | 3 | `sockstage.png` |
| **Statues** | Phones in pockets as body sensors; the TV is "it" for Red Light Green Light and catches who moved | Every phone is in a pocket; "it" must be a face at the far end of the room everyone watches | 55% | 2.5 | `statues.png` |
| Porthole | A phone under the TV sees where you stand; the TV is a window whose view shifts as you walk | A window must be large and fixed while you move | 45% | 3.5 | |
| Stick Charades | A propped phone turns you into a stick figure; the TV blurts guesses for the room | The performer is 3 m from the camera, hands free, facing the room | 50% | 4 | |

### Round 3b: household, kitchen, kids, ambient (`docs/ideas/round3-home.json`)

| Idea | One line | Days | Reuse |
|---|---|---|---|
| Tabletop World | Phone in a mug watches toys on the table; a vision model builds and narrates a world on the TV wall | 4 | 45% |
| Star Wand | Bedtime sky on the TV; the phone is a wand (orientation) joining stars; the AI names and keeps the constellation | 3 | |
| Housefish | An aquarium fed at dinner: each person's one-line moment becomes a fish; the remote's OK feeds it | 3 | |
| Café Night | Kids' pretend café: the TV is the menu board and kitchen screen, parents order from phones, a vision model reviews the plate | 3 | |
| Rangoli Wall | Draw one wedge on paper under the camera; the TV mirrors it 16-fold wall-size live | 2 | |

## Decision (2026-10-10, evening)

The team chose **The Crowd** and extended it: act packs (stand-up, singing, poetry, speech), difficulty as venues (Open Mic → Club → Theatre → Arena), a difficulty-independent measured Scorecard, and an MC with selectable personality (sarcastic, strict, warm, deadpan) that hosts, heckles, debriefs and remembers. Working title: **Tough Crowd**; renamed **Encore** the same evening (the team found "Tough Crowd" too blunt for a product name). See `docs/concept-encore.md` once written.
