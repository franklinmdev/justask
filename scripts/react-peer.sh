#!/usr/bin/env bash
# Packs justask as npm would publish it, installs it in a fresh project with
# the React version named, and runs scripts/react-peer.ts there (#175).
# Usage: scripts/react-peer.sh <react version>, after `pnpm build`.
set -euo pipefail

version="${1:?usage: scripts/react-peer.sh <react version>}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

jsdom="$(node -p "require('$repo/package.json').devDependencies.jsdom")"
tarball="$(cd "$repo" && npm pack --silent --pack-destination "$work")"

cd "$work"
npm init -y >/dev/null
npm pkg set type=module
npm install --silent --no-audit --no-fund \
	"react@$version" "react-dom@$version" "jsdom@$jsdom" "./$tarball"
cp "$repo/scripts/react-peer.ts" .
node react-peer.ts
