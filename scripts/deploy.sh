#!/usr/bin/env bash
# Builds and deploys the static site to Vercel (project "giftlink").
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
mkdir -p .deploy/out
find .deploy/out -mindepth 1 -maxdepth 1 ! -name .vercel -exec rm -rf {} +
cp -R dist/. .deploy/out/
cp vercel.json .deploy/out/
cd .deploy/out
[ -d .vercel ] || vercel link --project giftlink --yes
vercel deploy --prod --yes
