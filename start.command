#!/bin/zsh
# Starts the Tutor and opens it in the browser.
cd "$(dirname "$0")"
lsof -ti tcp:8321 | xargs kill 2>/dev/null   # stop an older copy if one is still running

# The tutor's lines are played from rendered audio files. Without them it falls
# back to the Mac's voice, which pauses about a second before every line.
if [ ! -d audio ] || [ -z "$(find audio -name '*.mp3' -print -quit 2>/dev/null)" ]; then
  echo "No rendered audio yet."
  echo "Run prepare-voice.command once (about a minute) for the Nigerian voice."
  echo
fi

(sleep 1 && open "http://localhost:8321/index.html") &
python3 server.py
