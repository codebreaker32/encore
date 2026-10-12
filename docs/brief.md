# Brief: Build, Ship, Shape: Amazon Developer Hackathon

Source: https://amazonappdev2026.devpost.com (overview, /rules, /resources), read 2026-10-06.

## Key facts

| Item | Value |
|---|---|
| Organiser | Amazon Developer (sponsor), Devpost (administrator) |
| Submission window | 2026-08-31 10:15 PT → **2026-10-23 12:00 PT** (= 2026-10-24 00:30 IST) |
| AWS credits ($150) | Codes ran out 2026-10-07 (resources page update); the user already has theirs |
| Judging | 2026-11-09 → 2026-11-20 |
| Winners announced | ~2026-12-03 |
| Registrants (2026-10-06) | 47,337 |
| Finale / live pitch | None. Judging is based on the Devpost submission only. Judges may not run the project, so the video, description and images carry the score. |
| Team | [Team name] · [Members] |

## Deliverables (copied from the rules)

- [ ] "Include a Project built with the required developer tools and meets the above Project Requirements."
- [ ] "Include a text description that should explain the features and functionality of your Project."
- [ ] "Provide a URL to your code repository for judging and testing on GitHub. The repository must contain all necessary source code, assets, and instructions required for the project to be functional."
- [ ] Repo is "either public and open source by including an open source license file OR private and shared with testing@devpost.com and the Amazon team". Public licence must be "detectable and visible at the top of the repository page (in the About section)". Private repo collaborators: chris-trag, knmeiss, giolaq, anishamalde, mosesroth, emersonsklar. Invitations expire after 7 days, so add them at submission time.
- [ ] Alexa+/Bee/Ring: "The repository must demonstrate use of your track's required technology at runtime in your code — imported and actually called … not just named in the README."
- [ ] Fire TV: "The demo video must show the project running on an actual Fire TV device or the Fire TV/Vega simulator."
- [ ] Demo video: "less than three (3) minutes", "shows the Project functioning on the device for which it was built", public on YouTube or Vimeo, English, no third-party trademarks or copyrighted music without permission.
- [ ] Product feedback for **each** tool/API/SDK: what we used and for what; what worked well; what needs work; onboarding (zero to hello world); would we build with it again (Yes/No and why). AWS Builder: name the AWS services used and how.
- [ ] Primary track and mini challenge(s) selected.
- [ ] Open Source mini challenge: contribution URL, project repo URL, GitHub username, description (what, how, why it matters).
- [ ] Optional: feature requests (description, why it matters, Critical / Important / Nice-to-have).
- [ ] Optional, **worth up to +10%**: friction log entries (task attempted, steps taken, expected vs actual, severity, workaround, actionable suggestion). Keep `docs/friction-log.md` from day 1.
- [ ] Setup and run instructions in the repo ("Functionality" rule).

## Tracks

Choose one primary track. A project can win one track prize plus one mini-challenge prize.

| Track | Requirement | Priority categories | Prizes |
|---|---|---|---|
| Fire TV | Demo-ready app on Fire OS or Vega OS; any framework | AI-enhanced viewing, sports, fitness, family entertainment, multi-modal UX, computer vision | $25k + $15k AWS + meeting / $15k + $5k / $4k + $1k |
| Alexa+ | Self-hosted MCP server (spec ≥ 2025-11-25, Streamable HTTP) or Agent Skill; or a simulated Alexa+ web app | — | $25k + $15k AWS + meeting / $15k + $5k / $4k + $1k |
| Bee | Real data from a Bee device or Apple Watch running Bee, via Bee CLI/MCP/Agent Skills, shown live | education, developer experience, personal productivity | $12k + meeting / $8k |
| Ring | Ring APIs/SDKs/simulators/devices; shown via simulator or device; no device required | access control, business systems, IoT home automation, accessibility, caretaking | $12k + meeting / $8k |
| Mini: AWS Builder | AWS services with documented integration (Bedrock, AgentCore, Strands, Kiro, SageMaker). Kiro alone qualifies | — | $5k + $5k AWS + meeting |
| Mini: Open Source | New OSS project or PR/fork to a public repo during the window | — | $5k + $5k AWS + meeting |

## Rubric

Stage 1 is pass/fail: the project fits the theme and reasonably applies the required APIs/SDKs. The friction-log bonus (up to 10%) is assessed here.

Stage 2 weights the four criteria **equally**. Tie-breaks follow this order:

1. **Tech Implementation**: "How well is the project built, and how effectively does it use the required tech? Does it effectively leverage the required APIs, SDKs, or device capabilities for the specified track or mini-challenge?"
2. **Design**: "Does the project deliver a complete, coherent product experience? Is the interaction model intuitive and well-considered for the target device or platform?"
3. **Potential Impact**: "Does the project make a credible, specific case for solving customer needs? Could it realistically serve an audience beyond the hackathon?" (Examples: Fire TV Appstore, Ring Appstore)
4. **Quality of the Idea**: "Is this a creative, imaginative use of the required tools? Does the team demonstrate a genuine understanding of the developer ecosystem and the end-user needs within their chosen track?"

### Judges' "obvious vs creative" guidance (verbatim)

- **Fire TV**: Obvious: basic streaming UI, simple video player, remote-controlled game. Creative: AI-enhanced viewing that adapts to household patterns, computer vision fitness app using the TV camera, multi-modal UX combining voice + D-pad + visual in a single flow.
- **Alexa+**: Obvious: single-turn Q&A bot, basic MCP wrapper around an existing API. Creative: agentic workflow that orchestrates across services autonomously, context-aware add-on that maintains state across sessions, purchasing capabilities, media support (cards, carousels, etc), MCP Apps, Agent Skills.
- **Bee**: Obvious: simple notification relay, basic data logging from wearable to phone. Creative: cross-device orchestration (Bee + Echo + Fire TV working together), ambient context capture that informs a productivity workflow, novel education use case leveraging Agent Skills for on-wrist coaching, advance use of the facts and insights capabilities of the product and developer tools, real time functionality, self improvement workflows, synced insights for meetings across teams.
- **Ring**: Obvious: motion detection alert, basic doorbell live view. Creative: non-security use case (accessibility aid, care-taking monitoring, package/delivery management), business system integration (access control for commercial spaces), multi-camera pipeline, event-based triggers for app functionality.
- **AWS Builder**: Obvious: single Bedrock call for text generation, S3 for storage. Creative: multi-service pipeline (Bedrock + AgentCore + Strands), agentic architecture with Claude/Kiro for development workflow, agent orchestration patterns.
- **Open Source**: Obvious: README update, typo fix, minor formatting. Creative: meaningful feature addition with tests, bug fix that unblocks other developers, new integration pattern (e.g., adding Vega support to a popular React Native library).

## Rules that constrain the build

- The project must be new, or significantly updated during the window (explain what changed).
- Third-party SDKs, APIs and data must be used within their licences. OSS use is allowed if we build on top of it.
- No third-party trademarks or copyrighted music or footage in the video without permission.
- All materials in English.
- The project must stay free for judges to test until 2026-11-20. Include login credentials if any site is private.
- The sponsor may ask for physical access to hardware used in wearable or proprietary-device projects.
- Multiple submissions are allowed if they are substantially different.
- Excluded jurisdictions include Brazil, Quebec, Russia, Crimea, Cuba, Iran and North Korea.

## Resources

- Amazon Devices Builder Tools (MCP and Agent Skills for coding assistants): https://developer.amazon.com/docs/vega/0.24/mcp-server
- Samples: https://github.com/AmazonAppDev (react-native-multi-tv-app-sample, vega-video-sample, vega-sports-app, vega-tv-interfaces-sample, hello-world-fire-tv, ring-api-helloworld)
- Bee: https://docs.bee.computer · https://github.com/bee-computer/bee-cli · https://github.com/bee-computer/bee-skill
- Ring: https://developer.amazon.com/docs/ring/api-documentation.html · https://ring.com/appstore
- MCP Streamable HTTP: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#streamable-http · MCP Apps: https://modelcontextprotocol.io/extensions/apps/overview
- AWS Builder Center: https://builder.aws.com
- Questions: janet@devpost.com

## Re-read 2026-10-11 (resources, Updates, FAQs)

- **Resources "start here": Amazon Devices Builder Tools** (an MCP server plus Agent Skills for AI coding assistants: docs search, Perfetto trace analysis, hot functions, crash symbolication, guided workflows). Now installed; see CLAUDE.md. Fire TV starter samples worth reading for specific problems: `vega-video-sample` (W3C media player, focus), `vega-audio-sample` (an audio player), `vega-tv-interfaces-sample` (focus, i18n, scrolling patterns). The Callstack e-book "The Ultimate Guide to React Native TV Development" is optional.
- **FAQ:** Fire TV can be shown on an emulator: "Android TV Emulator or the Fire TV/Vega simulator is fine — a physical device isn't required at any stage of submission or judging." The repo must be on GitHub (not GitLab). Private repos need the reviewers knmeiss, giolaq, anishamalde, mosesroth and emersonsklar, plus Devpost's tester, invited near submission, since invites expire in 7 days. Licensed or CC media in the video is fine if brief, attributed and secondary (check with the organisers). Judging runs 2026-11-09 to 11-20; don't keep AWS resources running until then.
- **Updates:** "Strong Submission Tips": product feedback is a required, weighted part of every submission. Be specific per tool: what it was used for, what worked, what needs work, onboarding, and would you build with it again. Office hours #2: Mon 2026-10-19, 11:00 am CT (9:00 am PT).
- **Feature requests** (optional) go straight to the product teams. Draft them from `docs/friction-log.md`.
