# MC voice: ranked plan (best voice, lowest lag on Android TV, web and Vega)

Paths used below:
- Service: `/home/aman/projects/adh/strumble/services/mc-agent/src/mc_agent/` (voice.py, mc.py, models.py, app.py); tests in `/home/aman/projects/adh/strumble/services/mc-agent/tests/test_voice.py`.
- Contract: `/home/aman/projects/adh/strumble/packages/crowd/src/types.ts`.
- TV: `/home/aman/projects/adh/strumble/packages/shared-ui/src/encore/` (A = EncoreApp.tsx, S = useSetSession.ts) and its `world/` folder (McVoice.tsx, McVoice.vega.tsx, sound.vega.ts, sounds.ts).

## What I checked this session
These ran on the laptop and cost about $0.02 of Polly. No repo files were edited and nothing is left running. Scripts are in `/tmp/claude-1000/-home-aman-projects-adh/7fc43422-bfa5-416d-b8d3-3abcf1bf98db/scratchpad/voiceplan/`.

1. **Polly can be fetched straight from a presigned GET URL.**
   - Polly answered HTTP 200 `audio/mpeg`, sent in chunks with no `Content-Length`, for neural Kajal (Mumbai, ap-south-1), generative Kajal (Singapore, ap-southeast-1), generative Stephen and Brian (us-east-1), long-form Gregory, the deadpan SSML, and a worst-case 320-character text with dashes, quotes and "…". The URL's query string is 2.1–2.5 KB.
   - First byte on a new connection from India: neural 0.14–0.18 s, Kajal in Singapore 0.37 s, the 320-character Brian text in Singapore 0.47 s (the whole clip took 7.1 s), Stephen in us-east-1 0.83 s, long-form 2.22 s.
   - So the TV can play Polly's audio itself over HTTPS as it arrives. That removes the base64, S3 and any relay through the MC.
2. **Android can never play `data:` URIs (confirmed in code).** react-native-video 6.19.1 `Source.kt` `isValidScheme` has no `data`, so the source is empty and no event ever fires. This is what jams the voice queue.
3. **Vega's Media Source Extensions path is already known to fail.** Both the friction log and the `sound.vega.ts` comment record that the demuxer never initialises from raw MP3. The w3cmedia mime registry says "We dont support audio/mpeg". Setting `src` to an HTTPS URL is the only path. Vega docs and a community thread also show that reusing one player with `load()` is unreliable on the simulator (VVD), and that a player should be deinitialized when it's done.
4. **The demo device is in us-east-1.**
   - The VVD's MC runs on the Vega box. Unless `MC_REGION` is set there, it calls the model and neural Polly in Mumbai.
   - `_model()` in mc.py opens a new HTTP connection for every request. A new connection on the us-east-1 to Mumbai path costs about 0.56–0.61 s, going by the study's handshake table. Not measured on that box.
5. **Keep the model in ap-south-1.** zai.glm-5 also answers in us-east-1, but four 5-token calls there took 0.97, 0.97, 6.38 and 9.97 s, against 0.29–0.35 s in ap-south-1.

## 1. Send the voice as a presigned Polly URL instead of base64 (all three TVs)

**Change**
- **voice.py:** replace `synthesize()` with `sign(text, persona, premium) -> McAudio`:
  ```python
  url = _client(region_for(engine)).generate_presigned_url(
      "synthesize_speech", Params=request(text, persona, premium), ExpiresIn=600, HttpMethod="GET")
  ```
  - Signing is local and takes about 1 ms.
  - Regions per engine: neural uses `MC_VOICE_REGION` (default: the MC region). Generative uses `MC_VOICE_PREMIUM_REGION`, whose default becomes ap-southeast-1. Long-form always uses us-east-1.
  - Only sign a voice and engine in a region that offers them: check with DescribeVoices at boot, or use the study's table. In the Singapore run, all 6 deadpan premium calls were wasted.
  - Return `url` (premium where available) and `fallbackUrl` (neural, same words).
- **mc.py:** `_voice()` signs instead of waiting. Delete the thread-pool wait, `MIN_VOICE_S`, `PREMIUM_MIN_S` and the premium window, so the budget covers only the model and the guard.
- **Contract:** `McAudio` in both models.py and types.ts becomes `{format, url, fallbackUrl?, voice, engine}`; drop `base64`. In test_voice.py, replace the budget-window tests with signing tests.
- **TV:**
  - sounds.ts: `audioUri()` returns `audio.url`.
  - McVoice.tsx: use `source={{uri, type:'mp3', bufferConfig:{bufferForPlaybackMs:250, bufferForPlaybackAfterRebufferMs:1000}}}`. On Android the player otherwise waits for 2.5 s of audio before it starts. `onError` tries `fallbackUrl` once.
  - sound.vega.ts: delete `attachDataUri` and `base64Bytes`; every clip uses `src` plus `load()`.
- **Per host:**
  - Vega box: `MC_VOICE_REGION=us-east-1` and `MC_VOICE_PREMIUM_REGION=us-east-1`, recorded in `/home/aman/projects/adh/strumble/docs/dev-setup.md` and `/home/aman/projects/adh/strumble/apps/vega/tools/vvd-take.sh`.
  - Laptop (serving the Google TV) and build box (serving the browser in India): neural in Mumbai, generative in Singapore.

**Saves** (medians from the build-box study; "+" means TV-side time nobody has measured)

| kind | words on screen, today → after | first voice, today → after (TV in India) |
|---|---|---|
| intro, not prefetched | 0.79 → ~0.55 s (−240 ms) | 0.79+ → ~0.75 s |
| end line | 1.02 → ~0.69 s (−310 ms) | 1.02+ → ~0.85 s (−150 to −200 ms) |
| debrief | 3.13 → ~1.47 s (−1,650; max −3,330) | 3.13+ → ~1.8–2.0 s (−1,100 to −1,300) |
| chat | 3.92 → ~1.43 s (−2,320; max −3,510) | 3.92+ → ~1.7–1.9 s (−2,000 to −2,200) |
| deadpan debrief (long-form) | 3.83 → ~1.31 s (−2,520) | 3.83+ → ~3.2–3.6 s (−200 to −600) |

- **Worst case today:** a 300-character Brian answer waits about 6.1 s for a premium clip that takes 6.8–7.9 s. The neural retry then has only about 0.5 s left, so the words show at about 8 s, likely with no voice. After the change: words at about 1.4 s and voice about 0.5 s later.
- **Android and Vega:** today the voice never plays, the queue jams and the room stays ducked; on Vega the fallback timer holds the queue for 17–44 s. After the change they play. Responses shrink from 38–64 KB to about 5 KB.
- **Short-term regression:** on web, the prefetched intro plays from memory today. With a URL it starts 150–500 ms after OK until item 3 preloads it.

**Risk**
- **Vega is untested on this kind of URL.** URL mode is documented for MP3 files, and only S3 objects (with `Content-Length` and a `.mp3` name) have been proven on the VVD. Polly's URL is chunked, has no extension and is about 2.5 KB long.
  - So run a 10-minute VVD check first.
  - If it fails, use S3 on Vega only. The MC uploads the finished clip to a private us-east-1 bucket (`mc-voice/` prefix, deleted after a day, `s3:PutObject` added to `encore-box-role`) and returns a presigned S3 URL. That costs the full synthesis plus about 0.1 s for the upload.
- **No length on chunked streams**, so the hush can't use `onLoad`; item 2 fixes this.
- **The URL works as a pass for that one synthesis until it expires.** It carries the session token. Keep the expiry at 600 s and never log the URL. On the laptop, sign with a role that only allows Polly, not root's `aws login`.
- **Every fetch bills one synthesis**, and Brian's take differs on each call.
- **The premium-to-neural fallback moves to the TV** (`fallbackUrl`).
- **Honesty is unchanged.** The signature covers exactly the guard-checked text, and each clip is synthesized from that answer's words. Nothing is canned or reused across answers or sets.

**Verify**
- pytest: the signed `Text` equals the guarded `spoken` or `text`; each persona gets the right region and engine; deadpan is never generative; no URL appears in the log.
- Rerun the study's `drive.py` (80 requests) on the build box: each kind's total should be the model time plus about 30 ms.
- VVD: one AudioPlayer on a fresh URL should show `loadedmetadata` and `ended` in `vvd.sh log`, and the voice should be audible in `parecord` of the null sink. Then record a take with `vvd-take.sh`.
- Google TV release APK: `[mc-voice]` timestamps in `adb logcat -s ReactNativeJS`.
- Web: Playwright on `?demo=cutsheet` should see `currentTime > 0`.

## 2. TV voice player and queue (A, S, McVoice.tsx, McVoice.vega.tsx, sound.vega.ts)

**Change**
- **Preload the next clip.** While one clip plays, the next one loads paused.
  - react-native-video: two mounted slots with fixed keys, swapping `source`.
  - Vega: create the next AudioPlayer ahead of time and deinitialize each one when it ends; don't swap `src` on one player.
- **Deadlines.**
  - If a clip isn't playing within 2.5 s (4.5 s for long-form), try `fallbackUrl`, then skip it. This also clears clips that web autoplay blocks.
  - Vega's end timer becomes the real duration plus 1 s, or the estimate × 1.5 + 1 s while the duration is unknown (today it is twice the estimate plus 2 s).
- **Queue rules.**
  - `arm()` drops queued after-set clips and stops the one playing, so an old debrief never talks over a new set.
  - The intro jumps the queue.
  - The `slice(-3)` cap (A:137) evicts from the tail and never drops the clip that is playing.
  - `ducked` (A:430) and the hush start when the clip is actually playing, not when it is queued.
- **Hush as a short, renewed lease.** When a clip starts playing, send `hush(1.5)` and renew it every second until `ended`. This replaces the length estimate at A:210. The phone can only extend a hush, never shorten it (`/home/aman/projects/adh/strumble/apps/companion/src/set/listener.ts:194`), so an estimate that runs long can't be pulled back.
- **Drop a late intro.** If the intro voice hasn't started by t = 4 s, or the performer has already spoken, drop it (the engine's `windowOpen`).
- **Green room:** `talk()` (A:356) stops the playing clip before it opens the phone's mic.
- **End line vs debrief — your call.**
  - Today the end voice (median 7.1 s of audio) runs about 5 s past the 3 s finale, over a cut sheet that doesn't show its words. The debrief voice then waits until about 8 s after the set ends.
  - Option A: hold the finale while the end voice plays (cap 9 s), then cut with the debrief preloaded.
  - Option B (lowest lag): stop voicing the end card. The debrief speaks at the cut, 3.0 s after the end (−5,000 ms), and the same numbers aren't said twice.

**Saves**
- Android start buffer from 2.5 s of audio to 250 ms: −450 to −720 ms on generative voices (Brian the most), about −100 ms on neural.
- Creating the player ahead of time: −100 to −300 ms per clip (an estimate; creating a player per crowd cue "cost a visible beat").
- An old debrief blocking the next intro: up to −20 s.
- The debrief voice waiting behind the end voice: −5 s with option B. With A, it starts the moment its words appear.

**Risk:** more state in McVoice; source swaps on a mounted react-native-video player; memory for two Vega players on a stick.

**Verify**
- `[mc-voice] queued / loading / playing / ended / skipped` logs on the Google TV: from response to playing under 400 ms for neural and under 600 ms for generative.
- Pressing OK on the cut sheet mid-debrief stops the debrief and plays the intro.
- A deliberately bad premium region (`MC_VOICE_PREMIUM_REGION=ap-south-1`) falls back to neural within the deadline.
- The fake-phone log shows each hush ending within 1.5 s of `ended`.

## 3. Prefetch the intro wherever its facts are known (A, S)

**Change**
- Run the bill's 900 ms "selection settled" warm-up on the cut sheet too, once the debrief has arrived. Today, OK on the cut sheet (A:404-407) always asks at OK.
  - By then the venue already follows `next` and the records include the finished set, so the intro's cache key matches at OK.
- Re-warm every 75 s while the user rests (the cache lasts 90 s, S:81), and immediately if a warm-up fails.
- Load the warm intro's audio paused in item 2's preload slot. The 600 s URL expiry outlives the 90 s cache.
- `stop()` (S:399-404) clears the pending intro.

**Saves:** pressing OK on the cut sheet (the "again" loop) goes from 790 ms median (1,330 ms max) to about 0. The case where the warm-up failed costs up to 8.5 s today. On the bill, the intro plays from the buffer, saving 150–500 ms once item 1 is in.

**Risk:** about $0.15 per idle hour for the re-warming; the existing key and age checks keep stale intros out.

**Verify:** after OK on the cut sheet, the intro text is set within 100 ms and the intro is playing within 300 ms. After a 2-minute rest on the bill, an intro is still ready.

## 4. Warm service start and one lasting model connection (mc.py, app.py)

**Change**
- One long-lived asyncio loop on its own thread (`run_coroutine_threadsafe`) instead of `asyncio.run` for every request.
- One `AsyncOpenAI`/httpx client per region: `keepalive_expiry` of at least 120 s (httpx defaults to 5 s), per-request timeouts via `with_options`, and one retry on connection errors.
- At boot: resolve the credentials, make one 5-token completion and run item 1's DescribeVoices check. Then a keep-alive call every 45 s.

**Saves**
- First request after each MC start: about −1,000 ms (the cold debrief's model took 2.43 s against a 1.44 s median).
- About −30 ms per request on hosts in Mumbai.
- About −550 ms per request on the Vega box (an estimate). It shows mainly in chat there; the finale hides it for the end line and the debrief.

**Risk:** without the retry, a connection the server closed while idle would show as "unreachable".

**Verify:** on the Vega box, a line's logged model time should be about the build box's plus 0.2 s, not plus 0.8 s.

## 5. Voice per persona (`VOICES` and `PREMIUM_ENGINE` in voice.py; `/home/aman/projects/adh/strumble/docs/voice-samples/README.md`)
- **Warm (Kajal): keep, generative.** She is the only en-IN generative voice. Her first byte is 170 ms from Singapore against 300 ms from us-east-1, and her audio is identical byte for byte in both regions.
- **Sarcastic (Brian): keep, generative.** He takes 0.31–0.32 s to synthesize each second of audio, which only hurt while the service waited for the whole clip. Streamed, only his 270–290 ms first byte counts.
- **Strict (Stephen): keep.** Polly has no Indian-English male voice on any engine.
- **Deadpan (Dev): audition Matthew generative.**
  - Gregory has no generative voice anywhere. His long-form voice is us-east-1 only, takes 1.8–2.6 s to the first byte and can't be streamed early.
  - Listen to Matthew with and without `<prosody rate="90%">`; the takes are on the build box at `/tmp/voicestudy/out/dead-matthew-gen-sin-*.mp3`.
  - If you choose Matthew, use him for every deadpan moment: the voice arrives about 1.7 s sooner on the debrief and chat.
  - If Gregory stays, use long-form for the debrief and chat only (voice about 2 s after the words) and neural at 90% for lines.
- **Intro → generative:** no cost once preloaded. The end line, if it stays voiced, also goes generative, for 120–240 ms more. Neural stays the fallback, and between-bit and heckle cards stay unvoiced.

## 6. Budgets and timeouts
- Keep the model budgets at 8 s and 3.5 s, and the TV's 750 ms grace. With Polly out of the budget, the guard's one retry gets 1.4–2.9 s more room. Lowering the budgets would not move the medians.
- Add item 2's voice deadlines, keep the 600 s URL expiry, and drop queued clips older than 5 minutes.

## Not worth it, or impossible
- **Polly bidirectional streaming.**
  - On finished text its first audio comes later than the normal call: 300–350 ms against 170 ms in Singapore, and 670–750 ms against 300 ms in us-east-1.
  - It needs a Node or Java helper (boto3 can't call it) and works with generative voices only, so not Gregory.
  - Its one gain, feeding words while the model writes, would voice them before the honesty check has seen the whole answer.
  - Item 1 already streams the audio as it is synthesized.
- **Starting Polly on the first sentence before the model finishes.**
  - `spoken` is the 4th of 5 fields in the debrief and the last field in chat, and it begins only 0.15–0.25 s before the answer is done. The most it could save is 100–300 ms.
  - If the check then rejected the answer (the `next` rule, "not measured", a number), the MC would already have spoken words that failed.
  - Splitting a finished `spoken` into sentences gains nothing once streamed (the first byte is the same at 60 and 250 characters) and hurts the delivery.
- **Media Source Extensions on Vega:** fact 3 above.
- **The MC serving the audio itself:** Vega refuses plain http, and nothing reached at 10.0.2.2 can hold a trusted certificate.
- **S3 as the main path:** it needs the whole clip first. Keep it only as the Vega fallback.
- **Moving the model to us-east-1:** fact 5 above.
- **Nova Sonic:** it writes its own reply, so it can't read the checked words. It reads NOT_AUTHORIZED on this account and isn't offered in Mumbai or Singapore.
- **Cartesia and Qwen3-TTS:** the account's GPU endpoint quota is 0, and their speed figures are vendor claims.
- **Opus or Vorbis:** no speed change (first byte 0.17–0.18 s in every format) and untested on Vega. Keep MP3 at 24 kHz.
- **Prefetching the end line, debrief or chat:** their facts only exist at that moment, so anything earlier would voice stale numbers.

## First three changes, in order
1. **Item 1.** Start with the 10-minute VVD check that a presigned Polly URL plays in an AudioPlayer. Then the service signing, the contract change, and `src` on Android, web and Vega. This makes the voice audible on Android and Vega and takes Polly out of the wait for the words.
2. **Item 2.** The player and queue: preload, the 250 ms start buffer, deadlines with fallback, clearing the queue at arm, never evicting the playing clip, and ducking and hush only while audible. Plus your choice of A or B for the end voice.
3. **Item 3.** Prefetch the intro from the cut sheet, re-warm it while resting, and preload its audio.

After those comes item 4: time one request on the Vega box first, and do it next if the connection costs more than 300 ms. Item 5 follows the deadpan audition.