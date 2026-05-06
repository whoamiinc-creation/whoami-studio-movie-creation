#!/bin/bash
cd /Users/sonobekenta/Desktop/whoami-inc/movie-project
exec node_modules/.bin/remotion render src/index.ts MyComp out/video.mp4 \
  --browser-executable="/tmp/google-chrome" \
  --log=verbose \
  > /Users/sonobekenta/Desktop/whoami-inc/movie-project/render.log 2>&1
