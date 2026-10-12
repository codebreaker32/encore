# Surface brief: Encore TV screens (performance screen leads)

Scope: the Fire TV app's four screens: performance screen (Experience mode; the showpiece), venue/act picker and pairing (Operate), scorecard + MC debrief (Operate), green room (Operate). Audience: a solo performer rehearsing, or friends on game night; job: perform to a believable room and learn exactly what landed. Proof: real photographic rooms, measured reactions, an honest scorecard. Constraints: 10-foot UI on a 1 GB Vega stick, remote-only (OK/Back/Up/Down), no SVG on the simulator, no game HUD, nothing faked.

Chosen direction: House-Right Camera (Impeccable's pick card; the roll had assigned "Calling the Show"). Memorable moment: the room cuts to a laughing face the instant your punchline lands, and holds a silent wide when it doesn't.

Unresolved: final product name; photo sources (licensed set being assembled in docs/mockups/src/photos); whether crowd audio plays from the TV or the phone (simulator audio is unreliable).

## Direction contract

THESIS: The TV is the live director of your own comedy special: a real room, cut on your laughs. It refuses the category default (a crowd photo under a dark scrim with meters, panels and a transcript) and refuses illustrated or avatar crowds; realism and honesty lead, the interface recedes.

OWN-WORLD: Full-bleed photographic rooms with a slow push-in, warm tungsten key light with cool fill, fine film grain and a soft vignette; a hard cut (one black frame) between shots. Palette: house black #07060a, tungsten gold #ffd79a, broadcast red #c81e3a (only for LIVE, the clock's last 30 s and the red rule), paper white #f5efe6, secondary text tinted from the gold, never grey. Type: Big Shoulders Display (condensed caps, tracked) for lower-thirds, venue names and verdict words; Atkinson Hyperlegible for every sentence, sized for 3 m. Components: the lower-third (a single left-aligned line over the photo with a thin red rule beneath, never a box), the shot (photo + grain + letterbox-free 16:9), the title card (black, one line, the MC's voice), the cut sheet (the post-set ledger laid out like a special's edit timeline: shots as thumbnails on a strip with the measured numbers beneath). No panels, no glass, no gradient text, no icons where words will do.

STORY: You stand up and a real room is looking back at you. You perform; the room cuts to laughter only when your timing earns it and sits in a silent wide when it doesn't, so you feel the difference in your body. Afterwards the cut sheet shows exactly which moments earned the cuts, with the numbers behind each one, and the MC tells you, in character, the one thing to fix. You go again at a tougher venue.

FIRST VIEWPORT (performance screen, 1920×1080): the venue wide shot fills the frame, audience facing the viewer, pushing in over the set; bottom-left lower-third "THE BASEMENT · COMEDY CLUB" with the set clock "3:12" beneath a thin red rule, in condensed caps at 10-foot size; top-right a small red LIVE dot and "mic on" in small caps; nothing else on the room. On a measured laugh: hard cut to a reaction close-up for ~2 s with a laughter swell, then back to the wide; between bits, a one-second title card carrying the MC's line. The primary action during a set is none; OK ends the set.

FORM: House-Right Camera, candidate 1 of 7 on the ordered grounded list (the pick card; the roll assigned candidate 7, "Calling the Show"; the user chose the pick); seed key 675547e7; code-led.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
