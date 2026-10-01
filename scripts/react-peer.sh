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
sdk="$(node -p "require('$repo/package.json').devDependencies['@typesafe-ai/sdk']")"
tarball="$(cd "$repo" && npm pack --silent --pack-destination "$work")"

cd "$work"
npm init -y >/dev/null
npm pkg set type=module
npm install --silent --no-audit --no-fund \
	"react@$version" "react-dom@$version" "jsdom@$jsdom" "@typesafe-ai/sdk@$sdk" "./$tarball"
cp "$repo/scripts/react-peer.ts" .
node react-peer.ts

# A host app may set the common `source` condition for its own workspace
# packages; every entry point must still resolve to the shipped dist/, and
# every source map must carry its sources, since src/ is not shipped (#197).
node --conditions=source --input-type=module -e "
import { readdirSync, readFileSync } from 'node:fs';
await Promise.all(['@justask/core', '@justask/core/react', '@justask/core/jev', '@justask/core/eval'].map((entry) => import(entry)));
const maps = readdirSync('node_modules/@justask/core/dist', { recursive: true }).filter((file) => file.endsWith('.map'));
const bare = maps.filter((file) => !JSON.parse(readFileSync('node_modules/@justask/core/dist/' + file, 'utf8')).sourcesContent);
if (maps.length === 0 || bare.length > 0) throw new Error('source maps without their sources: ' + (bare.join(', ') || 'none shipped'));
console.log('every entry point resolves under the source condition, ' + maps.length + ' source maps carry their sources');
"
