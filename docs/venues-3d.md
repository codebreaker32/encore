# Venues for the live 3D crowd

The crowd is rendered live, never shown as photos or clips (user, 2026-10-11). The user's reference sheets count only for how the people are laid out: seated rows facing the stage, shoulders overlapping, heads at slightly different heights, a few leaning to a neighbour. Everything else here is designed for Encore: the rooms, the light, the props.

All four rooms share one rule. The camera sits on the stage, at the performer's eye line, and looks out at the audience, because the TV is where the performer would stand. The crowd is lit from the stage side, and the back of the room falls into haze.

## The four tiers

| Tier (engine id) | Seats | Rendered as | What makes it this room |
|---|---|---|---|
| Open mic (`openmic`) | 30 | All 30 as full characters | Close enough to read every face |
| Comedy club (`club`) | 80 | 24 full + 56 LOD | Tables, drinks, a brick wall, a red light |
| Theatre (`theatre`) | 800 | 30 full + 120 LOD + 650 silhouettes | Raked rows and a balcony lip |
| Arena (`arena`) | 20,000 | 20 full + 200 LOD + instanced sprites | Floodlights, phone lights, a bowl that never ends |

The full characters are the Rocketbox people with live ARKit faces (`prototypes/crowd3d/people/*.glb`). LOD is `*.lod.glb`, and the back rows are `*.sil.glb` or camera-facing sprites baked from those models. On the TV the budget is 30 fps at 1280×720, under 150 draw calls, and no real-time shadows: the light is baked into vertex colours and a floor contact blob.

## Open mic: a pub back room

- **Room.** A long, low room of about 9 × 6 m with a 2.6 m ceiling. Dark wood panelling to shoulder height, then nicotine-yellow plaster. One exposed beam crosses the ceiling. A bar hatch on the left wall glows warm, and a fire-exit sign glows green at the back.
- **Seating.** Mismatched wooden chairs in three loose, uneven arcs, plus four people standing at the back by the bar with pints. Gaps in the rows are fine: it is a Tuesday.
- **Light.** One clip-on spotlight on the stage (warm, 3200 K) spills onto the front row. A string of bare bulbs runs along the beam, and the bar light comes from the side. The back row sits half in shadow.
- **Behaviour.** People drink, glance at phones and talk to the person next to them between bits. Laughs are loose and out of sync. One person always laughs first.
- **Act dressings.** Stand-up, The Back Room: a chalkboard reading "COMEDY TONITE". Poetry, Tuesday Slam: a hand-painted "SLAM" banner and fairy lights instead of the bulbs. Speech, The Meeting Hall: folding chairs in straight rows, a lectern, a coffee urn on a trestle table, flat cool light.

## Comedy club: The Basement

- **Room.** A basement of about 12 × 10 m. Exposed brick behind the stage and down the side walls, a black ceiling with ducts, a short low stage with a red-curtain backdrop (seen only in reverse shots).
- **Seating.** Small round tables of two to four at the front with drinks and candle jars, then three rows of bar stools and banquettes. The front tables sit close enough that front-row faces fill a third of the frame.
- **Light.** A hard key from the stage spot. Red practical lights on the brick (the club's colour), and the candle jars give each table a warm under-light. A neon sign on the side wall reads "THE BASEMENT".
- **Behaviour.** Arms folded until they're won over. A table of four that reacts as a group. Heckles come from one fixed seat (middle table, left), and the engine's heckle moment cuts there.
- **Act dressings.** Poetry, The Cellar: candles only, no neon, a wine-bar feel. Speech, The Lecture Room: tables out, rows of upholstered chairs, a projector screen glowing blue at the back.

## Theatre: The Playhouse

- **Room.** A raked auditorium seen from the stage: 18 rows climbing away from the camera on a 1:3 slope, red seat backs, aisle steps with small floor lights, and a balcony lip crossing the upper third of the frame with faces above it. The side walls are dark timber with sconces at 20% brightness.
- **Seating.** Every seat taken, in strict rows. The front three rows are full characters, rows 4–9 are LOD, and the rest plus the balcony are silhouettes that only move in groups (a ripple of heads for a laugh, a wave of hands for applause).
- **Light.** The stage wash lights the first rows. The house is dark apart from the aisle lights and exit signs. Haze makes the rake fade upward into black.
- **Behaviour.** Very still. Laughs start late and spread from the front backward over about 0.4 s (a wave down the rows, not everyone at once). Applause is the theatre's strongest reaction.
- **Act dressings.** Poetry, The Studio: a black box, the same rake in black, a single cold top light. Speech, The Auditorium: blue seats, house lights at 30%, a podium edge in the foreground.

## Arena: The Bowl

- **Room.** A stadium bowl seen from a stage at one end: lower tier, upper tier and roof edge, floodlight towers at the corners, and a big screen on the left showing the stage (a flat panel lit by the stage colour). The night sky shows above the roof line.
- **Seating.** The floor standing section is the near crowd: 20 full characters at the barrier with arms on the rail, then LOD. The tiers are instanced sprites in a grid with per-instance jitter, colour and phase.
- **Light.** Moving coloured beams (two colours per song or set) sweep the crowd. Floodlights flare at the corners. Phone lights appear as point sprites, sparse during the set and a flood at the finale.
- **Behaviour.** A constant low sway in time with a slow beat, even when quiet. Big reactions go up as one mass: arms raised in a wave travelling round the bowl. Silence at this scale reads as people turning to talk, so heads turn sideways.
- **Act dressings.** Singing (arena): the same bowl with phone lights from the start and a stronger beat sway. Poetry, The Dome: a roofed dome, a single follow-spot, the crowd mostly dark with lit faces only near the front.

## Camera grammar (all rooms)

- **Wide:** stage eye line, 35 mm equivalent, slow push-in over the set (the TV's existing `push` timing).
- **Reaction:** a 70 mm cut to the front-row cluster that reacted, which the engine already picks as `shot.kind === 'reaction'`.
- **Heckle:** a cut to the fixed heckler seat, held while the MC's card is up.
- **Finale:** a pull back to the widest view, with house lights rising to 40%.

Cuts are hard cuts (the TV's `Cut`, one black frame), never crossfades, matching the rest of the world.

## One room behind every screen (next, once the live screen holds 30 fps)

The room should not appear only for the set. One WebView stays mounted under all four screens, so there is no reload between them and the venue is always the one on the bill. The page takes a `{type: 'mode', mode}` message:

- **`preview`** (the bill): house lights at about 60%, the room filling up as people arrive, chat with neighbours, drinks, phones out. No reactions: nothing is being performed or measured. Changing the venue on the bill sends a new `venue`, so each room and tier is seen before it is chosen, and that is what makes difficulty visible.
- **`live`**: the crowd drive as it is now.
- **`after`** (the cut sheet and the green room): house lights up. The finale applause fades by the drive's last `finale.strength`, then people stand, put coats on and file out, leaving an emptying room behind the numbers. The cut sheet's darkening stays on top for legibility.

The screens drop their photographic plate when the stage is on. The world's grade, vignette and grain come from the page. Honesty holds: in `preview` and `after` the room makes no judgement, and only `live` reacts, and only to the drive.

## Sound with the stage (planned)

With the stage on, the crowd's sound should come from the page, not from React Native players. The TV still decides each cue (`cueFor`, by reaction kind and strength) and still sends the phone its `hush`. It also posts `{type: 'cue', id, strength}` to the page, and the page plays it through WebAudio from one concatenated MP3 sprite, timed to the same reaction envelope that drives the faces. This is the pattern in Vega's WebGL best practices ("concatenate sound effects", play segments by offset). It gives Vega crowd sound without a native audio player (`CrowdSound.vega.tsx` is silent today), and it keeps sound and motion on one clock on both TVs. The room tone loops in the page under the same rule. The MC's voice stays native (`McVoice`), because it must duck the room.
