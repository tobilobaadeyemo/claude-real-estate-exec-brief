#!/usr/bin/env bash
# Rebuild the upload-ready skill zip, then validate the package.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/real-estate-exec-brief.zip
zip -rq -X dist/real-estate-exec-brief.zip real-estate-exec-brief
python3 scripts/validate.py
