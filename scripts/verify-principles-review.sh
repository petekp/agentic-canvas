#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="${BASE_SHA:-}"

if [[ -z "${BASE_SHA}" ]]; then
  echo "Principles review check skipped: BASE_SHA is not set."
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
review_docs=()

while IFS= read -r file; do
  [[ -z "${file}" ]] && continue

  if [[ "${file}" =~ ^(src|packages)/.*\.(ts|tsx|js|jsx)$ ]]; then
    if [[ ! "${file}" =~ (\.test\.|\.spec\.|/__tests__/|/tests/) ]]; then
      code_changes+=("${file}")
    fi
  fi

  if [[ "${file}" =~ ^\.claude/docs/principles-adherence-.*\.md$ ]]; then
    review_docs+=("${file}")
  fi
done <<< "${changed_files}"

if [[ "${#code_changes[@]}" -eq 0 ]]; then
  echo "No behavior-code changes under src/ or packages/. Principles review gate passed."
  exit 0
fi

if [[ "${#review_docs[@]}" -eq 0 ]]; then
  echo "Principles review gate violation:"
  echo "- Source files changed, but no principles adherence review note was updated."
  echo "- Expected at least one changed file matching:"
  echo "  .claude/docs/principles-adherence-<date>.md"
  exit 1
fi

for doc in "${review_docs[@]}"; do
  if [[ ! -f "${doc}" ]]; then
    continue
  fi
  lc_content="$(tr '[:upper:]' '[:lower:]' < "${doc}")"
  if grep -q "deepwiki" <<< "${lc_content}" \
    && grep -q "pi-mono" <<< "${lc_content}" \
    && grep -q "openclaw" <<< "${lc_content}"; then
    echo "Principles review gate passed with review doc: ${doc}"
    exit 0
  fi
done

echo "Principles review gate violation:"
echo "- Review note exists, but required evidence markers are missing."
echo "- Required terms (case-insensitive): deepwiki, pi-mono, openclaw"
exit 1
