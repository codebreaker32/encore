# Content judge calibration (Tier 2)

Measured 2026-10-12 on the build box (c7i.2xlarge, ap-south-1, CPU only), Bedrock's OpenAI-compatible endpoint in ap-south-1, and the Skyworth Google TV. Scripts are in `services/mc-agent/deploy/calibrate/`. The data stays on the box under `~/judge` and is not in the repo.

**The question.** Is there a model that can judge a joke (or a poem or speech line) well enough, and fast enough, to count as an estimate on screen? The user said "latency and correctness, both matter". The rule we agreed: pick the judge with the best Spearman on a held-out rated set, among those whose p90 is ≤ 500 ms on the real path, from the TV having the line to the TV having the verdict. Never pick one that is fast but no better than chance.

**Short answer.** For stand-up, yes, but no LLM on its own qualifies. A CPU RoBERTa trained on Reddit jokes ranks jokes best: ρ = 0.37, against 0.10 for the best simple baseline. But it can't tell a joke from a flat line of the same idea. The fast LLMs have the opposite problem: they tell those apart (95–100%) but rank Reddit jokes no better than chance. A 0.7/0.3 percentile mix of RoBERTa and a fast LLM does both, at p90 ≤ 500 ms. Poetry and speech have no rated set, so all we have there is our own sanity pairs.

## Data and licences

- **rJokes** (Weller & Seppi, LREC 2020, github.com/orionw/rJokesData). Reddit r/Jokes posts, each scored `round(ln(upvotes + 1))`, an integer from 0 to 11. The repo has **no LICENSE file**. Its README says: "The data is under the Reddit License and Terms of Service … users must follow the Reddit User Agreement and Privacy Policy, as well as remove any posts if asked to by the original user." We use it for internal evaluation only. It is not in the repo, and no joke appears in the product.
- **`iamahmadyasin/humor-roberta-large`** (Hugging Face): RoBERTa-large fine-tuned on the rJokes train split to predict that score. Its card says `license: mit`, and its base model `roberta-large` is MIT too. The card reports Spearman 0.432 on its own leakage-cleaned test split.
- **Sanity pairs** (`deploy/calibrate/sanity_pairs.json`): 60 pairs, 20 each for stand-up, poetry and speech. **We wrote and labelled them ourselves** (the Encore team with Claude). Each pair says one idea two ways after the same one or two earlier lines: "strong" (a joke that turns its setup; an image, a sound or a turn; a quotable point, a device or a call) and "flat" (the same idea said plainly). The two versions are about the same length: flat is slightly longer on average, so length can't explain the result.

## The held-out sample and the leakage handling

`make_sample.py` follows the model card's cleaning, but more strictly:

1. Start from rJokes' **test** split: 43,246 jokes.
2. Normalise each joke's text (lowercase, letters and digits only, single spaces).
3. Drop every test joke whose normalised text also appears in train or dev: 3,480 jokes (8.0%). This is stricter than the card's 2.4% of exact copies, because normalising also catches reposts that differ only in case or punctuation. The model is never tested on its own training jokes.
4. Drop jokes repeated within test (124) and jokes under five words (56). That leaves 39,586.
5. Keep stage-sized jokes only (title ≤ 200 characters, body 1–400): 34,563.
6. Draw **1,000** with seed 20261012.

The score histogram from 0 to 10 is 394 / 239 / 167 / 93 / 50 / 33 / 7 / 11 / 3 / 2 / 1, so most jokes got few upvotes.

Each joke maps to the judge's shape: `context = [title]` (the setup) and `text = body` (the punch). RoBERTa reads "title body", the string it was trained on.

A separate **dev** sample (300 jokes from dev, with anything also in train or test removed) was used only to choose prompt variants and the ensemble weight. The test sample was never used for tuning.

Spearman ρ is computed against the log-upvote score. The 95% CIs are percentile bootstraps (2,000 resamples). Every judge listed above the baselines also has a paired-bootstrap CI for "ρ minus the punch-length baseline's ρ"; those are quoted where it matters.

## Results

The real path is: Google TV → `adb reverse` over Wi-Fi → the laptop (WSL) → an SSH tunnel → the MC service on the box (`POST /invocations`, `kind: judge`) → Bedrock in ap-south-1. The client is the TV's own shell (no curl or wget on the TV, so toybox `nc`, timed with mksh's `$EPOCHREALTIME`). Each judge got 150 sequential lines, measured two ways:

- **fresh**: a new TCP connection per line, `tv_lat.sh`. This is pessimistic, because each line also pays for opening a connection through adb reverse and SSH.
- **kept**: one kept-alive connection, `tv_lat_ka.sh`. This is what an HTTP client with a connection pool does.

The LLM runs used a 5 s budget, so the true latency shows. "Service" is the verdict's own `ms`. Pairs columns are stand-up / poetry / speech accuracy, ties counting half.

| Judge | rJokes ρ [95% CI] (n) | Pairs | Real path ms, fresh p50 / p90 / p99 | Real path ms, kept p50 / p90 / p99 | Service p50 ms | p90 ≤ 500? |
|---|---|---|---|---|---|---|
| **humor-roberta-large, int8 ONNX, CPU (2 threads)** | **0.373 [0.32, 0.43]** (1000) | **0.40** / – / – | 237 / 279 / 328 | 74 / 106 / 129 | 41 | yes |
| **0.7·RoBERTa + 0.3·ministral-3-8b** (percentile mix) | **0.339 [0.28, 0.39]** (1000) | **0.90** / – / – | 345 / 441 / 515 ¹ | 173 / 270 / 373 ¹ | 141 | yes |
| 0.7·RoBERTa + 0.3·qwen3-32b | 0.349 [0.29, 0.40] (1000) | 0.90 / – / – | 352 / 463 / 570 ¹ | 248 / 393 / 502 ¹ | 176 | yes |
| 0.5·RoBERTa + 0.5·ministral-3-8b | 0.261 [0.20, 0.32] (1000) | 0.95 / – / – | as above ¹ | as above ¹ | 141 | yes |
| 0.5·RoBERTa + 0.5·qwen3-32b | 0.276 [0.22, 0.33] (1000) | 1.00 / – / – | as above ¹ | as above ¹ | 176 | yes |
| 0.7·RoBERTa + 0.3·glm-5 | 0.389 [0.33, 0.44] (999) | 0.95 / – / – | not run: glm-5 alone is too slow | | | no |
| zai.glm-5 (reference) | 0.252 [0.19, 0.31] (999) | 0.95 / 1.00 / 1.00 | 769 / 1135 / 3832 | 581 / 1494 / 5130 | 507 | no |
| qwen.qwen3-32b | 0.027 [−0.03, 0.09] (1000) | 1.00 / 1.00 / 0.975 | 370 / 485 / 767 | 214 / 267 / 377 | 174 | yes, but at chance |
| mistral.ministral-3-8b-instruct | −0.017 [−0.08, 0.05] (1000) | 0.975 / 1.00 / 0.975 | 342 / 409 / 477 | 173 / 243 / 281 | 151 | yes, but at chance |
| mistral.ministral-3-14b-instruct | 0.007 [−0.05, 0.07] (1000) | 1.00 / 1.00 (19) / 0.95 | 401 / 515 / 791 | 270 / 434 / 759 | 201 | fresh no, kept yes; at chance |
| zai.glm-4.7-flash | 0.047 [−0.02, 0.11] (998) | 1.00 / 1.00 / 1.00 | 394 / 528 / 641 | 276 / 401 / 618 | 207 | fresh no, kept yes; at chance |
| *Baseline:* Tier 1 (the engine's deterministic content score; non-zero on 369 of the 1,000 jokes) | 0.048 [−0.02, 0.11] (1000) | 0.65 / 0.65 / 0.475 | 0 (on the TV) | | | – |
| *Baseline:* punch length in words (pairs: line length) | 0.100 [0.04, 0.16] (1000) | 0.30 / 0.475 / 0.45 | | | | – |
| *Baseline:* random | 0.022 [−0.04, 0.08] (1000) | 0.5 expected | | | | – |

¹ Measured with a test-only server (not committed). It runs RoBERTa at once in a thread and the LLM within a **0.35 s service budget**. The verdict waits for both, or goes out with RoBERTa alone when the LLM misses the budget. ministral-3-8b made the budget on 300 of 300 lines; qwen3-32b on 279 of 300. Latency does not depend on the mix weight.

On reading the pairs column: 20 pairs is a small set. 18/20 has a Wilson 95% interval of [0.70, 0.97], and 8/20 has [0.22, 0.61]. The small LLMs are no better than the punch-length baseline on rJokes: their paired-bootstrap difference CIs run from about −0.2 up to at most +0.03. RoBERTa and the 0.7/0.3 mixes beat it by 0.16–0.35 (CIs exclude zero).

**Each dimension alone (rJokes ρ):**

| Model | punch | surprise |
|---|---|---|
| qwen3-32b | 0.022 | 0.021 |
| ministral-3-8b | −0.009 | −0.010 |
| ministral-3-14b | 0.018 | −0.019 |
| glm-4.7-flash | 0.031 | 0.045 |
| glm-5 | 0.264 | 0.223 |

`punch` alone is never worse than `score`. The small models compress their answers: 23–29 distinct scores across 1,000 jokes. qwen3-32b gives 66% of all jokes 0.66, 0.76 or 0.84.

**The weight 0.7.** The dev sample has jokes only, so its ρ only grows as the RoBERTa weight rises (from 0.26 at w = 0.5 to 0.39 at w = 1.0). We took w = 0.7 as the largest LLM share that keeps dev ρ within about 0.04 of RoBERTa alone. On the stand-up pairs, w = 0.6 / 0.7 / 0.8 / 0.9 / 1.0 gives 0.95 / 0.90 / 0.75 / 0.60 / 0.40 with ministral-3-8b. The trade is real, and w is the knob. The full grid is in `analyse.py`'s output under `exploratory_weights`.

**RoBERTa variants, all on the same 1,000 jokes.** Measured at batch size 1 with 4 threads, using the transformers tokeniser; "load" is the time to load the model and run one warm-up line.

| Variant | ρ | p50 / p90 / p99 ms | Load |
|---|---|---|---|
| PyTorch fp32 | 0.371 | 128 / 211 / 314 | 2.9 s |
| PyTorch dynamic int8 | 0.369 | 28 / 42 / 65 | 9.1 s |
| ONNX Runtime fp32 | 0.371 | 56 / 84 / 131 | 3.4 s |
| **ONNX Runtime dynamic int8** | **0.373** | **18 / 28 / 41** | **1.0 s** |

Quantisation costs no agreement.

`humor.py` itself (the `tokenizers` library, a fresh process, all 1,000 lines) at 1 / 2 / 4 / 8 threads:

| Threads | p50 ms | p90 ms | p99 ms |
|---|---|---|---|
| 1 | 42 | 68 | 121 |
| 2 | 24 | 37 | 56 |
| 4 | 26 | 43 | 68 |
| 8 | 40 | 138 | 317 |

8 threads oversubscribes a shared box. ρ = 0.374 in every case.

**Network.**
- Laptop → box: one TCP round trip is 26 ms at p50.
- TV → box `/ping`: fresh connection p50 173 / p90 197 ms; kept connection p50 34 / p90 43 ms.
- Laptop → box `/ping` through the tunnel, fresh connection: p50 65 ms.

So opening a connection through adb reverse and SSH, plus starting `nc` on the TV's Cortex-A55, costs about 140 ms per line. A pooled HTTP client on the TV avoids it.

**Prompt variants (dev sample, 300 jokes; ρ of `score`).** Two variants were tried:
- **anchors**: the current rubric plus anchor ranges, e.g. "a neat wordplay or a fair twist: 0.4–0.6".
- **critic**: a "tough booker" rubric with a 0.2 / 0.4 / 0.6 / 0.8 laugh ladder.

| Model | base | anchors | critic |
|---|---|---|---|
| qwen3-32b | 0.041 | 0.047 | 0.007 |
| ministral-3-8b | −0.038 | −0.006 | −0.031 |
| ministral-3-14b | 0.027 | −0.023 | −0.021 |
| glm-4.7-flash | 0.095 | 0.131 | 0.061 |
| glm-5 | 0.219 | 0.182 | 0.091 |

Neither raises agreement for every model; with n = 300 the CI half-width is about ±0.11. **No prompt change is proposed**, and none was run on the test sample.

**Throttling.** At 8 parallel requests, the account's per-model quota returned HTTP 429 for ministral-3-8b, ministral-3-14b and glm-4.7-flash, never for qwen3-32b. The batch scripts back off and retry. One TV sending one line every few seconds does not come near that.

## Decision

1. **By the rule as written**, the int8 ONNX RoBERTa wins. It has the best ρ (0.373 [0.32, 0.43]) among the judges with p90 ≤ 500 ms (279 ms fresh, 106 ms kept), and it beats every baseline by a clear margin.
   - The fast LLMs on their own (qwen3-32b, ministral-3-8b, ministral-3-14b, glm-4.7-flash) are **no better than chance** on rJokes: their CIs include 0, and they sit below the punch-length baseline. They are out.
   - glm-5 is the only LLM clearly better than chance (0.252), but its p90 is 1.1–1.5 s.
2. **RoBERTa fails our sanity check.** On our stand-up pairs it is at chance (8/20): it ranks Reddit jokes, but it can't tell a punch from the same idea said flat. A live set is mostly lines that are not jokes, so we don't recommend it alone.
3. **Recommended for stand-up: 0.7·RoBERTa + 0.3·ministral-3-8b**, each as its percentile, with the LLM within a 0.35 s service budget.
   - ρ is 0.339 [0.28, 0.39]: 0.16–0.31 above the punch-length baseline, close to RoBERTa alone.
   - It wins 0.90 of the stand-up pairs.
   - On the real path: p90 441 ms fresh, 270 ms kept, with the LLM in time on every line.
   - qwen3-32b in its place is equal within the CIs (0.349, 0.90), but slower: p90 463 / 393 ms, and late on 7% of lines at that budget.
   - When the LLM misses the budget, RoBERTa alone remains: it still ranks, but it can't spot a non-joke. Weighing that line less, or sending `judge-none`, is the engine's call.
4. **Poetry and speech** have no rated set, so the rule can't be applied there. Every LLM separates our strong and flat pairs (0.95–1.00, against 0.65 / 0.475 for Tier 1). The fastest is ministral-3-8b: p90 409 ms fresh, 243 ms kept. That is the only evidence, and it is our own.
5. **Budgets.** For p90 ≤ 500 ms from the TV, the LLM's service budget should be about 0.35 s with a fresh connection per line, or about 0.45 s with a pooled connection. The current default in `judge.py`, `MC_JUDGE_TIMEOUT_S` = 0.6, is too long for this target.

## Serving RoBERTa in the MC service (CPU)

`services/mc-agent/src/mc_agent/humor.py` is optional, lazy and **not wired into judge.py**. It is off unless `MC_HUMOR_MODEL_DIR` is set; `MC_HUMOR_THREADS` defaults to 2. Nothing on the default path imports it, which a test checks.

- **Dependencies:** an optional group, `uv sync --group humor` (`numpy`, `onnxruntime` 1.31, `tokenizers` 0.23). It adds nothing to the default install.
- **Model files:** `model.int8.onnx` (357 MB) and `tokenizer.json` (3.6 MB). Build them once with `run_roberta.py --variant onnx-int8`: a TorchScript ONNX export (opset 17) of the 1.42 GB checkpoint, then onnxruntime's dynamic QInt8 quantisation. torch and transformers are needed only for that build step, not for serving. Ship the files in the image or fetch them from S3 at boot.
- **Cost:**
  - Load: about 1 s.
  - Memory: about 660 MB resident once loaded, about 720–740 MB after 1,000 lines.
  - Speed on c7i: 24 ms p50 / 37 ms p90 per line at 2 threads (42 / 68 ms at 1 thread). Inside the service it measured 41 ms p50 and 62 ms p90.
- **Score:** `score` is the raw output's percentile among 300 held-out dev jokes (`QUANTILES`, a monotone map, so the ranking is unchanged). 0.5 means a typical Reddit joke, not a "mild smile".
- **Input:** the last two earlier lines plus the line. Truncation drops the start of the setup, never the punch.
- **Tests:** `tests/test_humor.py`. The model test skips without the dependencies and the model directory; it passed on the box with both.

## Caveats

- **Upvotes are a noisy proxy for a live laugh.** They reflect one subreddit's taste, the posting time and virality, and they are read, not heard. Even the best judge reaches ρ ≈ 0.37–0.39. Delivery, timing and the room are not in the data at all; the engine measures those itself.
- **The sanity pairs are ours**: 20 per act, written and labelled by us, with wide intervals. They test only whether a judge separates a clear strong line from a clear flat one. They are not a funniness scale.
- RoBERTa is a stand-up model. It was trained on jokes only, which is why it ranks jokes but can't spot a non-joke.
- **How latency was measured:**
  - From the TV's shell, not the TV app.
  - The fresh-connection numbers include starting `nc` on the TV and opening a connection through adb reverse and SSH.
  - The kept numbers stamp the end of the response headers; the small body arrives in the same burst.
  - On the box this was the MC service in-process, with no AgentCore in between. AgentCore would add its own hop.
  - The box was shared with other jobs (load average up to about 5).
- Each LLM verdict was one temperature-0 call. Run-to-run variance and other regions were not measured.

## Reproduce (on the build box, `~/judge`)

```bash
python make_sample.py ~/judge/data/rJokesData/data ~/judge/data/sample.jsonl --n 1000          # + --split dev --n 300
cd ~/judge/mc-agent && MC_WARM=0 uv run python ~/judge/calib/run_llm.py --model <id> --rjokes ~/judge/data/sample.jsonl --out ~/judge/work/llm/<id>.rjokes.base.jsonl --timeout 5 --workers 4
#   … --sanity ~/judge/calib/sanity_pairs.json --out ~/judge/work/llm/<id>.sanity.base.jsonl
~/judge/calib-venv/bin/python run_roberta.py --variant onnx-int8 --threads 4 --model ~/judge/models/humor-roberta-large --rjokes … --sanity … --out ~/judge/work/roberta/onnx-int8.t4.jsonl
~/judge/calib-venv/bin/python analyse.py ~/judge/data/sample.jsonl sanity_pairs.json ~/judge/work   # the tables above (Tier 1 from packages/crowd tools/tier1-score.ts)
# Real path: on the box, MC_JUDGE_MODEL_ID=<id> MC_JUDGE_TIMEOUT_S=5 PORT=8097 uv run python -m mc_agent.app;
# on the laptop, ssh -N -L 18097:127.0.0.1:8097 (encore-box.sh's options), adb reverse tcp:18097 tcp:18097;
# adb push tv_lat.sh / tv_lat_ka.sh and a file of JSON bodies, then: adb shell sh /data/local/tmp/tv_lat.sh BODIES OUT; python3 latency.py DIR
```

## What shipped (2026-10-12)

The recommendation above is live in `services/mc-agent/src/mc_agent/judge.py` and on the TV:

- **Stand-up**: `score = 0.7 × RoBERTa percentile + 0.3 × LLM percentile`, the LLM being `mistral.ministral-3-8b-instruct` within `MC_JUDGE_TIMEOUT_S` = 0.35 s while the humour model runs alongside it.
  - When the LLM misses, its share counts as a typical joke (0.5), so the humour model alone can lift a line only a little.
  - Without the humour model installed (no `MC_HUMOR_MODEL_DIR`, or no `humor` dependency group) the score is the LLM's percentile alone.
  - Both maps come from the **dev** sample: RoBERTa's from `humor.QUANTILES`, the LLM's from `judge.LLM_PERCENTILES` (mid-rank of its few distinct scores).
  - With these maps the test sample gives ρ = 0.341 (n = 1,000) and the stand-up pairs 17/20 (0.85). The 0.90 above used the test sample's own percentiles.
- **Poetry and speech**: the LLM's rubric mean on its own 0..1 scale.
- **The floor** (`JUDGE_FLOOR` in `packages/crowd/src/content.ts`, where the estimate starts to add to a line's score):
  - Stand-up 0.70 on the percentile scale. A typical dev joke scores 0.49 (p60 0.57, p70 0.64, p80 0.71).
  - At 0.70 about the top fifth of Reddit jokes count, and on the stand-up pairs 10 of 20 strong lines but only 1 of 20 flat ones. At 0.60 it would be 14 strong and 7 flat; at 0.50, 18 and 12.
  - Content only adds to a score, so the floor favours precision.
  - Poetry and speech keep 0.5, the rubric's middle.
- **End to end on the build box** (one kept connection, a client on the box, the sanity lines sent one after another, 80 per act; verdict time):

  | Act | p50 | p90 | p99 | Answered in time |
  |---|---|---|---|---|
  | Stand-up | 148 ms | 183 ms | 238 ms | both models, 80 of 80 |
  | Poetry | 177 ms | 219 ms | 295 ms | the LLM, 80 of 80 |
  | Speech | 184 ms | 222 ms | 245 ms | the LLM, 80 of 80 |

  The TV path adds the adb-reverse and SSH hops measured above (about 30 ms on a kept connection, about 140 ms on a fresh one).

