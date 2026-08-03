#!/bin/zsh
cd "/Users/apple/Desktop/Hadiz/FRISCHLY leb/frischly-server" || exit 1
node scripts/restore-probe-settings.js 2>/dev/null
echo "--- verify ---"
node tests/_snap.js FINAL 2>/dev/null
