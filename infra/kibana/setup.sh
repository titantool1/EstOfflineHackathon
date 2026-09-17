#!/usr/bin/env bash
set -euo pipefail
curl --silent --show-error --fail --retry 5 --retry-delay 2 --config - <<EOF
user = "elastic:${ELASTIC_PASSWORD}"
url = "http://elasticsearch:9200/_security/user/kibana_system/_password"
request = "POST"
header = "Content-Type: application/json"
data = "{\"password\":\"${KIBANA_PASSWORD}\"}"
EOF
