#!/bin/bash
set -e

PROJECT="/Users/sonobekenta/Desktop/whoami-inc/movie-project"
LOG_DIR="$PROJECT/logs"
LOG="$LOG_DIR/daily-$(date +%Y%m%d).log"
NODE="$(which node)"
REMOTION="$PROJECT/node_modules/.bin/remotion"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

mkdir -p "$LOG_DIR"

exec >> "$LOG" 2>&1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') START ==="

cd "$PROJECT"

DATE=$(date +%Y-%m-%d)

echo "[1/3] Generating audio..."
"$NODE" "$PROJECT/scripts/generate-audio.js" "$DATE"

echo "[2/3] Rendering..."
"$NODE" "$REMOTION" render src/index.ts MyComp out/video.mp4 \
  --browser-executable="$CHROME" \
  --props "{\"seed\":\"$DATE\"}" \
  --overwrite

echo "[3/3] Uploading to YouTube..."
"$NODE" scripts/upload-youtube.js

echo "=== $(date '+%Y-%m-%d %H:%M:%S') DONE ==="
