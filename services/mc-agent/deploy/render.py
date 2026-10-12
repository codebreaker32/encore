"""The CreateAgentRuntime / UpdateAgentRuntime input for the MC, from deploy/runtime.json (used by agentcore.sh).

  python3 deploy/render.py create <s3-version-id>
  python3 deploy/render.py update <s3-version-id> <runtime-id>

An update resends the whole configuration (the API replaces it, it does not merge) and turns on MMDSv2, which
CreateAgentRuntime cannot set: invocations are refused on runtimes without it. Standard library only.
"""

import json
import sys
from pathlib import Path

SPEC = Path(__file__).resolve().parent / "runtime.json"


def render(mode: str, version_id: str, runtime_id: str = "", spec: Path = SPEC) -> dict:
    if mode not in ("create", "update") or not version_id or (mode == "update" and not runtime_id):
        raise ValueError("usage: render.py create <s3-version-id> | update <s3-version-id> <runtime-id>")
    d = json.loads(spec.read_text())
    d["agentRuntimeArtifact"]["codeConfiguration"]["code"]["s3"]["versionId"] = version_id
    if mode == "update":
        d.pop("agentRuntimeName")
        d.pop("tags", None)
        d["agentRuntimeId"] = runtime_id
        d["metadataConfiguration"] = {"requireMMDSV2": True}
    return d


if __name__ == "__main__":
    try:
        print(json.dumps(render(*sys.argv[1:4]), indent=1))
    except (TypeError, ValueError):
        sys.exit("usage: render.py create <s3-version-id> | update <s3-version-id> <runtime-id>")
