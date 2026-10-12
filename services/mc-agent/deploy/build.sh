#!/usr/bin/env bash
# Build the MC's code zip for Amazon Bedrock AgentCore Runtime (direct code deployment, Python 3.12, arm64):
# the locked dependencies as prebuilt aarch64 wheels, plus mc_agent/ and main.py, all at the zip's root.
# Runs on the build box (x86_64 is fine: nothing is compiled, only aarch64 wheels are unpacked):
#   cd ~/strumble/services/mc-agent && bash deploy/build.sh [--bytecode] [--host]
#     --bytecode  also ship .pyc files (unchecked-hash, so zip timestamps can't invalidate them), which saves
#                 compiling every module from source on each cold microVM
#     --host      the same layout for this machine's own platform in ~/encore-mc-build/host (no zip), to boot it
#                 here before a deploy: cd ~/encore-mc-build/host && python3 main.py   (0.0.0.0:8080)
# Output: ~/encore-mc-build/encore-mc.zip, outside ~/strumble (encore-box.sh up --delete would remove it there).
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
OUT=${ENCORE_MC_BUILD:-$HOME/encore-mc-build}
UV=${UV:-$(command -v uv || echo "$HOME/.local/bin/uv")}
PYTHON_VERSION=3.12
PLATFORM=aarch64-manylinux2014
BYTECODE=0
HOST=0
for arg in "$@"; do
  case $arg in
    --bytecode) BYTECODE=1 ;;
    --host) HOST=1; PLATFORM=$(uname -m)-manylinux2014 ;;
    *) echo "unknown option $arg" >&2; exit 2 ;;
  esac
done
PKG=$OUT/pkg
[ "$HOST" = 1 ] && PKG=$OUT/host

rm -rf "$PKG"
[ "$HOST" = 1 ] || rm -f "$OUT/encore-mc.zip"
mkdir -p "$PKG"
cd "$HERE"

# Exactly the lock's packages (no dev group, no re-resolution), as arm64 wheels for the runtime's Python.
"$UV" export --frozen --no-dev --no-emit-project --no-hashes --format requirements-txt -q -o "$OUT/requirements.txt"
"$UV" pip install -q -r "$OUT/requirements.txt" --no-deps --target "$PKG" \
  --python-platform "$PLATFORM" --python-version "$PYTHON_VERSION" --only-binary :all:

cp -R src/mc_agent "$PKG/mc_agent"
cp deploy/main.py "$PKG/main.py"
# Console scripts carry this machine's interpreter in their shebang and nothing runs them in the runtime.
rm -rf "$PKG/bin"
find "$PKG" -name __pycache__ -type d -prune -exec rm -rf {} +
find "$PKG" -name '*.pyc' -delete

if [ "$BYTECODE" = 1 ]; then
  python3 -c 'import sys; assert sys.version_info[:2] == (3, 12), f"bytecode must match the runtime (3.12), not {sys.version}"'
  python3 -m compileall -q -j 2 --invalidation-mode unchecked-hash "$PKG" > /dev/null
fi
if [ "$HOST" = 1 ]; then
  echo "$PKG: $(du -sh "$PKG" | cut -f1) for $PLATFORM; boot it with: cd $PKG && python3 main.py"
  exit 0
fi

# The service rejects any native library that isn't Linux arm64 (it reads every .so's ELF header).
python3 - "$PKG" <<'PY'
import pathlib, sys
bad = []
for p in pathlib.Path(sys.argv[1]).rglob("*.so*"):
    if not p.is_file():
        continue
    head = p.read_bytes()[:20]
    if head[:4] != b"\x7fELF" or int.from_bytes(head[18:20], "little") != 183:  # EM_AARCH64
        bad.append(str(p))
if bad:
    sys.exit("not Linux arm64: " + ", ".join(bad[:5]))
PY

# Modes the runtime can read: 644 for files, 755 for directories.
find "$PKG" -type d -exec chmod 755 {} +
find "$PKG" -type f -exec chmod 644 {} +

(cd "$PKG" && zip -qrX "$OUT/encore-mc.zip" .)
python3 - "$OUT/encore-mc.zip" <<'PY'
import hashlib, sys, zipfile
path = sys.argv[1]
with zipfile.ZipFile(path) as z:
    infos = z.infolist()
    unzipped = sum(i.file_size for i in infos)
    names = {i.filename for i in infos}
assert "main.py" in names and "mc_agent/app.py" in names, "main.py and mc_agent/ must be at the zip root"
data = open(path, "rb").read()
print(f"{path}: {len(data) / 1e6:.1f} MB zipped, {unzipped / 1e6:.1f} MB unzipped, {len(infos)} files "
      f"(limits 250 / 750 MB)\nsha256 {hashlib.sha256(data).hexdigest()}")
PY
