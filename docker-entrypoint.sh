#!/bin/bash
set -e

CMD="$1"
shift

if [[ "$CMD" == "daemon" ]]; then
  exec /usr/local/bin/node /app/lib/daemon \
         -c /app/config/judge-daemon.json \
         "$@"
elif [[ "$CMD" == "runner" ]]; then
  exec /usr/local/bin/node /app/lib/runner \
         -s /app/config/runner-shared.json \
         -i "/app/config/runner-instance-${SYZOJ_JUDGE_RUNNER_INSTANCE:-1}.json" \
         "$@"
else
  echo "Unsupport command: $CMD"
  exit 2
fi
