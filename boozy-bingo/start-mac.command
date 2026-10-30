#!/bin/bash
# Double-click to start Boozy Bingo on a Mac. Close this window to stop it.
cd "$(dirname "$0")"
PORT=8000
if command -v python3 >/dev/null 2>&1; then
  (sleep 1; open "http://127.0.0.1:$PORT/") &
  echo "🍹 Boozy Bingo is running at http://127.0.0.1:$PORT/"
  echo "   Keep this window open while you play. Close it to stop."
  python3 -m http.server "$PORT" --bind 127.0.0.1
else
  echo "Python not found, opening the file directly (Spotify login won't work this way)."
  open index.html
fi
