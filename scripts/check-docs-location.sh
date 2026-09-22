#!/usr/bin/env bash
# Fail when a tracked .md file sits outside the doc tree.
# Allowlist: built-in defaults + .claude/docs-allowlist (one extended regex per line).
set -u
root=$(git rev-parse --show-toplevel) && cd "$root" || exit 1
patterns=(
  '^(README|CLAUDE|CLAUDE\.local|AGENTS|GEMINI|CONTRIBUTING|CHANGELOG|LICENSE|SECURITY|CONTEXT|CONTEXT-MAP|PRODUCT|DESIGN|QUICKSTART)\.md$'
  '^docs/'
  '^\.[^/]+/'                                        # any tool/harness dot-directory: .claude .agents .github .gemini .cursor .scratch ...
  '^(apps|packages|services|libs|aspire)/[^/]+/README\.md$'
  '^(src/)?content/' '^src/pages/.*\.mdx?$'          # framework content collections, not docs
  '^(src|apps|packages)/[^/]+/docs/'                   # multi-context ADRs
)
if [ -f .claude/docs-allowlist ]; then
  while IFS= read -r line; do [ -n "$line" ] && [ "${line:0:1}" != "#" ] && patterns+=("$line"); done < .claude/docs-allowlist
fi
bad=0
while IFS= read -r f; do
  ok=0; for p in "${patterns[@]}"; do printf '%s' "$f" | grep -Eq "$p" && { ok=1; break; }; done
  [ $ok = 1 ] || { echo "$f"; bad=1; }
done < <(git ls-files -- '*.md' '*.mdx' '*.MD')
if [ $bad = 1 ]; then
  echo >&2 "Markdown outside the doc tree. Move it under docs/ or allow the path in .claude/docs-allowlist."
  exit 1
fi
