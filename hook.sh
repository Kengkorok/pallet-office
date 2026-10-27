#!/bin/sh
# Claude Code hook -> Pallet Office. Forwards the hook JSON from stdin and always
# exits 0 with no output, so a slow or stopped office never blocks Claude Code.
#   PALLET_URL   default http://127.0.0.1:4400
#   PALLET_TOKEN optional, must match the server's PALLET_TOKEN
URL="${PALLET_URL:-http://127.0.0.1:4400}/event"
if [ -n "$PALLET_TOKEN" ]; then
  curl -s -m 1 -o /dev/null -X POST -H 'content-type: application/json' \
    -H "x-pallet-token: $PALLET_TOKEN" --data-binary @- "$URL" >/dev/null 2>&1
else
  curl -s -m 1 -o /dev/null -X POST -H 'content-type: application/json' \
    --data-binary @- "$URL" >/dev/null 2>&1
fi
exit 0
