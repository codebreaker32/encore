# MC voice auditions, v2: written for the ear (Amazon Polly and Nova 2 Sonic, 2026-10-12)

The user heard Vik's debrief on the TV and said the Polly voice was "way too AIsh". It read:

> "1.2 landed a minute, 1 laugh at 0:18, then 14.7 seconds of dead air at 0:20. The murmurs were the room checking if you were still there."

`sarcastic-before-brian-gen-sin-plain.mp3` is that line again, as the TV played it: Brian, generative, plain text. Every other clip reads lines rewritten for the ear, and every Polly clip goes through the service's own SSML (`voice.ssml()`: a beat where the line has "...", Dev's slower pace and sentence gaps). The words are the same in each persona's clips, so only the voice changes between them.

## The lines (the same set: an open mic, one laugh about twenty seconds in, then nearly fifteen seconds of silence)

| Persona | Debrief (`spoken`) | Green room ("Am I ready for the club?") | Intro (card, also voiced) |
|---|---|---|---|
| warm (Meera) | Priyanka, your first laugh came early, about twenty seconds in. Then it went quiet for nearly fifteen seconds. That's the one thing to fix... keep the next line coming, and every gap under four seconds. | Not yet, I think. The club wants three lines landing a minute, and you're at about one. Close that long silence first, then we'll talk. | Please welcome Priyanka! Five minutes at The Back Room, and the floor is yours. |
| sarcastic (Vik) | One laugh, about twenty seconds in. Lovely. Then nearly fifteen seconds of silence... which isn't so much a pause as a lease. | The Comedy Club? Bold. You landed about one line a minute, and they want three. Do another night here first... think of it as rehearsal with witnesses. | Next up, Priyanka. Five minutes at The Back Room. No pressure... well, some. |
| strict (Mr. Rao) | One laugh. Then nearly fifteen seconds of dead air, straight after it. That gap is the problem. Next set, nothing over four seconds. | No. The rule is three a minute, and no gap over four seconds. You did about one, and your longest gap was nearly fifteen. Open mic again. | Priyanka. Five minutes at The Back Room. Make every one of them count. |
| deadpan (Dev) | You landed about one line a minute. One laugh. Then nearly fifteen seconds of nothing... I'd have fewer seconds of nothing. | No. The club wants three lines a minute. You landed about one... So, no. | This is Priyanka. Five minutes. The Back Room... Go on, then. |

The guard passes all of these against that set's facts (`tests/test_spoken.py`).

## Chosen

| Persona | Voice | Premium (debrief, green room, intro) | Fallback | Delivery (SSML) | Why |
|---|---|---|---|---|---|
| warm (Meera) | Kajal (en-IN) | generative, ap-southeast-1 | neural, ap-south-1 | natural pace, 350 ms beat | Polly's only Indian-English generative voice, and Meera is Indian. Ruth (en-US) scores a little higher on predicted naturalness (4.43 against 4.32), but the predictor was trained mostly on US and UK speech, and it would cost Meera her accent. |
| sarcastic (Vik) | Brian (en-GB) | generative, ap-southeast-1 | neural, ap-south-1 | Brian's own pace, 550 ms beat before the sting | Brian's takes vary from call to call (4.14–4.55 here). Over two runs he averages 4.45: level with Matthew generative, and behind only Patrick long-form (4.51). The "before" clip scores 4.49, so the predictor finds nothing wrong with Brian's sound. What made it AI-ish was reading "one point two landed a minute… zero colon eighteen", which the new prompts and the guard now stop. Brian also keeps the cast distinct (one Indian woman, one British man, two American men). Brian at 108% and 115% scored the same or lower over two runs, so he keeps his own pace. |
| strict (Mr. Rao) | Stephen (en-US) | generative, ap-southeast-1 | neural, ap-south-1 | natural pace, 250 ms beat | 4.47, level with Patrick long-form (4.48). Its fallback is the best-scoring neural voice (4.41), and it has a 0.28 s first byte against 0.8 s. Polly has no Indian-English male voice on any engine. Nova's Arjun has one and read every line faithfully, but it can't be presigned (below). |
| deadpan (Dev) | Matthew (en-US) | generative, ap-southeast-1, at generative's slow step (85%) | neural, ap-south-1, 85% | 250 ms after every sentence, 700 ms beat before the last line | The top deadpan take (4.49): dry and unhurried at about 120 words a minute. Matthew at his own pace (4.41) and Patrick long-form (4.43) score lower, and Gregory long-form scores lowest (3.94). |

The voices are the same as on 2026-10-11. What changes is the script: the prompts, the guard and the SSML. To try the runner-up for Vik, set `MC_VOICE_SARCASTIC=Patrick`. That gives long-form in us-east-1, with a first byte about 0.5 s later from India and no neural fallback, because Patrick has no neural voice.

**Listen first:** `sarcastic-before-brian-gen-sin-plain.mp3` against `sarcastic-debrief-brian-gen-sin.mp3`, then `deadpan-debrief-matthew-gen-sin.mp3` against `deadpan-debrief-matthew-gen-sin-natural.mp3`.

## How they were judged
- **Predicted naturalness** is UTMOS22 (strong), a MOS predictor trained on listener ratings of synthetic speech (1–5). Nothing in this study was listened to by a person: the scores and the measurements below were the basis. The predictor saturates around 4.5 and can't hear wording, so treat 0.1 as noise and the choice as a shortlist for your ears.
- **Words a minute** counts the line's words over the span from the first sound to the last. **First byte** is SynthesizeSpeech timed from the build box in ap-south-1. A TV in India adds its own network time.
- **Generative takes `<prosody rate>` in steps.** Matthew, Stephen and Kajal read 86–114% at their own pace, 85% and below at one slow step (about 20% slower), and 115% and above at one fast step. A 92% deadpan on generative did nothing (the bytes were identical). Brian is the exception: his takes vary from call to call, and he follows the rate more smoothly. `<break>` works on every engine.

## Nova 2 Sonic (Bedrock, speech-to-speech)
- **Access works** on this account in us-east-1, us-west-2, ap-northeast-1 and eu-north-1: a real bidirectional stream from the build box answered with audio. Nova Sonic v1 has reached end of life (`ResourceNotFoundException`). The model insists on an audio input, so the reader sends silence plus a text turn.
- **It is not a faithful reader.** It was asked to read each line word for word, and its final transcript was compared with the line. For warm (Kiara), strict (Arjun) and deadpan (Matthew), all 21 reads checked over two to three runs matched. With the sarcastic style it improvised every time: 18 of 18 over three runs ("…I'm not hallucinating from the cheap beer", a 70-second chat answer). Those clips are left out of this folder. Its words would be its own, not the guard's, which breaks honesty rule 5.
- **It can't be presigned.** The TV needs an HTTPS URL. Nova streams PCM over a bidirectional HTTP/2 session, so the service would have to wait for the whole clip (1.0–1.3 s to the first audio, about 2× real time), check its transcript against the guarded words, encode it to MP3 and host it on S3. That adds seconds to every answer, against Polly's 1 ms signature.
- Kept for reference: `*-kiara-nova-nrt.mp3`, `*-arjun-nova-nrt.mp3` (strict) and `deadpan-*-matthew-nova-nrt.mp3`.

## Cost per 1M characters (what the credits pay)
| Engine | Price | Note |
|---|---|---|
| Polly standard | $4 | not used |
| Polly neural | $16 | every fallback; SSML tags are not billed |
| Polly generative | $30 | Kajal, Brian, Stephen and Matthew for the debrief, green room and intro |
| Polly long-form | $100 | only via an override (Gregory, Patrick, Ruth, Danielle) |
| Nova 2 Sonic | about $25–30 | An estimate. Nova bills tokens, not characters: these reads used 1.7 speech-output tokens per character (25 per second of audio) plus a per-call system prompt and silent input. Priced at the rates third parties quote ($3 per 1M speech-input tokens, $12 per 1M speech-output tokens); the Nova Sonic rows did not load on AWS's pricing pages. |

Polly's prices are from aws.amazon.com/polly/pricing (2026-10-12). Every TV play of a URL bills one synthesis. A 250-character debrief on generative costs $0.0075, and its neural fallback, if played, $0.004. This study cost about $1 of Polly and $0.30 of Nova, over three runs.

## Live check: the real model on the real set (GLM-5 through the MC on port 8096, 2026-10-12)

The words below are the model's own, from `speak: true` requests on the open-mic set above, with the final prompts and facts. All 12 answers carried a generative URL with a neural fallback, and every URL played: HTTP 200, first byte 0.36–0.49 s from the build box. The clips are `live-<persona>-<debrief|chat|intro>-c.mp3`, played through the URL the TV would get.

| Persona | Debrief `spoken` | Green-room `spoken` ("Am I ready for the Comedy Club?") | Intro |
|---|---|---|---|
| warm | Priyanka, your first laugh came early, about twenty seconds in. Then it went quiet for nearly fifteen seconds... The room gave you one laugh tonight. Next time, keep those gaps under four seconds and you'll give the next line a fighting chance. | Priyanka, I can't say yet. You landed just over one line a minute, and the room gave one laugh. The gap nearly fifteen seconds, about twenty seconds in... that's what the Comedy Club will punish. Give your next line a full second of air before the next one. | Priyanka's up next—welcome to The Back Room. Five minutes, first set. |
| sarcastic | One laugh in under a minute. Not terrible. Then nearly fifteen seconds of silence about twenty seconds in... I've seen shorter intermissions. | One laugh, and you landed just over one line a minute. Nearly fifteen seconds of silence twenty seconds in... I've taken longer coffee breaks. The house says Open Mic again. Shrink that gap and we'll see. | Priyanka's up. Five minutes. First time at The Back Room... let's see what the house gives you. |
| strict | One of three landed, just over one a minute. Your longest gap, nearly fifteen seconds, twenty seconds in. Cut every silence under four seconds. | One of three landed, just over one a minute. Your longest gap was nearly fifteen seconds, about twenty seconds in. Not yet. Cut every gap under four seconds. | Priyanka, five minutes, The Back Room. First set on record... let's see what the room gives. |
| deadpan | One of three lines landed. The room gave one laugh, about twenty seconds in. You had nearly fifteen seconds of dead air... that is a long time to say nothing. | One of three landed. That's just over one a minute. The room gave one laugh. Your longest dead air was nearly fifteen seconds, about twenty seconds in. | Priyanka, welcome to The Back Room. This is your first set. You've got five minutes. |

- No answer had a digit, a decimal or a clock time, and none was rejected. Debriefs answered in 0.95–1.25 s, green-room answers in 1.1–1.4 s, intros in 0.4–0.7 s.
- **How the prompts got here (two earlier runs the same day):**
  - In both, 2 of the 4 debriefs were sent back once, each time for "fourteen" for 14.7, which drops the decimals without a hedge. The retry passed, at a cost of about 1.5 s.
  - The first run copied punchlines from the spoken examples ("I've had shorter haircuts", "I'd have less nothing"), so those examples now show only the rhythm, in brackets.
  - The facts block now gives each number's honest spoken form ("14.7 seconds, at 0:20 (said aloud: "nearly fifteen seconds", "twenty seconds in")"), and the model uses it.
  - "I've seen shorter intermissions" above still comes from Vik's on-screen example, which is older than this work.
- **Meaning is still the model's.** In earlier runs, "the room drifted" and "you landed one line a minute" (1.2 without a hedge) got through, because one is a house number. The guard checks numbers, not meaning.
- One strict intro timed out at the 3.5 s line budget in the first run. It answered in under 0.5 s in both later runs.

## Every sample

In the file names, `gen`, `lf`, `neu` and `nova` are the engine, and `sin`, `iad`, `bom` and `nrt` the region: ap-southeast-1, us-east-1, ap-south-1 and ap-northeast-1. `-natural` and `-r108` change only the pace.

### warm

| Sample | Voice | Engine | Region | Why | Predicted naturalness | Words a minute | First byte |
|---|---|---|---|---|---|---|---|
| `warm-debrief-amy-gen-sin.mp3` | Amy | generative | ap-southeast-1 | en-GB generative | 4.33 | 164 | 0.30 s |
| `warm-chat-amy-gen-sin.mp3` | Amy | generative | ap-southeast-1 | en-GB generative | 4.38 | 170 | 0.30 s |
| `warm-intro-amy-gen-sin.mp3` | Amy | generative | ap-southeast-1 | en-GB generative | 3.97 | 170 | 0.30 s |
| `warm-debrief-danielle-lf-iad.mp3` | Danielle | long-form | us-east-1 | en-US long-form, softer and slower | 4.03 | 141 | 0.85 s |
| `warm-chat-danielle-lf-iad.mp3` | Danielle | long-form | us-east-1 | en-US long-form, softer and slower | 4.44 | 160 | 0.79 s |
| `warm-intro-danielle-lf-iad.mp3` | Danielle | long-form | us-east-1 | en-US long-form, softer and slower | 4.42 | 150 | 0.80 s |
| `warm-debrief-kajal-gen-sin.mp3` | Kajal | generative | ap-southeast-1 | pick: the only en-IN generative voice; Meera is Indian | 4.36 | 166 | 0.67 s |
| `warm-chat-kajal-gen-sin.mp3` | Kajal | generative | ap-southeast-1 | pick: the only en-IN generative voice; Meera is Indian | 4.21 | 184 | 0.65 s |
| `warm-intro-kajal-gen-sin.mp3` | Kajal | generative | ap-southeast-1 | pick: the only en-IN generative voice; Meera is Indian | 4.38 | 184 | 0.60 s |
| `warm-debrief-kajal-neu-bom.mp3` | Kajal | neural | ap-south-1 | the pick's fallback | 3.95 | 170 | 0.37 s |
| `warm-chat-kajal-neu-bom.mp3` | Kajal | neural | ap-south-1 | the pick's fallback | 4.14 | 174 | 0.31 s |
| `warm-intro-kajal-neu-bom.mp3` | Kajal | neural | ap-south-1 | the pick's fallback | 4.03 | 172 | 0.33 s |
| `warm-debrief-kiara-nova-nrt.mp3` | kiara | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN feminine | 4.50 | 179 | 1.09 s |
| `warm-chat-kiara-nova-nrt.mp3` | kiara | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN feminine | 4.49 | 188 | 1.01 s |
| `warm-intro-kiara-nova-nrt.mp3` | kiara | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN feminine | 4.47 | 198 | 1.02 s |
| `warm-debrief-ruth-gen-sin.mp3` | Ruth | generative | ap-southeast-1 | en-US generative, conversational | 4.42 | 171 | 0.30 s |
| `warm-chat-ruth-gen-sin.mp3` | Ruth | generative | ap-southeast-1 | en-US generative, conversational | 4.45 | 177 | 0.29 s |
| `warm-intro-ruth-gen-sin.mp3` | Ruth | generative | ap-southeast-1 | en-US generative, conversational | 4.41 | 196 | 0.29 s |
| `warm-debrief-ruth-lf-iad.mp3` | Ruth | long-form | us-east-1 | en-US long-form, built for narration | 4.41 | 161 | 0.81 s |
| `warm-chat-ruth-lf-iad.mp3` | Ruth | long-form | us-east-1 | en-US long-form, built for narration | 4.38 | 181 | 0.86 s |
| `warm-intro-ruth-lf-iad.mp3` | Ruth | long-form | us-east-1 | en-US long-form, built for narration | 4.46 | 187 | 0.85 s |

### sarcastic

| Sample | Voice | Engine | Region | Why | Predicted naturalness | Words a minute | First byte |
|---|---|---|---|---|---|---|---|
| `sarcastic-debrief-arthur-neu-bom.mp3` | Arthur | neural | ap-south-1 | en-GB male (neural only, so no premium take) | 4.24 | 164 | 0.04 s |
| `sarcastic-chat-arthur-neu-bom.mp3` | Arthur | neural | ap-south-1 | en-GB male (neural only, so no premium take) | 4.07 | 171 | 0.04 s |
| `sarcastic-intro-arthur-neu-bom.mp3` | Arthur | neural | ap-south-1 | en-GB male (neural only, so no premium take) | 4.06 | 137 | 0.04 s |
| `sarcastic-before-brian-gen-sin-plain.mp3` | Brian | generative | ap-southeast-1 | what the TV played today: digits, decimals and clock times, plain text | 4.49 | 109 | 0.28 s |
| `sarcastic-debrief-brian-gen-sin-r108.mp3` | Brian | generative | ap-southeast-1 | Brian brisker (108%) | 4.49 | 152 | 0.29 s |
| `sarcastic-chat-brian-gen-sin-r108.mp3` | Brian | generative | ap-southeast-1 | Brian brisker (108%) | 4.44 | 161 | 0.28 s |
| `sarcastic-intro-brian-gen-sin-r108.mp3` | Brian | generative | ap-southeast-1 | Brian brisker (108%) | 4.43 | 116 | 0.28 s |
| `sarcastic-debrief-brian-gen-sin.mp3` | Brian | generative | ap-southeast-1 | pick: en-GB, dry; same voice as today, now on ear-written lines and SSML beats | 4.14 | 139 | 0.29 s |
| `sarcastic-chat-brian-gen-sin.mp3` | Brian | generative | ap-southeast-1 | pick: en-GB, dry; same voice as today, now on ear-written lines and SSML beats | 4.51 | 147 | 0.28 s |
| `sarcastic-intro-brian-gen-sin.mp3` | Brian | generative | ap-southeast-1 | pick: en-GB, dry; same voice as today, now on ear-written lines and SSML beats | 4.49 | 113 | 0.28 s |
| `sarcastic-debrief-brian-neu-bom.mp3` | Brian | neural | ap-south-1 | the pick's fallback | 4.34 | 127 | 0.05 s |
| `sarcastic-chat-brian-neu-bom.mp3` | Brian | neural | ap-south-1 | the pick's fallback | 4.02 | 130 | 0.04 s |
| `sarcastic-intro-brian-neu-bom.mp3` | Brian | neural | ap-south-1 | the pick's fallback | 4.27 | 97 | 0.05 s |
| `sarcastic-debrief-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | en-US generative male (Dev's voice) | 4.48 | 167 | 0.30 s |
| `sarcastic-chat-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | en-US generative male (Dev's voice) | 4.39 | 183 | 0.29 s |
| `sarcastic-intro-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | en-US generative male (Dev's voice) | 4.48 | 138 | 0.30 s |
| `sarcastic-debrief-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male, the closest rival | 4.53 | 149 | 0.80 s |
| `sarcastic-chat-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male, the closest rival | 4.50 | 167 | 0.80 s |
| `sarcastic-intro-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male, the closest rival | 4.50 | 122 | 0.81 s |

### strict

| Sample | Voice | Engine | Region | Why | Predicted naturalness | Words a minute | First byte |
|---|---|---|---|---|---|---|---|
| `strict-debrief-arjun-nova-nrt.mp3` | arjun | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN masculine (Mr. Rao is Indian) | 4.44 | 139 | 1.13 s |
| `strict-chat-arjun-nova-nrt.mp3` | arjun | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN masculine (Mr. Rao is Indian) | 4.42 | 162 | 1.13 s |
| `strict-intro-arjun-nova-nrt.mp3` | arjun | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-IN masculine (Mr. Rao is Indian) | 4.33 | 185 | 1.05 s |
| `strict-debrief-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form male, measured | 4.41 | 148 | 0.79 s |
| `strict-chat-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form male, measured | 4.15 | 169 | 0.82 s |
| `strict-intro-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form male, measured | 4.38 | 157 | 0.78 s |
| `strict-debrief-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male | 4.51 | 148 | 0.86 s |
| `strict-chat-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male | 4.43 | 166 | 0.77 s |
| `strict-intro-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form male | 4.50 | 164 | 0.78 s |
| `strict-debrief-stephen-gen-sin.mp3` | Stephen | generative | ap-southeast-1 | pick: crisp, quick first byte, distinct from Brian and Matthew | 4.47 | 155 | 0.30 s |
| `strict-chat-stephen-gen-sin.mp3` | Stephen | generative | ap-southeast-1 | pick: crisp, quick first byte, distinct from Brian and Matthew | 4.49 | 190 | 0.28 s |
| `strict-intro-stephen-gen-sin.mp3` | Stephen | generative | ap-southeast-1 | pick: crisp, quick first byte, distinct from Brian and Matthew | 4.46 | 188 | 0.27 s |
| `strict-debrief-stephen-neu-bom.mp3` | Stephen | neural | ap-south-1 | the pick's fallback | 4.44 | 160 | 0.04 s |
| `strict-chat-stephen-neu-bom.mp3` | Stephen | neural | ap-south-1 | the pick's fallback | 4.45 | 177 | 0.03 s |
| `strict-intro-stephen-neu-bom.mp3` | Stephen | neural | ap-south-1 | the pick's fallback | 4.34 | 176 | 0.03 s |

### deadpan

| Sample | Voice | Engine | Region | Why | Predicted naturalness | Words a minute | First byte |
|---|---|---|---|---|---|---|---|
| `deadpan-debrief-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form at 85% with beats | 4.40 | 122 | 0.77 s |
| `deadpan-chat-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form at 85% with beats | 3.73 | 113 | 0.78 s |
| `deadpan-intro-gregory-lf-iad.mp3` | Gregory | long-form | us-east-1 | en-US long-form at 85% with beats | 3.70 | 93 | 0.78 s |
| `deadpan-debrief-matthew-gen-sin-natural.mp3` | Matthew | generative | ap-southeast-1 | Matthew at his own pace, for comparison | 4.46 | 166 | 0.27 s |
| `deadpan-chat-matthew-gen-sin-natural.mp3` | Matthew | generative | ap-southeast-1 | Matthew at his own pace, for comparison | 4.45 | 161 | 0.28 s |
| `deadpan-intro-matthew-gen-sin-natural.mp3` | Matthew | generative | ap-southeast-1 | Matthew at his own pace, for comparison | 4.32 | 133 | 0.27 s |
| `deadpan-debrief-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | pick: generative's slow step (85%), sentence gaps and a long beat | 4.48 | 134 | 0.29 s |
| `deadpan-chat-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | pick: generative's slow step (85%), sentence gaps and a long beat | 4.54 | 119 | 0.28 s |
| `deadpan-intro-matthew-gen-sin.mp3` | Matthew | generative | ap-southeast-1 | pick: generative's slow step (85%), sentence gaps and a long beat | 4.44 | 114 | 0.28 s |
| `deadpan-debrief-matthew-neu-bom.mp3` | Matthew | neural | ap-south-1 | the pick's fallback at 85% | 4.10 | 138 | 0.03 s |
| `deadpan-chat-matthew-neu-bom.mp3` | Matthew | neural | ap-south-1 | the pick's fallback at 85% | 4.41 | 112 | 0.03 s |
| `deadpan-intro-matthew-neu-bom.mp3` | Matthew | neural | ap-south-1 | the pick's fallback at 85% | 4.26 | 95 | 0.03 s |
| `deadpan-debrief-matthew-nova-nrt.mp3` | matthew | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-US masculine | 4.44 | 195 | 1.00 s |
| `deadpan-chat-matthew-nova-nrt.mp3` | matthew | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-US masculine | 4.47 | 171 | 0.99 s |
| `deadpan-intro-matthew-nova-nrt.mp3` | matthew | Nova 2 Sonic | ap-northeast-1 | Nova 2 Sonic en-US masculine | 4.42 | 192 | 1.01 s |
| `deadpan-debrief-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form at 85% with beats | 4.49 | 119 | 0.83 s |
| `deadpan-chat-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form at 85% with beats | 4.31 | 112 | 0.86 s |
| `deadpan-intro-patrick-lf-iad.mp3` | Patrick | long-form | us-east-1 | en-US long-form at 85% with beats | 4.50 | 99 | 0.77 s |
