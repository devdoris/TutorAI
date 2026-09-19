#!/bin/zsh
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
(sleep 2 && open http://localhost:5173) &
npm run dev
