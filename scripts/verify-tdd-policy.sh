#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${BASE_SHA:-}"

if [[ -z "${BASE_SHA}" ]]; then
  echo "TDD policy check skipped: BASE_SHA is not set."
  echo "Set BASE_SHA to the pull request base commit SHA."
  exit 0
fi

if ! git cat-file -e "${BASE_SHA}^{commit}" 2>/dev/null; then
  echo "Unable to resolve BASE_SHA=${BASE_SHA}. Ensure checkout fetch-depth is 0."
  exit 1
fi

changed_files="$(git diff --name-only "${BASE_SHA}...HEAD")"

if [[ -z "${changed_files}" ]]; then
  echo "No file changes detected."
  exit 0
fi

code_changes=()
test_changes=()

while IFS= read -r file; do
  [[ -z "${file}" ]] && continue

  if [[ "${file}" =~ ^(src|packages)/.*\.(ts|tsx|js|jsx)$ ]]; then
    if [[ "${file}" =~ (\.test\.|\.spec\.|/__tests__/|/tests/) ]]; then
      test_changes+=("${file}")
    else
      code_changes+=("${file}")
    fi
  fi
done <<< "${changed_files}"

if [[ "${#code_changes[@]}" -eq 0 ]]; then
  echo "No source-code changes under src/ or packages/. TDD policy gate passed."
  exit 0
fi

if [[ "${#test_changes[@]}" -eq 0 ]]; then
  echo "TDD policy violation:"
  echo "- Source files changed:"
  printf '  - %s\n' "${code_changes[@]}"
  echo "- No corresponding test file updates were detected."
  echo
  echo "Policy: behavior-changing code must follow tdd (RED -> GREEN -> REFACTOR)"
  echo "and include test updates in the same PR."
  exit 1
fi

echo "TDD policy gate passed."
echo "- Source files changed: ${#code_changes[@]}"
echo "- Test files changed: ${#test_changes[@]}"
