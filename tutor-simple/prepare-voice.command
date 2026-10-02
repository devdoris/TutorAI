#!/bin/zsh
# Renders every lesson's audio before a demo, so the tutor never waits.
# Double-click this, let it finish, then use start.command as usual.
cd "$(dirname "$0")"
node prepare-voice.mjs "${1:-en-NG-EzinneNeural}" "${2:--8%}"
echo
echo "You can close this window."
