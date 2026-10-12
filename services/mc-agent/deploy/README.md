# The MC on Amazon Bedrock AgentCore Runtime

The MC service is set up to run as an AgentCore Runtime agent named `encore_mc` in **ap-south-1**, the same region as GLM-5 (Bedrock's OpenAI-compatible endpoint) and Polly's neural voices. It ships as a **direct code deployment**: a zip of arm64 wheels on S3, made with plain AWS CLI calls. There is no Docker, ECR, CodeBuild or CDK. The TV never holds AWS keys: it keeps calling a local MC service, which forwards each request to the runtime and signs it with its own host's credentials.

```
TV  ──HTTP, no AWS keys──▶  MC service, MC_BACKEND=agentcore      laptop :8080 (Google TV through adb reverse), or a box
                               │ InvokeAgentRuntime, SigV4 with the host's credentials (aws login, or the box's instance role)
                               ▼
                            AgentCore Runtime encore_mc            ap-south-1, one microVM per TV session
                               │ the same mc_agent code with MC_BACKEND=local and the execution role encore-mc-runtime-role
                               ▼
                            GLM-5 (bedrock-mantle, ap-south-1); Amazon Polly for the voice (voice.py: the runtime signs
                            SynthesizeSpeech URLs and the TV streams the MP3 from Polly)
```

## Status (2026-10-11)

| Step | State |
|---|---|
| Forwarding mode (`src/mc_agent/forward.py`, `MC_BACKEND=agentcore` in `app.py`) and 76 offline tests (`tests/test_forward.py`) | done; they pass on the build box |
| Code bucket `bedrock-agentcore-code-911167912118-ap-south-1` (private, versioned, old builds expire after 30 days, newest five kept) | created |
| Zip built on the box and uploaded: `encore-mc/encore-mc.zip`, S3 version `dpC_2dfeuj0ekk1oZbJR02i9cSPo_YRv`, sha256 `663e36a2…eeeffd`, 35.8 MB (82.9 MB unzipped, 7,348 files). It proves the packaging, but it predates the voice's move to presigned Polly URLs, so **rebuild at deploy time** (step 3) | done |
| The same layout built for x86 and booted on the box (`python3 main.py`, 0.0.0.0:8080): `/ping` healthy, every kind answered with real GLM-5 and all four voices | done |
| Execution role `encore-mc-runtime-role` (IAM) | **waiting**: the coding agent's permission gate stops IAM changes, so the account owner runs step 1 |
| The forwarder against the real AgentCore data plane, with a runtime ARN that doesn't exist yet. Laptop: `ResourceNotFoundException`, shown as `unreachable` (0.24 s on a new connection, 0.07 s reused). Box: `AccessDeniedException` (no invoke policy yet), shown as `no-credentials` (0.05 s, then 0.03 s) | done |
| CloudWatch Transaction Search in ap-south-1 (resource policy `EncoreTransactionSearch`, X-Ray destination `CloudWatchLogs`, 100 % indexing) | done |
| Runtime create, MMDSv2 update, smoke test, forwarders, latency through AgentCore, the runtime's trace delivery | after step 1 |

## Files

| File | What it is |
|---|---|
| `main.py` | The zip's entry file. It runs `serve(host="0.0.0.0", port=8080)`, which the runtime contract requires (`BedrockAgentCoreApp.run()` binds 127.0.0.1 outside Docker). It refuses `MC_BACKEND=agentcore`, because a runtime that forwards would only call itself. |
| `build.sh` | Builds the zip on the build box: `uv export --frozen --no-dev`, then `uv pip install --no-deps --target … --python-platform aarch64-manylinux2014 --python-version 3.12 --only-binary :all:`, plus `mc_agent/` and `main.py` at the root. It strips `bin/` and `__pycache__`, rejects any `.so` that isn't arm64, sets modes 644/755 and writes `~/encore-mc-build/encore-mc.zip`. `--bytecode` adds unchecked-hash `.pyc` files; `--host` builds the same layout for the box itself, to boot it before a deploy. |
| `agentcore.sh` | The control-plane steps as AWS CLI calls: `role`, `bucket`, `upload`, `create`, `update`, `wait`, `status`, `arn`, `versions`, `zips`, `logs`, `retention`, `tracing`, `delete`. Run it on the laptop; the box's role has no IAM, S3 or AgentCore control-plane rights. |
| `runtime.json`, `render.py` | The runtime's configuration: the zip, `PYTHON_3_12`, `["main.py"]`, the role, `PUBLIC` network, the `HTTP` protocol, sessions idle out after 3600 s with an 8 h lifetime, `MC_BACKEND=local` and `MC_REGION=ap-south-1` (the model, budgets and voices come from the code in the zip, so the runtime can't drift from it) and `platformVersion: "V2"`. `render.py` fills in the zip's S3 version. An update resends everything and adds `metadataConfiguration.requireMMDSV2`, which CreateAgentRuntime can't set. |
| `smoke.py` | One call per kind, printing the MC's words, the voice and the time; `direct` calls AgentCore with boto3, `http` calls a running service. |
| `bench.py` | The latency table: local service against forwarder→AgentCore, warm and first call, per kind. |
| `iam/runtime-trust.json`, `iam/runtime-policy.json` | The execution role: trusted by `bedrock-agentcore.amazonaws.com` for this account and region only. It may write the runtime's logs, traces and metrics, call `bedrock-mantle:CreateInference` and `bedrock:InvokeModel*`, and use Polly. `polly:SynthesizeSpeech` also covers the presigned voice URLs, because Polly authorizes the TV's fetch as this role. If `MC_VOICE_SIGNER_ROLE_ARN` is set, the role also needs `sts:AssumeRole` on that signer role, and the signer role must trust it. It has no S3 statement: the identity that calls Create/UpdateAgentRuntime reads the zip. |
| `iam/forwarder-policy.json` | For `encore-box-role`: `InvokeAgentRuntime` and `StopRuntimeSession` on `encore_mc-*` only, and an explicit deny on `InvokeAgentRuntimeForUser`. The laptop's own login needs nothing extra. |
| `iam/xray-spans-logs-policy.json` | The CloudWatch Logs resource policy for Transaction Search (X-Ray writes spans to `aws/spans` and the runtime's log groups). |

## Deploy, first time

Run from `services/mc-agent` on the laptop, signed in with `aws login`.

```bash
# 1. The execution role (IAM; the account owner runs these two commands).
aws iam create-role --role-name encore-mc-runtime-role --assume-role-policy-document file://deploy/iam/runtime-trust.json \
  --description "Encore MC on Bedrock AgentCore Runtime (model, voice, logs, traces)" --tags Key=project,Value=encore
aws iam put-role-policy --role-name encore-mc-runtime-role --policy-name encore-mc-runtime \
  --policy-document file://deploy/iam/runtime-policy.json
#    (the same as: deploy/agentcore.sh role)

# 2. The code bucket: done on 2026-10-11 (deploy/agentcore.sh bucket on a new account).

# 3. Build on the box from the commit the TV and forwarders run, fetch, upload (the forwarder checks answers against its
#    own models, so build the runtime from the same commit).
#    Version dpC_2dfeuj0ekk1oZbJR02i9cSPo_YRv is already in S3 but predates the voice change, so rebuild.
~/.cache/encore-box.sh up && ~/.cache/encore-box.sh ssh 'cd ~/strumble/services/mc-agent && bash deploy/build.sh'
~/.cache/encore-box.sh get encore-mc-build/encore-mc.zip /tmp/encore-mc.zip
V=$(deploy/agentcore.sh upload /tmp/encore-mc.zip); echo $V

# 4. Create the runtime, then turn on MMDSv2 with a full update (create can't set it; invocations need it).
deploy/agentcore.sh create $V       # if it rejects "platformVersion": "V2", delete that line from runtime.json and rerun
deploy/agentcore.sh wait
deploy/agentcore.sh update $V
deploy/agentcore.sh wait && deploy/agentcore.sh status     # expect READY, mmds {"requireMMDSV2": true}

# 5. Prove it: one call per kind, with real Bedrock and Polly calls inside the runtime.
export MC_AGENTCORE_ARN=$(deploy/agentcore.sh arn)
uv run python deploy/smoke.py direct line-intro line-between debrief chat --save /tmp/encore-mc-audio
deploy/agentcore.sh logs 15m
deploy/agentcore.sh retention 14     # the log group exists once the runtime has run
deploy/agentcore.sh tracing          # its spans to X-Ray (Transaction Search is already on in ap-south-1)
```

`create` runs `aws bedrock-agentcore-control create-agent-runtime --region ap-south-1 --cli-input-json file://<render.py create $V>`, and `update` runs `update-agent-runtime` with `render.py update $V <runtime id>`.

## The forwarders (how the TV reaches it)

The TV keeps calling `POST /invocations` on a local MC service. With `MC_BACKEND=agentcore`, that service:
- validates the request itself, so an invalid one never leaves the machine;
- forwards it unchanged with one long-lived boto3 client (connect timeout 2 s, read timeout 9 s, one retry in standard mode; 409 "session operation in progress" is retryable);
- passes the runtime's answer back **byte for byte** when it is exactly one contract answer for that kind. Anything else, and every failure, becomes `{"unavailable": {reason, "detail": "AgentCore: …"}}`.

```bash
# Laptop, for the Google TV (adb reverse tcp:18080 tcp:8080 as before). Agents test on PORT=8091 first.
MC_BACKEND=agentcore MC_AGENTCORE_ARN=$MC_AGENTCORE_ARN PORT=8091 uv run python -m mc_agent.app
uv run python deploy/smoke.py http --url http://127.0.0.1:8091 line-intro debrief chat

# Build box: once, the account owner allows the box role to invoke (IAM):
aws iam put-role-policy --role-name encore-box-role --policy-name encore-mc-invoke \
  --policy-document file://deploy/iam/forwarder-policy.json
# then (8091 and 8082 are often taken there by other agents; use a free port):
~/.cache/encore-box.sh ssh "cd ~/strumble/services/mc-agent && MC_BACKEND=agentcore MC_AGENTCORE_ARN=$MC_AGENTCORE_ARN PORT=8094 \
  nohup ~/.local/bin/uv run python -m mc_agent.app > ~/mc-forwarder.log 2>&1 &"

# Vega box (only when the recording there allows it): the same policy covers it, because all three boxes use encore-box-role.
# Switch its :8080 MC to MC_BACKEND=agentcore; the VVD keeps calling 10.0.2.2:8080.
```

| Variable | Default | Meaning |
|---|---|---|
| `MC_BACKEND` | `local` | `agentcore` turns on forwarding. Any other value, or a missing or malformed ARN, stops the service at start. |
| `MC_AGENTCORE_ARN` | (required) | `arn:aws:bedrock-agentcore:ap-south-1:911167912118:runtime/encore_mc-…`; the client signs for the ARN's region |
| `MC_AGENTCORE_QUALIFIER` | `DEFAULT` | the endpoint (DEFAULT follows the latest version) |
| `MC_AGENTCORE_SESSION` | random per process | 33–256 of `[A-Za-z0-9-]`. A given session is never stopped on exit, because it may be shared. |
| `MC_AGENTCORE_KEEPWARM_S` | `300` | warm the session at start and when idle this long; `0` = off |
| `MC_FORWARD_GRACE_S` | `0.6` | how long past the budget to wait for AgentCore; must stay below the TV's 0.75 |
| `MC_TIMEOUT_S`, `MC_LINE_TIMEOUT_S` | `8`, `3.5` | the same budgets as the local MC |

**Sessions.** Each forwarder process (one per TV) takes the session `encore-tv-<host>-<32 hex>`. It is random and never holds a performer's name, because session ids show up in AgentCore's logs and spans. Every new session id means a new microVM (a cold start), so the id is never per request. Performers on one TV share that TV's microVM. That is safe because the MC keeps nothing between requests: a fresh agent each time, with the memory sent in the payload. The forwarder warms the session at start and after 300 s idle, with `{"kind": "keep-warm"}`, which the runtime answers with `invalid-request` and no model call. On exit, it stops its own session.

**Timeouts.** The runtime enforces the MC's budget and normally answers first. The forwarder gives up 0.6 s later, and the TV 0.75 s later, so a slow call reads "timed out" on the TV, not "unreachable".

| Kind | Runtime budget | Forwarder cutoff | TV deadline |
|---|---|---|---|
| line | 3.5 s | 4.1 s | 4.25 s |
| debrief, chat | 8 s | 8.6 s | 8.75 s |

**Failures, as the TV sees them.** Known error codes decide first; the HTTP status decides only for unknown codes. The troubleshooting guide says a runtime that fails to start returns RuntimeClientError with a 403, and that is the MC failing, not a sign-in problem.

| Failure | TV reason |
|---|---|
| no answer by the cutoff; `ReadTimeoutError`, `ConnectTimeoutError` | `timeout` |
| `EndpointConnectionError`, `ConnectionClosedError`, `SSLError`, a broken response stream | `unreachable` |
| `ResourceNotFound` 404, `Throttling` 429, `ServiceQuotaExceeded` 402, `RetryableConflict` 409 after the retry, 5xx | `unreachable` |
| `RuntimeClientError` (424, or 403 when the runtime failed to start), `ValidationException` 400 (for example "not MMDSv2-enabled") | `model-error` |
| a body that is not exactly one contract answer for the kind | `model-error` |
| no, expired or invalid credentials (`NoCredentialsError`, `TokenRetrievalError`, `ExpiredToken`, `UnrecognizedClient`, `InvalidSignature`, …) or `AccessDenied` (this host may not invoke) | `no-credentials` |

## Update, roll back, delete

```bash
# Update: build and upload as in step 3, then a new runtime version (the DEFAULT endpoint follows it):
deploy/agentcore.sh update $V && deploy/agentcore.sh wait && deploy/agentcore.sh versions
# Sessions keep the code they started with: restart the forwarders (each start takes a new session).

# Roll back the TV at once, with no AWS call: restart its MC service with MC_BACKEND=local (or unset).
# Roll back the runtime's code: pick an older zip and make it the latest version.
deploy/agentcore.sh zips
deploy/agentcore.sh update <older S3 version id> && deploy/agentcore.sh wait

# Delete the runtime (its sessions end; the bucket, the zips and the role stay):
deploy/agentcore.sh delete
# Remove the rest too:
aws iam delete-role-policy --role-name encore-box-role --policy-name encore-mc-invoke
aws iam delete-role-policy --role-name encore-mc-runtime-role --policy-name encore-mc-runtime
aws iam delete-role --role-name encore-mc-runtime-role
# The bucket is versioned: empty it in the S3 console (Empty), then
aws s3api delete-bucket --bucket bedrock-agentcore-code-911167912118-ap-south-1
```

## Observability

- **Without any setup:**
  - Metrics in CloudWatch under `AWS/Bedrock-AgentCore`: Invocations, Latency, Throttles, SystemErrors, UserErrors, SessionCount and others.
  - The runtime's stdout and stderr in the log group `/aws/bedrock-agentcore/runtimes/<runtime id>-DEFAULT` (`agentcore.sh logs`). Our `mc_agent` lines are there: model time and tokens, guard rejections, the voice and its time, and unavailable reasons.
  - The forwarder logs a trace id with every call (`trace Root=1-…`), so a failure on the TV can be found in CloudWatch.
- **Traces:** AgentCore's own spans per invocation and session need CloudWatch Transaction Search, which is account-wide. **It was turned on for ap-south-1 on 2026-10-11**: the resource policy `EncoreTransactionSearch`, the X-Ray destination `CloudWatchLogs` and 100 % indexing. Before that, the destination was `XRay` and the indexing rule 0 %. What remains is the runtime's own delivery, once it exists (`deploy/agentcore.sh tracing`). For a new account:

  ```bash
  aws logs put-resource-policy --region ap-south-1 --policy-name EncoreTransactionSearch \
    --policy-document file://deploy/iam/xray-spans-logs-policy.json
  aws xray update-trace-segment-destination --region ap-south-1 --destination CloudWatchLogs
  aws xray update-indexing-rule --region ap-south-1 --name Default --rule '{"Probabilistic":{"DesiredSamplingPercentage":100}}'
  aws xray get-trace-segment-destination --region ap-south-1     # expect CloudWatchLogs, ACTIVE (spans take about 10 min)
  deploy/agentcore.sh tracing    # the runtime's TRACES delivery to X-Ray, the console's Tracing toggle
  ```

  Then look in CloudWatch → GenAI Observability → Bedrock AgentCore (`https://console.aws.amazon.com/cloudwatch/home?region=ap-south-1#gen-ai-observability`), or search spans under Application Signals → Transaction Search.
- **Spans from inside the MC** (Strands agent, model call with tokens, Polly) need the ADOT SDK (`aws-opentelemetry-distro`) in the zip and `entryPoint: ["opentelemetry-instrument", "main.py"]`. This is not done: the current ADOT release pins OpenTelemetry 1.44, and uv resolves dependency groups together, so it would downgrade the OpenTelemetry that the whole service is tested with.
- **Privacy:** don't turn on the runtime's APPLICATION_LOGS delivery or log request bodies. Payloads carry performer names, and their words when words are on. Keep log retention short (`agentcore.sh retention 14`).

## Latency

Measured from the build box (ap-south-1, c7i.2xlarge) with `deploy/bench.py`, 5 runs each, `speak: true`. This is wall time as the TV sees it, to the full body, on 2026-10-11 at load average 0.1–3.8. The voice then was a base64 MP3 that Polly made inside the budget (premium in us-east-1 for the debrief and chat). It has since moved to presigned URLs that take about 1 ms, so these local numbers will drop: rerun `bench.py` for both columns.

| Kind | Local MC, warm: median / max | Local MC, first call after start | Forwarder → AgentCore, warm | AgentCore, first call (cold microVM) |
|---|---|---|---|---|
| line/intro (Kajal, neural) | 0.76 / 1.87 s | 1.31 / 1.85 s | not measured yet | not measured yet |
| line/between (Brian, neural) | 0.93 / 2.09 s | 1.88 / 1.90 s | not measured yet | not measured yet |
| debrief (Stephen, generative in us-east-1) | 2.42 / 3.75 s | 4.03 / 4.70 s | not measured yet | not measured yet |
| chat (Gregory, long-form in us-east-1) | 4.13 / 6.96 s | 5.39 / 6.40 s | not measured yet | not measured yet |

After the runtime exists and the box may invoke it:

```bash
~/.cache/encore-box.sh ssh "cd ~/strumble/services/mc-agent && ~/.local/bin/uv run python deploy/bench.py --arn $MC_AGENTCORE_ARN --warm --first --parallel"
```

## The content judge's humour model (stand-up, CPU, optional)

`kind: judge` for stand-up mixes a CPU humour model with the fast LLM (0.7 / 0.3 on a percentile scale; why and how well: `docs/judge-calibration.md`). The model is `iamahmadyasin/humor-roberta-large` (MIT licence, as is its base `roberta-large`), exported to ONNX and quantised to int8: `model.int8.onnx` (about 357 MB) plus `tokenizer.json`. The files are never committed (`.gitignore` covers `services/mc-agent/models/` and `*.onnx`); on the build box they live in `~/models/humor-int8`, outside `~/strumble`, so `encore-box.sh up` (an rsync with `--delete`) can't remove them. Without them, or without the `humor` dependency group, the judge runs the LLM alone and stand-up's score is the LLM's percentile.

Fetch and build once on a box (torch and transformers are needed only here, never for serving):

```bash
python3 -m venv ~/judge/calib-venv
~/judge/calib-venv/bin/pip install -q torch --index-url https://download.pytorch.org/whl/cpu
~/judge/calib-venv/bin/pip install -q transformers onnx onnxruntime huggingface_hub
~/judge/calib-venv/bin/hf download iamahmadyasin/humor-roberta-large --local-dir ~/judge/models/humor-roberta-large
cd ~/strumble/services/mc-agent/deploy/calibrate && ~/judge/calib-venv/bin/python -c \
  "from pathlib import Path; from run_roberta import onnx_path; print(onnx_path(Path('~/judge/models/humor-roberta-large').expanduser(), True))"
mkdir -p ~/models/humor-int8 && cp ~/judge/models/humor-roberta-large-onnx/model.int8.onnx ~/judge/models/humor-roberta-large/tokenizer.json ~/models/humor-int8/
```

Serve it (the deps are an optional group; `uv run` keeps them once installed):

```bash
cd ~/strumble/services/mc-agent && ~/.local/bin/uv sync --group humor
MC_HUMOR_MODEL_DIR=~/models/humor-int8 ~/.local/bin/uv run python -m mc_agent.app   # logs "judge: humour model loaded"
```

It loads in about 1 s at boot, holds about 0.7 GB resident and scores a line in about 25–60 ms on 2 threads (`MC_HUMOR_THREADS`). For the AgentCore runtime, add the `humor` group to the build and either bake the two files into the image or fetch them from S3 at start, then set `MC_HUMOR_MODEL_DIR`. Measured end to end on the build box (2026-10-12, one kept connection, sequential lines): stand-up ensemble p50 148 / p90 183 / p99 238 ms; poetry and speech (LLM only) p90 219 and 222 ms.

## Cost

AgentCore Runtime bills per second for the CPU and memory a session uses. Version 1 costs $0.0895 per vCPU-hour and $0.00945 per GB-hour; V2 costs $0.1276 and $0.0169. CPU is free while the MC waits on the model or Polly. A session bills from microVM readiness until it ends, idle time included (memory minimum 128 MB). There is no per-request charge ([pricing](https://aws.amazon.com/bedrock/agentcore/pricing/)). One warm session per TV is cents a day.

## Troubleshooting

- `ValidationException … not MMDSv2-enabled`: run `deploy/agentcore.sh update <current S3 version>` (TV: `model-error`).
- `RuntimeClientError`: the MC process failed or didn't start. Check `deploy/agentcore.sh logs`, then `deploy/agentcore.sh status` for `failureReason`.
- `AccessDeniedException` (TV: "no AWS sign-in"): the box role lacks `encore-mc-invoke`, or the laptop's `aws login` expired.
- Old behaviour after an update: the session predates it. Restart the forwarder.
- A slow first line after the forwarder starts: the session's microVM was cold. The forwarder warms it at start, and a miss is an honest `timeout` (the card stays silent).

## Production (described, not built)

A runtime accepts either SigV4 or JWT callers. For TVs in homes, a second runtime from the same zip would take a `customJWTAuthorizer` (a Cognito user pool, the TV's public app client in `allowedClients`). The phone, already paired by QR code, would hand the TV a refresh token over the relay. The TV would then call `POST https://bedrock-agentcore.ap-south-1.amazonaws.com/runtimes/<url-encoded ARN>/invocations?qualifier=DEFAULT` with `Authorization: Bearer …` and its session header, with no AWS credentials. That needs a change to `useMc.ts` and waits for the go-ahead on the full deployment.
