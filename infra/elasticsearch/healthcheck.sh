#!/usr/bin/env bash
set -euo pipefail
# Pass the password through stdin, not curl arguments or healthcheck output.
response=$(curl --silent --show-error --fail --max-time 8 --config - <<EOF
user = "elastic:${ELASTIC_PASSWORD}"
url = "http://localhost:9200/_cluster/health?wait_for_status=yellow&timeout=5s"
EOF
)
[[ "$response" == *'"timed_out":false'* ]]
