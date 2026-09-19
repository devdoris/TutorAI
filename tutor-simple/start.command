#!/bin/zsh
# Starts the Tutor and opens it in the browser. The tutor speaks with the Mac's own voice.
cd "$(dirname "$0")"
lsof -ti tcp:8321 | xargs kill 2>/dev/null   # stop an older copy if one is still running
(sleep 1 && open "http://localhost:8321/index.html") &
python3 server.py
