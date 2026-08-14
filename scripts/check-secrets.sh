#!/usr/bin/env bash
# Lightweight secret scan for M0. Does not replace dedicated scanning in M5.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fail=0

if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "FAIL: .env is tracked in git. Only .env.example may be committed."
  fail=1
fi

# High-confidence credential material. Placeholders in .env.example are excluded.
if git grep -I -E --cached \
  -e '-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----' \
  -e 'AKIA[0-9A-Z]{16}' \
  -- ':!.env.example' ':!docs/**' ':!*.docx' ':!*.zip' >/dev/null 2>&1; then
  echo "FAIL: potential private key or cloud access key found in tracked files."
  git grep -I -E --cached \
    -e '-----BEGIN (RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----' \
    -e 'AKIA[0-9A-Z]{16}' \
    -- ':!.env.example' ':!docs/**' ':!*.docx' ':!*.zip' || true
  fail=1
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "PASS: no tracked .env file and no high-confidence secrets detected."
