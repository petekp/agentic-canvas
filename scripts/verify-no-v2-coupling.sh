#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${BASE_SHA:-}"

if [[ -z "${BASE_SHA}" ]]; then
  echo "No-v2-coupling check skipped: BASE_SHA is not set."
  echo "Set BASE_SHA to the pull request base commit SHA."
  exit 0
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Unable to resolve BASE_SHA=${BASE_SHA}. Ensure checkout fetch-depth is 0."
  exit 1
fi

changed_entries="$(git diff --name-status "${BASE_SHA}...HEAD")"

if [[ -z "${changed_entries}" ]]; then
  echo "No file changes detected."
  exit 0
fi

forbidden_patterns=(
  '^packages/agentic-canvas-v2/'
  '^src/app/api/briefing/v2/'
  '^src/lib/agentic-canvas-v2\.ts$'
)

violations=()
while IFS=$'\t' read -r status file _rest; do
  [[ -z "${status}" || -z "${file}" ]] && continue

  # Deleting forbidden paths is expected during decoupling; only block additions/modifications.
  if [[ "${status}" == D* ]]; then
    continue
  fi

  for pattern in "${forbidden_patterns[@]}"; do
    if [[ "${file}" =~ ${pattern} ]]; then
      violations+=("${status} ${file}")
      break
    fi
  done
done <<< "${changed_entries}"

if [[ "${#violations[@]}" -gt 0 ]]; then
  echo "No-v2-coupling gate violation:"
  echo "- The following paths are forbidden in this repository:"
  printf '  - %s\n' "${violations[@]}"
  exit 1
fi

echo "No-v2-coupling gate passed."
