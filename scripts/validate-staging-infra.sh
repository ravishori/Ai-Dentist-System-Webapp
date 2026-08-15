#!/usr/bin/env bash
# Validates staging hosting files without deploying or contacting Render/Cloudflare.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail=0

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "FAIL: missing required file: $1"
    fail=1
  else
    echo "OK: found $1"
  fi
}

# Prefer ripgrep when present; fall back to grep for CI runners without rg.
search() {
  local pattern="$1"
  shift
  if command -v rg >/dev/null 2>&1; then
    rg -q -- "$pattern" "$@"
  else
    grep -Eq -- "$pattern" "$@"
  fi
}

require_file "Dockerfile.web"
require_file "Dockerfile.worker"
require_file ".dockerignore"
require_file "render.yaml"
require_file "docs/STAGING-HOSTING.md"
require_file "docs/adr/ADR-IMP-005-staging-hosting-render.md"

if [[ -f Dockerfile.web ]]; then
  search "node:22" Dockerfile.web || {
    echo "FAIL: Dockerfile.web must use Node 22"
    fail=1
  }
  search "next start" Dockerfile.web || {
    echo "FAIL: Dockerfile.web must start with next start"
    fail=1
  }
  search "PORT" Dockerfile.web || {
    echo "FAIL: Dockerfile.web must honor PORT"
    fail=1
  }
fi

if [[ -f Dockerfile.worker ]]; then
  search "node:22" Dockerfile.worker || {
    echo "FAIL: Dockerfile.worker must use Node 22"
    fail=1
  }
  search "@dentalcare/worker" Dockerfile.worker || {
    echo "FAIL: Dockerfile.worker must start the worker package"
    fail=1
  }
fi

if [[ -f render.yaml ]]; then
  python3 - <<'PY'
import sys
from pathlib import Path

try:
    import yaml  # type: ignore
except ImportError:
    # PyYAML may be absent; fall back to structural checks only.
    text = Path("render.yaml").read_text(encoding="utf-8")
    required = [
        "dentalcare-web-staging",
        "dentalcare-worker-staging",
        "dentalcare-postgres-staging",
        'autoDeployTrigger: "off"',
        "Dockerfile.web",
        "Dockerfile.worker",
        'postgresMajorVersion: "16"',
        "btree_gist" not in text,  # extension comes from migrations, not blueprint
    ]
    for item in required[:-1]:
        if item not in text:
            print(f"FAIL: render.yaml missing expected content: {item}")
            sys.exit(1)
    if "dental.trinetralab.net" in text:
        print("FAIL: render.yaml must not configure dental.trinetralab.net yet")
        sys.exit(1)
    print("OK: render.yaml structural checks passed (PyYAML not installed)")
    sys.exit(0)

data = yaml.safe_load(Path("render.yaml").read_text(encoding="utf-8"))
services = {s.get("name"): s for s in data.get("services", [])}
databases = {d.get("name"): d for d in data.get("databases", [])}

for name in ("dentalcare-web-staging", "dentalcare-worker-staging"):
    if name not in services:
        print(f"FAIL: missing service {name}")
        sys.exit(1)

if "dentalcare-postgres-staging" not in databases:
    print("FAIL: missing database dentalcare-postgres-staging")
    sys.exit(1)

web = services["dentalcare-web-staging"]
worker = services["dentalcare-worker-staging"]
db = databases["dentalcare-postgres-staging"]

if web.get("autoDeployTrigger") != "off":
    print("FAIL: web autoDeployTrigger must be off")
    sys.exit(1)
if worker.get("autoDeployTrigger") != "off":
    print("FAIL: worker autoDeployTrigger must be off")
    sys.exit(1)
if web.get("healthCheckPath") != "/api/health":
    print("FAIL: web healthCheckPath must be /api/health")
    sys.exit(1)
if str(db.get("postgresMajorVersion")) != "16":
    print("FAIL: postgresMajorVersion must be 16")
    sys.exit(1)
if "dental.trinetralab.net" in Path("render.yaml").read_text(encoding="utf-8"):
    print("FAIL: render.yaml must not configure dental.trinetralab.net yet")
    sys.exit(1)

print("OK: render.yaml parsed and staging constraints verified")
PY
  if [[ $? -ne 0 ]]; then
    fail=1
  fi
fi

secret_hits=0
if command -v rg >/dev/null 2>&1; then
  if rg -n "AKIA[0-9A-Z]{16}|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----" \
    Dockerfile.web Dockerfile.worker render.yaml docs/STAGING-HOSTING.md \
    docs/adr/ADR-IMP-005-staging-hosting-render.md 2>/dev/null; then
    secret_hits=1
  fi
else
  if grep -EIn "AKIA[0-9A-Z]{16}|-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----" \
    Dockerfile.web Dockerfile.worker render.yaml docs/STAGING-HOSTING.md \
    docs/adr/ADR-IMP-005-staging-hosting-render.md 2>/dev/null; then
    secret_hits=1
  fi
fi
if [[ "$secret_hits" -ne 0 ]]; then
  echo "FAIL: potential secret material in staging infra files"
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "PASS: staging infrastructure configuration validation succeeded (no deploy performed)."
