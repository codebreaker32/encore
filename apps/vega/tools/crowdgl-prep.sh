#!/usr/bin/env bash
# SPIKE (src/crowdgl): the assets the native crowd harness reads from the package, regenerated on the Vega box after
# every `encore-box.sh up` (which deletes untracked files): the crowd page packed for ?preset=tv, the GLBs' embedded
# images as files, and the room's 2D canvases captured in Chromium. Needs Playwright in $PW_DIR (default ~/tools/pw).
set -euo pipefail
cd "$(dirname "$0")/../../.."
SEARCH=${1:-'?host=1&preset=tv&venue=club&hud=0'}
node prototypes/crowd3d/tools/pack.mjs apps/vega/assets/crowd --tv
rm -rf apps/vega/assets/crowdgl
node apps/vega/tools/crowdgl-extract.mjs apps/vega/assets/crowd/people apps/vega/assets/crowdgl/img
node apps/vega/tools/crowdgl-canvases.cjs apps/vega/assets/crowdgl "$SEARCH"
du -sh apps/vega/assets/crowd apps/vega/assets/crowdgl
