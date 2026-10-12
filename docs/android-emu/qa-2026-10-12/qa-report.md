# Encore QA on the Android TV emulator, 2026-10-12

## Setup

- **Box:** BOX=android in the new account (us-west-2, `i-0bdca3a2acd0e04ef`), launched from an image of the old box.
- **Emulator:** the 720p AVD (`encore_tv34_720`, API 34 Android TV x86, 1280×720 at 213 dpi), `-gpu host`, `LP_NUM_THREADS=8`.
- **APK:** `encore-release-2026-10-12-l-emu.apk`, md5 `cf35f763cca358c0f0a1b6eaf2d5bdc0`.
  - Built on BOX=build with `~/build-apk-emu.sh`.
  - Its JS bundle is byte-identical to the arm `l.apk` (md5 `3c35540289bf8e0ade1579f210adda49`).
- **Services on the box:**
  - The relay (`RELAY_DEBUG_ROOMS=1`).
  - The MC with the humour model, on the instance role.
  - The MC's default model region was ap-south-1 until 19:06 UTC, then `MC_REGION=us-west-2` (see issue 2).
- **Phone:** `fake-phone`, with words on (`scripts/*-demo.json`) except where noted.
- **Evidence:**
  - `frames/` holds 27 key frames.
  - `qa-logs.txt` holds the raw lines: timeline, phone logs, `[mc-voice]` traces, MC and judge logs, ANR excerpts, crash, black and still checks.
  - There is one take per act: `take-standup-theatre.mp4`, `take-poetry.mp4`, `take-speech.mp4` and `take-singing.mp4` (each 60–75 s, 720p, with sound).

## Sets run

| # | Act | Venue | MC | Words | Ended by | Result |
|---|---|---|---|---|---|---|
| 0 | stand-up | Theatre | sarcastic | on | Back at 0:12 | dropped back to the bill |
| 1 | stand-up | Theatre | sarcastic (Vik, Brian) | on | OK at 1:40 | intro and debrief voiced |
| 2 | stand-up | Arena | deadpan (Dev, Matthew) | on | OK at 0:54 | intro and debrief voiced |
| 3 | stand-up | Open Mic | warm (Meera, Kajal) | **off** | OK at 0:43 | intro voiced; debrief withheld by the guard (issue 4) |
| 4 | stand-up | Comedy Club | strict (Mr. Rao, Stephen) | on | OK at 0:58 | intro and debrief voiced |
| 5 | poetry | Theatre | warm | on | script end, 1:08 | intro and debrief voiced; judge 0 of 11 in time (issue 2) |
| 6 | speech | Arena | warm | on | script end, 1:09 | intro and debrief voiced (us-west-2 MC) |
| 7 | singing | Arena | warm | off (no pitch) | OK at 0:42 | intro voiced; debrief timed out (issue 9) |

The phones' logs confirm each arm, for example `[tv] arm poetry at theatre, 180 s, persona warm`.

## What passed

- **All four acts arm** from the bill. Stand-up ran at all four venues. The venue names and slot lengths change per act (stand-up 5:00, poetry 3:00, speech 4:00, singing 3:30).
- **All four MCs:**
  - Each intro played, starting 39–72 ms after OK.
  - Debriefs played for sarcastic, deadpan, strict and warm (poetry and speech), starting 430–1,165 ms after they were queued.
  - The voices are distinct (Brian, Matthew, Stephen, Kajal, all on the generative engine).
  - Lengths are inside the caps: intros 19–82 characters (cap 90), debriefs 99–154 characters (cap 180).
- **The green room:**
  - Back on the cut sheet opens it (`12-g1-greenroom.jpg`).
  - OK sends `listen`. The phone answered "nothing heard", and the screen showed "MC · SILENT · The phone didn't catch that. Press OK and say it again, closer to the phone." within 3.4 s (`13-g2-listening.jpg`).
  - Back returns to the cut sheet (`14-g5-back-to-cut.jpg`), and Right goes to tonight's bill.
- **The Back key** (KEYCODE_BACK, 4) never left the app (`mCurrentFocus` was Encore after every press):
  - On the bill: nothing happens.
  - Live: drops the set and returns to the bill, and the phone gets `stop` (`07`, `08`).
  - Cut sheet: goes to the green room.
  - Green room: goes back to the cut sheet.
- **The bill:**
  - The D-pad switches act, venue and MC (`03`, `04`).
  - The warm intro is re-loaded after each change (`[mc-voice] loading warm:… slot 0 paused`).
  - The room code on screen (SVZR) matches the relay's `/rooms`.
- **Rejoining after a disconnect:**
  - A new phone named "Aman" 0.5 s after the old one left got `name-taken: Aman just left; try again in a few seconds`.
  - Its client retried and took over the seat 3.5 s later. The bill shows Aman's phone again (`19-r2-bill-rejoined.jpg`).
  - A third phone with the same name got `name-taken: Aman is already playing`.
- **The cut sheet:**
  - The numbers match the live lower third and the debrief: laughs, longest dead air with its time, landed counts.
  - The strip's thumbnails vary.
  - The striped tiles agree with each venue's patience (2.5 s Theatre, 2.0 s Arena, 5.0 s Open Mic, 3.5 s Club).
  - **Words off:** words per minute, fillers and "what you said" read "not measured · words were off on the phone" (`20-s3-cut.jpg`).
  - **Words on:** the content row appears: "7 specific details · 2 tags · 1 callback", "5 / 10 line ends that rhyme · 7 steady-meter lines · 2 internal rhymes", "3 calls to action · 2 triads · 2 contrasts".
  - **MC memory:** correct for the same performer ("Up from 2.7 landed a minute last set").
- **Captions:** "LAUGH · the room heard a punchline (an estimate)", "MURMUR · 2.5 s of dead air", "SNAP", "APPLAUSE · a list of three", and between-bit cards ("BIT 1 CLOSED. 2 LAUGHS AT WANKHEDE.").
- **Stability and picture:**
  - After the clean launch: no crash, ANR, JS error or WebView loss in 10,881 logcat lines.
  - No black stretches (0.3 s or longer) in any recording.
  - Still stretches of 2 s or more are rare, about 2 s each, and fall in quiet moments.
  - Poses look natural (seated rows, applause hands); no T-poses or broken limbs seen.
  - The page averaged about 28 fps.

## Issues

Severity: **High** blocks a demo or loses a feature; **Medium** is a visible honesty or behaviour fault; **Low** is cosmetic or rare.

### 1. High: Encore is killed by an ANR at launch while the disk is cold
- **Steps:**
  1. Start the new box (launched from an image).
  2. Boot the emulator (it took 179 s, against 17–28 s on the old box).
  3. Install the APK and launch Encore from the launcher.
- **Expected:** the bill appears.
- **Actual:** on two launches in a row, the window didn't take focus within 5 s. Android declared an ANR ("Input dispatching timed out … Waited 5002ms for FocusEvent(hasFocus=true)") and killed the app ("Force finishing activity … Killing 3243:com.strumble.tv … user request after error"). The Google TV home came back (`01-00-launch.jpg`). The third launch, about 1 min later, worked.
- **Evidence:**
  - The main thread was in `state=D` (waiting on disk) inside `org.chromium.android_webview.AwBrowserProcess` / `BrowserStartupControllerImpl`, reading `TrichromeLibrary.apk`.
  - Guest I/O pressure: "some avg10=57.15 … full avg10=40.66".
  - All in `qa-logs.txt`, "launch 1 and 2" and "ANR main thread".
- **Cause:** the EBS volume of a box launched from an image loads its blocks lazily, so the first reads are very slow. That is the trigger. But the app also creates the WebView (the 3D stage) on the main thread during the first frame, so any slow-storage device can hit the same ANR.
- **Fixes:**
  - Before filming on a fresh box, launch once and wait, or read the image files ahead of time.
  - In the app, mount `CrowdStage` after the bill has painted, so WebView start-up isn't on the focus path.

### 2. High: the content judge is almost never in time from this box
- **Steps:** run any words-on set with the MC at its default region (ap-south-1) on the us-west-2 box.
- **Expected:** the judge answers most lines within 0.35 s, and the cut sheet's "the MC's model read N in time" counts most lines.
- **Actual:**
  - All 38 stand-up calls fell back to the humour model alone.
  - All 11 poetry calls returned `unavailable (timeout) after 350 ms`, so the cut sheet reads "the MC's model read 0 in time, 11 late (an estimate)" (`23-p-cut.jpg`).
  - Just opening a connection from the box takes 234 ms to `bedrock-mantle.ap-south-1` and 3 ms to `us-west-2`.
- **After restarting the MC with `MC_REGION=us-west-2`:**
  - The stand-up ensemble answered in 244 ms.
  - The poetry judge still timed out twice on a cold connection before answering.
  - Speech made 6 of 11 lines in time ("5 in time, 3 late" on the cut sheet).
  - GLM-5 and the Polly voices work in us-west-2 too (the debrief took 1.2–2.2 s).
- **Fixes:**
  - Run the MC with `MC_REGION=us-west-2` on this box (`svc.sh` doesn't set it).
  - Consider warming the judge's connection and/or a 0.5 s judge budget; 0.35 s is borderline even in-region.

### 3. Medium: the debrief claims things that weren't measured, and contradicts the venue advice
- **Set 2** (Arena, deadpan, `18-s2-cut.jpg`): "Nothing to fix. Tags and wordplay carried the room. Try the next room up."
  - No wordplay was counted; the row reads "6 specific details · 2 tags · 1 callback".
  - The Arena is the top room, and the screen's own line says "the MC says go again here".
- **Set 6** (speech, Arena, warm, `25-sp-cut.jpg`): "The room is ready for the next tier up", next to "the MC says go again here".
  - The guard rejected the first answer for exactly this ("next is 'up' but the house rule gives 'again'"). The retry passed because the guard checks the `next` field, not the words.
- **Expected:** the words claim only counted features, and they agree with `next`.
- **Fixes:** have the guard reject feature names that aren't in the payload's counts, and "up"/"next room" phrasing when `next` is "again" or the venue is the top one.

### 4. Medium: the warm MC is silent after a words-off set
- **Steps:** a stand-up set at the Open Mic with the warm MC and words off (set 3).
- **Expected:** a debrief that says pace and fillers were not measured.
- **Actual:**
  - The guard rejected the first answer: "words were off, and the line must say that pace and fillers were not measured".
  - It rejected the retry too: "next is 'up' but the house rule gives 'again'".
  - The screen honestly reads "The MC's answer was withheld (its answer failed the honesty check)", but there's no debrief and no voice (`20-s3-cut.jpg`).
- **Fix:** the prompt for words-off sets should require the "not measured" sentence and state the `next` rule up front.

### 5. Medium: singing without pitch shows zeros as if measured
- **Steps:** a singing set with a phone that sends voice and lines but no pitch. `fake-phone` cannot send pitch batches; this is a test limit.
- **Expected:** everything the pitch would measure reads "not measured", as the in-tune row does.
- **Actual** (`27-sg-cut.jpg`):
  - "in tune: not measured · no pitch was heard" (correct).
  - "**0.0 s** longest hold · one note, held within 25 cents" (shown as measured).
  - "0.0 phrases held per minute".
  - "**0** patterns in your words · 0 lines heard, none found", with words off.
  - The live hint is honest: "in tune not yet measured · 0 cheers".
- **Rule 3:** "not measured" must never be 0.
- **Also:** the singing judgement itself (held notes, range, cheers) is untested until the fake phone can send pitch.

### 6. Medium-low: a wrong hedge got past the guard
- **Steps:** POST the sample debrief from `docs/dev-setup.md` (longest dead air 4.1 s) to the MC.
- **Actual:** `spoken` says "nearly four and a half seconds of silence". 4.1 s is "just over four"; "nearly four and a half" overstates it by 0.4 s.
- **Expected:** the guard rejects hedges that point the wrong way or round more than honestly (`guard.py` rule: "nearly" / "just over" must point the right way).

### 7. Low: the set number stops at 6
- The singing cut sheet reads "Set 6 · The Stadium, Arena", and the speech set before it was also "Set 6" (`25`, `27`).
- **Cause:** the set number comes from the last-six records.
- **Expected:** "Set 7", or a number that doesn't repeat.

### 8. Low: the room goes black for 1–4 s after a venue change on the bill
- **Steps:** on the bill, change the venue (Club to Theatre).
- **Actual:** the area behind the bill is black at +1.3 s, and the Theatre appears by +3.9 s (`05-07-venue-theatre-load-1.jpg`, `06-07-venue-theatre-load-5.jpg`).
- **Expected:** keep the previous room or fade, rather than a hard cut to black.

### 9. Low: one debrief timed out
- **Steps:** the singing set's debrief, on the us-west-2 MC.
- **Actual:** "debrief: MC unavailable (timeout: no answer within 8 s)". The screen says "The MC couldn't be reached (timed out)". It happened once; other debriefs took 1.2–2.5 s.

### 10. Low: text over the 3D crowd is hard to read in places
- **Arena bill** (`16-s2-bill.jpg`): the lower-third body text ("set · a tough room, hecklers possible", "This is the room you'll face…") sits over the brightest, busiest part of the crowd.
- **Cut sheet in "after" mode** (`11`, `20`): people walk and stand behind the ledger table.
- **Singing** (`26-sg-live-2.jpg`): the pitch-trace legend runs across the crowd.

### 11. Low: the intro is re-written on every D-pad change
- Every settle on the bill triggers a new intro model call and Polly signing: over 30 intro calls this session, against 8 sets.
- It's harmless, but it costs calls; a longer settle delay or debounce would cut it.

## Limits of this pass

- **Singing:** pitch, held notes and cheers are untested; `fake-phone` sends no pitch.
- **The green room:** only the "nothing heard" answer is tested; a real question needs a real phone transcript.
- **The judge:** results for issue 2 were measured on this us-west-2 box. They will differ on a box in ap-south-1.
