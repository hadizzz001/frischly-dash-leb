#!/bin/zsh
cd "/Users/apple/Desktop/Hadiz/FRISCHLY leb/frischly-server" || exit 1
node tests/_snap.js BEFORE 2>/dev/null
node tests/_settings-map-live.js >/tmp/smt.log 2>&1
tail -5 /tmp/smt.log
node tests/_snap.js AFTER 2>/dev/null
