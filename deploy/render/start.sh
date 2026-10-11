#!/bin/sh
# Runs the API and the website in one container; if either stops, the container exits so
# Render restarts it.
set -u

# Optional demo data. The seed refuses to touch a database that already has organizations,
# so leaving SEED_DEMO on is harmless after the first boot.
if [ "${SEED_DEMO:-false}" = "true" ]; then
  seed || echo "seed skipped"
fi

PORT=8090 server &
api=$!
node /app/server.js &
web=$!

trap 'kill -TERM $api $web 2>/dev/null; wait; exit 0' TERM INT

while kill -0 "$api" 2>/dev/null && kill -0 "$web" 2>/dev/null; do
  sleep 2
done
echo "a process exited; stopping container"
kill -TERM $api $web 2>/dev/null
wait
exit 1
