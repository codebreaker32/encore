# MC voice auditions (Amazon Polly, 2026-10-11)

**Superseded by `v2/index.md` (2026-10-12):** the same voices, on lines written for the ear, with SSML delivery, predicted-naturalness scores and Nova 2 Sonic. The deadpan neural read is now 85%, not 90%.

Each clip reads a line in its persona's register. The times are synthesis round trips measured from the laptop in India.

| Persona | Clip | Engine, region | Time |
|---|---|---|---|
| warm (Meera) | `warm-kajal-generative.mp3` | generative, us-east-1 | 2043 ms |
| warm | `warm-kajal-neural.mp3` | neural, ap-south-1 | 377 ms |
| warm | `warm-ruth-generative.mp3` | generative, us-east-1 | 1431 ms |
| sarcastic (Vik) | `sarcastic-brian-generative.mp3` | generative, us-east-1 | 2406 ms |
| sarcastic | `sarcastic-arthur-neural.mp3` | neural, ap-south-1 | 347 ms |
| sarcastic | `sarcastic-matthew-generative.mp3` | generative, us-east-1 | 1363 ms |
| strict (Mr. Rao) | `strict-stephen-generative.mp3` | generative, us-east-1 | 1653 ms |
| strict | `strict-brian-neural.mp3` | neural, ap-south-1 | 402 ms |
| strict | `strict-matthew-generative.mp3` | generative, us-east-1 | 1594 ms |
| deadpan (Dev) | `deadpan-gregory-long-form.mp3` | long-form, us-east-1 | 2048 ms |
| deadpan | `deadpan-patrick-long-form.mp3` | long-form, us-east-1 | 2040 ms |
| deadpan | `deadpan-gregory-neural.mp3` | neural, ap-south-1 | 271 ms |

## Deadpan auditions (voice study, 2026-10-11)

In the file names, `gen`, `lf` and `neu` are the engine; `sin`, `iad` and `bom` are the region (Singapore ap-southeast-1, N. Virginia us-east-1, Mumbai ap-south-1). `short` is a one-line card and `long` a longer passage.

| Clip | Voice, engine, region | Length |
|---|---|---|
| `deadpan-matthew-gen-sin-short.mp3` | Matthew, generative, ap-southeast-1 | 5.7 s |
| `deadpan-matthew-gen-sin-long.mp3` | Matthew, generative, ap-southeast-1 | 14.9 s |
| `deadpan-gregory-lf-iad-long.mp3` | Gregory, long-form, us-east-1 | 17.6 s |
| `deadpan-gregory-neu-bom-long.mp3` | Gregory, neural, ap-south-1 | 16.1 s |

## Chosen (since the voice study, 2026-10-11)

| Persona | Voice | Debrief, green room and intro | Fallback, and every other line |
|---|---|---|---|
| warm (Meera) | Kajal (en-IN) | generative, ap-southeast-1 | neural, ap-south-1 |
| sarcastic (Vik) | Brian (en-GB) | generative, ap-southeast-1 | neural, ap-south-1 |
| strict (Mr. Rao) | Stephen (en-US) | generative, ap-southeast-1 | neural, ap-south-1 |
| deadpan (Dev) | Matthew (en-US) | generative, ap-southeast-1 | neural, ap-south-1, read at 90% |

Deadpan moved from Gregory to Matthew. Gregory's natural engine, long-form, exists only in us-east-1, and it waits longest before the first byte (table below). Matthew has generative in ap-southeast-1, the generative region nearest India. `MC_VOICE_DEADPAN=Gregory` still works: long-form in us-east-1, with Gregory on neural as the fallback.

The service no longer synthesizes. With `speak: true` it signs a SynthesizeSpeech GET for the guard-checked words (a presigned URL, valid 600 s, signed locally in about 1 ms) and returns `audio: {format, url, fallbackUrl?, voice, engine}`. The TV streams the MP3 straight from Polly over HTTPS: HTTP 200 `audio/mpeg` with no Content-Length (chunked on HTTP/1.1). A premium `url` comes with the same words on neural as `fallbackUrl`. The TV voices the intro (preloaded), the debrief and the green-room answers. The end card is no longer voiced, because the debrief speaks at the cut, and between-bit and heckle cards never were. Only voice and engine pairs that DescribeVoices lists for the region are signed (checked at boot); ap-south-1 lists no generative or long-form voices at all.

Overrides: `MC_VOICE_<PERSONA>` (the voice), `MC_VOICE_REGION` (neural, default the MC region), `MC_VOICE_PREMIUM_REGION` (generative, default ap-southeast-1) and `MC_VOICE_SIGNER_ROLE_ARN` (sign with that role's credentials, renewed 15 minutes before they expire, instead of the host's). `services/mc-agent/src/mc_agent/voice.py` holds the mapping.

## Measured on the build box (ap-south-1, 2026-10-11)

Fetching presigned URLs with curl over HTTP/2, as the TV would. The first five rows read a short debrief or card; the last four read a 164-character debrief line, three runs each, through Python's HTTP/1.1 client.

| Engine, region | Voice | First byte | Whole clip |
|---|---|---|---|
| neural, ap-south-1 | Kajal | 0.035 s | 0.25 s |
| neural, ap-south-1, SSML at 90% | Matthew | 0.033 s | 0.20 s |
| generative, ap-southeast-1 | Kajal | 0.26 s | 1.19 s |
| generative, ap-southeast-1 | Matthew | 0.26 s | 0.98 s |
| long-form, us-east-1 | Gregory | 0.76 s | 2.76 s |
| neural, ap-south-1 (164 characters) | Kajal | 0.07 s | 0.41 s |
| generative, ap-southeast-1 (164 characters) | Kajal, Brian, Stephen, Matthew | 0.36–0.47 s | 1.8–3.5 s |
| generative, us-east-1 (164 characters) | Matthew | 0.87 s | 2.38 s |
| long-form, us-east-1 (164 characters) | Gregory | 2.41 s | 4.17 s |

Through the MC (GLM-5, `speak: true`, 3 requests per persona and kind, medians of 12): the intro line answered in 0.51 s, the debrief in 1.52 s and a green-room answer in 1.54 s, each within 0.01 s of the model's own time. Before, when Polly synthesized inside the budget, the debrief took 3.13 s and the green room 3.92 s (the voice study's medians).
