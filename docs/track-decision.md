# Track and idea decision

**Decision (2026-10-06):** **Fire TV track** with **Strumble**, the Fire TV that hears you play guitar. Mini challenges: **AWS Builder** and **Open Source** (`pitch-judge`, with `couch-link` as a second package).
**Confirmed by the team:** the guitar-coach concept, and building against the Vega simulator (no physical stick).

The process: research all four tracks and the competition, write 14 concepts, score them with 4 independent judge lenses side by side, red-team the top 5, then pick. Raw research, concepts, judge files and red-team files are in the session scratchpad. Their conclusions and sources are below.

## 1. Why Fire TV

| Track | Prize pool | Est. entries per prize | Hardware gate for us (India, Linux/WSL2) | Verdict |
|---|---|---|---|---|
| **Fire TV** | $25k / $15k / $4k + AWS credits | **~190** | None: the Vega simulator is accepted ([FAQ](https://amazonappdev2026.devpost.com/details/faqs)) | **Best expected value** |
| Alexa+ | $25k / $15k / $4k + AWS credits | ~700 | None, but no entrant can integrate with real Alexa+ (Alexa+ toolkit not granted) | Most crowded, judged as "ideation" |
| Ring | $12k / $8k | ~180 | Playground simulator only for non-US entrants: one doorbell, no motion webhooks, read-only API | Lower prizes, thin simulator |
| Bee | $12k / $8k | ~60 | Needs a Bee wristband (US-only, sold out) or iPhone + Apple Watch | Hardware-gated |

Entries per prize are **estimates** from a census of 444 public competitor repos (about 70% Alexa+, 14% Fire TV, 11% Ring, 3% Bee) and a 6–10% registrant-to-submission rate seen in past Amazon/AWS Devpost events. All four judge lenses ranked Fire TV the best track.

What the organisers have said:
- Amazon DevRel called Fire TV and Alexa+ the "priority prizes" ([Build Session](https://www.youtube.com/watch?v=ws61g53S2b4)).
- Fire TV is the only track where you can "fully integrate your app … and even execute them on real devices" ([forum 45396](https://amazonappdev2026.devpost.com/forum_topics/45396-what-exactly-are-you-looking-for-in-the-fire-tv-track)).
- DevRel named "master class" style education and multi-modal UX as wanted Fire TV ideas ([Build Session](https://www.youtube.com/watch?v=ws61g53S2b4)).

## 2. Concepts and judge scores

Three concepts per track (institution-side, user-side, contrarian), plus two wildcards for Fire TV. Each judge scored all 14 side by side on the official rubric (4 × 25 points).

| # | Concept | Track | Official | Platform | Responsible AI | Strategist | **Mean** | Spread | Feasibility |
|---|---|---|---|---|---|---|---|---|---|
| 1 | RING-C Doorside | Ring | 73 | 83 | 83 | 68 | **76.8** | 68–83 | 0.46 |
| 2 | FTV-B Encore → **Strumble** | Fire TV | 73 | 72 | 74 | 84 | **75.8** | 72–84 | 0.51 |
| 3 | FTV-C SignNest | Fire TV | 78 | 73 | 79 | 73 | **75.8** | 73–79 | 0.38 |
| 4 | FTV-A Show of Hands | Fire TV | 66 | 73 | 80 | 82 | **75.2** | 66–82 | 0.62 |
| 5 | RING-A DropWindow | Ring | 72 | 75 | 77 | 76 | **75.0** | 72–77 | 0.57 |
| 6 | RING-B SitterKey | Ring | 69 | 75 | 73 | 71 | **72.0** | 69–75 | 0.59 |
| 7 | BEE-A Chalkback | Bee | 75 | 74 | 63 | 75 | **71.8** | 63–75 | 0.27 |
| 8 | FTV-D Frankendoodle | Fire TV | 64 | 77 | 68 | 77 | **71.5** | 64–77 | 0.69 |
| 9 | BEE-B Ebb | Bee | 72 | 76 | 70 | 66 | **71.0** | 66–76 | 0.32 |
| 10 | BEE-C Beekeeper | Bee | 63 | 75 | 71 | 68 | **69.2** | 63–75 | 0.27 |
| 11 | ALX-C Two Doors | Alexa+ | 65 | 63 | 69 | 71 | **67.0** | 63–71 | 0.51 |
| 12 | FTV-E Bleachers | Fire TV | 59 | 69 | 60 | 71 | **64.8** | 59–71 | 0.35 |
| 13 | ALX-B Holdfast | Alexa+ | 70 | 57 | 56 | 71 | **63.5** | 56–71 | 0.40 |
| 14 | ALX-A Stacks | Alexa+ | 51 | 64 | 65 | 58 | **59.5** | 51–65 | 0.60 |

The judge lenses were: **Official** applies the published rubric and the "obvious vs creative" lists literally; **Platform** is a Fire TV/Ring/Alexa/Bee engineering lead who knows the device limits; **Responsible AI** covers privacy, consent and market adoption; **Strategist** looks at crowding, memorability and the 3-minute video. The top five sit within 2 points of each other, so the red team decided.

<details><summary>One-liners for all 14 concepts</summary>

| Concept | One-liner |
|---|---|
| RING-C Doorside | Doorbell events become spoken, icon-first cards on the Fire TV in a grandparent's own language; family decides who to let in. |
| FTV-B Encore | A guitar lesson on Fire TV that can hear you: a phone listens, the TV shows the song, the bar you stumble on loops and slows down. |
| FTV-C SignNest | ASL practice for hearing families of deaf children: signs play life-size on TV, the phone camera gives handshape feedback. |
| FTV-A Show of Hands | Senior-living group game show: residents hold up printed cards, a staff phone reads them, the session fills the activity log. |
| RING-A DropWindow | Restaurant night deliveries: Ring confirms the vendor truck inside its window before a time-boxed keypad code is released. |
| RING-B SitterKey | Ring quietly confirms the pet sitter came; if not, two taps send a pre-approved backup a one-time door code. |
| BEE-A Chalkback | An instructor wears Bee; a warm-up quiz built from what they said waits on the classroom Fire TV next class. |
| FTV-D Frankendoodle | Jackbox-style drawing game: phones draw creature parts, the TV stitches and animates them, an AI host names the monster. |
| BEE-B Ebb | Post-class voice notes become spaced-repetition Bee reminders answered out loud; mastered concepts become Bee facts. |
| BEE-C Beekeeper | Provenance auditor for Bee's memory: quarantines facts that came from the TV or other people. |
| ALX-C Two Doors | Co-parenting across two Alexa homes: swaps, items and split expenses with two-parent consent. |
| FTV-E Bleachers | Rec-league games on Grandma's Fire TV with scorekeeper-tagged moments and per-kid reels. |
| ALX-B Holdfast | "Alexa, wait on hold for me": dials, navigates the menu, rings every Echo when a human answers. |
| ALX-A Stacks | Library add-on that plans the household's loans, renewals and holds across every family card. |

</details>

## 3. Red team: the top 5 attacked

Each red-teamer assumed the concept fails unless it clearly holds up, and checked the claims against primary sources. **None survived as written.** The difference is whether the flaws can be fixed.

| Concept | Fatal / major / minor | Decisive finding | Fixable? |
|---|---|---|---|
| **FTV-B Encore (→ Strumble)** | 0 / 5 / 9 | The chord check must measure **false accepts**, not just recall ([guitar.com on Simply Guitar](https://guitar.com/reviews/accessories/simply-guitar-review/)). Timing must anchor on the audio the player hears. Vega **kills the app after ~5 min without a remote press** ([t/28268](https://community.amazondeveloper.com/t/28268)). Rocksmith+ Connect proved phone-as-mic on consoles/PC, **not on Fire TV**. | **Yes, all of it.** **0 music entries** among 444 competitor repos. Existing Fire TV guitar apps are video-only. |
| FTV-D Frankendoodle | **1** / 8 / 6 | **Fatal:** Amazon's own **Luna GameNight** runs on Vega with QR phone party games (Jackbox 9, Draw & Guess, an AI-hosted game) ([About Amazon](https://www.aboutamazon.com/news/entertainment/amazon-luna-redesign-gamenight-prime)). That breaks the "no party games on Vega" impact claim with Amazon judges. Also about 7 Jackbox-style hackathon repos, e.g. [bump-run](https://github.com/Maverick5150/bump-run). | Only by repositioning around Luna's absence in India. Weak. |
| FTV-C SignNest | 0 / 9 / 4 | MediaPipe hand tracking at couch distance is unproven ([arXiv 2405.03545](https://arxiv.org/html/2405.03545v2)). [NVIDIA Signs](https://blogs.nvidia.com/blog/ai-sign-language) already serves these families. Vega W3C media has no playbackRate. Deaf-community trust risk for a hearing team in India ([Northeastern survey](https://cssh.northeastern.edu/survey-finds-skepticism-of-sign-language-tech-among-deaf-and-hard-of-hearing-community/)). | Partly. The core demo moment stays risky. |
| FTV-A Show of Hands | 0 / 9 / 6 | Plickers already does phone-reads-rotated-cards with a TV view. LifeLoop already runs senior-living screens on Fire TV sticks ([Amazon Signage blog](https://signage.amazon.com/blog/lifeloop-collaborates-with-amazon-to-deliver-first-of-its-kind-digital-signage-solution-to-senior-living)). B2B fit is weak for the Fire TV Appstore audience. | The fix turns it into a party game, which collides with Luna. |
| RING-C Doorside | 0 / 7 / 5 | [AccessBell](https://github.com/duynguyendang/aws-access-bell) already ships Ring → Fire TV captions in other languages for grandparents. Pop-up cards over other apps are not possible on Fire TV ([notifications doc](https://developer.amazon.com/docs/fire-tv/notifications.html)). | Partly. Ring prizes are also lower. |

## 4. Why Strumble

1. **Uncrowded and on-platform.**
   - No music entries among 444 competitor repos.
   - Fire TV guitar apps today are video-only, with weak ratings.
   - Fender's TV edition is Samsung-only and says "there won't be a microphone feedback mode".
   - Rocksmith+ is PC/console/mobile only.
2. **It matches the judges' creative list.** It is "multi-modal UX combining voice + D-pad + visual in a single flow", done for a reason: your hands are on the guitar. It also matches DevRel's "master class" remark.
3. **Every red-team flaw has a concrete fix**, all now in the concept: `docs/concept-strumble.md`.
4. **It builds on the simulator.** The phone does all the listening and timing, and the TV only displays, so the Vega Virtual Device's audio and SVG gaps don't block the core loop.
5. **It stacks the mini challenges cleanly.** `pitch-judge` is a reusable, tested open-source engine. The coach is a Strands agent on AgentCore with Bedrock.

### Fixes taken from the red team (and other concepts)
- **Phone is the timing master.** It plays the count-in and grades on its own audio clock, so TV/HDMI latency can't mark correct playing as late. This also removes TV audio from the critical path, since audio on the simulator is flaky ([t/29117](https://community.amazondeveloper.com/t/29117)).
- **Go/no-go on day 4** with two numbers: ≥90% recall on clean chords **and** ≤20% false accepts on wrong or muted chords, recorded at 1.5 m. If it fails, grade single-note melodies plus chord-change timing instead.
- **"Unsure" is grey, never red.** Low-confidence detections never count against the player (now in `packages/practice` grading).
- **Loop only after 3 stumbles in a row**, so one bad detector pass can't trigger a loop (`packages/practice` coach).
- **Segments under 4 minutes, each ending on an OK press**, which avoids the Vega 5-minute kill (`packages/practice` segments).
- **No claims we can't show**: no "hears every note", no "hands-free" (the Vega remote is press-to-talk).
- **Cut scope:** the teacher-report loop becomes a static link (stretch goal); AgentCore Gateway is dropped.
- **No react-native-svg on the TV.** It fails on the SDK 0.24 simulator ([t/29160](https://community.amazondeveloper.com/t/29160)), so the QR code and lanes are drawn with plain Views.
- **Content is original or public domain only** (no song catalogues). No guitar headstock logos or brand names in the video.

## 5. Open items and owners

| Item | Why it matters | By |
|---|---|---|
| Who plays guitar on camera? A genuine beginner is ideal. | The video story has to be real ("I built this to learn guitar"). | Oct 8 |
| Vega SDK + simulator on WSL2: add user to the `kvm` group, raise WSL memory, boot the simulator | Officially unsupported host ([install docs](https://developer.amazon.com/docs/vega/0.24/install-vega-sdk.html)). Fallback is a native Ubuntu boot or another machine. | Oct 7–8 |
| Chord-detection go/no-go on a recorded corpus (2 guitars, 2 players, 1.5 m) | It decides chord grading vs melody grading. | Oct 10 |
| Bedrock model access and quotas in the team's AWS account; request the $150 credits | New accounts can have Bedrock quotas at 0 ([forum 45416](https://amazonappdev2026.devpost.com/forum_topics/45416-bedrock-blocked-on-a-new-aws-account-all-model-quotas-0-not-adjustable-need-escalation)). Credits deadline Oct 21. | Oct 9 |
| UIController voice labels can't be demonstrated on the simulator | That is a Tech Implementation point we lose without a stick. Revisit buying one (₹5,499) if budget allows. | Open |
| Friction log from day 1 | Worth up to a +10% judging bonus. | Ongoing |
