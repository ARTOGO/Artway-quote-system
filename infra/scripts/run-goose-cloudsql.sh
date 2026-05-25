#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PROJECT_ID="${PROJECT_ID:-artogo-v2}"
REGION="${REGION:-asia-east1}"
SQL_INSTANCE="${SQL_INSTANCE:-artogo-auth-db}"
CLOUD_SQL_CONNECTION_NAME="${CLOUD_SQL_CONNECTION_NAME:-${PROJECT_ID}:${REGION}:${SQL_INSTANCE}}"
DATABASE_SECRET="${DATABASE_SECRET:-quote-app-staging-database-url}"
MIGRATION_DIR="${MIGRATION_DIR:-${ROOT_DIR}/backend/migrations}"
CLOUD_SQL_SOCKET_DIR="${CLOUD_SQL_SOCKET_DIR:-/cloudsql}"
CLOUD_SQL_PROXY_LOG="${CLOUD_SQL_PROXY_LOG:-$(mktemp "${RUNNER_TEMP:-/tmp}/cloud-sql-proxy.XXXXXX")}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

prepare_socket_dir() {
  local requested="${CLOUD_SQL_SOCKET_DIR}"

  if mkdir -p "${requested}" 2>/dev/null && [[ -w "${requested}" ]]; then
    CLOUD_SQL_SOCKET_DIR="${requested}"
    return
  fi

  if command -v sudo >/dev/null 2>&1 && \
    sudo -n mkdir -p "${requested}" 2>/dev/null && \
    sudo -n chown "$(id -u):$(id -g)" "${requested}" 2>/dev/null; then
    CLOUD_SQL_SOCKET_DIR="${requested}"
    return
  fi

  if [[ "${requested}" == "/cloudsql" ]]; then
    CLOUD_SQL_SOCKET_DIR="/tmp/cloudsql"
    mkdir -p "${CLOUD_SQL_SOCKET_DIR}"
    return
  fi

  echo "unable to prepare Cloud SQL socket directory: ${requested}" >&2
  exit 1
}

database_url_for_socket_dir() {
  local database_url="$1"
  DATABASE_URL="${database_url}" \
    CLOUD_SQL_SOCKET_DIR="${CLOUD_SQL_SOCKET_DIR}" \
    CLOUD_SQL_CONNECTION_NAME="${CLOUD_SQL_CONNECTION_NAME}" \
    python3 - <<'PY'
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

database_url = os.environ["DATABASE_URL"]
socket_dir = os.environ["CLOUD_SQL_SOCKET_DIR"].rstrip("/")
connection_name = os.environ["CLOUD_SQL_CONNECTION_NAME"]

parts = urlsplit(database_url)
query = dict(parse_qsl(parts.query, keep_blank_values=True))
query["host"] = f"{socket_dir}/{connection_name}"

print(urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment)))
PY
}

wait_for_socket() {
  local socket_path="${CLOUD_SQL_SOCKET_DIR}/${CLOUD_SQL_CONNECTION_NAME}/.s.PGSQL.5432"
  for _ in $(seq 1 30); do
    if [[ -S "${socket_path}" ]]; then
      return 0
    fi
    sleep 1
  done

  echo "Cloud SQL proxy socket did not become ready: ${socket_path}" >&2
  if [[ -f "${CLOUD_SQL_PROXY_LOG}" ]]; then
    tail -50 "${CLOUD_SQL_PROXY_LOG}" >&2
  fi
  return 1
}

require_cmd gcloud
require_cmd goose
require_cmd cloud-sql-proxy
require_cmd python3

prepare_socket_dir

cloud-sql-proxy \
  --quota-project "${PROJECT_ID}" \
  --unix-socket "${CLOUD_SQL_SOCKET_DIR}" \
  "${CLOUD_SQL_CONNECTION_NAME}" \
  >"${CLOUD_SQL_PROXY_LOG}" 2>&1 &
proxy_pid="$!"

cleanup() {
  kill "${proxy_pid}" >/dev/null 2>&1 || true
  wait "${proxy_pid}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_for_socket

database_url="$(gcloud secrets versions access latest \
  --secret="${DATABASE_SECRET}" \
  --project="${PROJECT_ID}")"

if [[ -z "${database_url}" ]]; then
  echo "database URL secret resolved to an empty value: ${DATABASE_SECRET}" >&2
  exit 1
fi

database_url="$(database_url_for_socket_dir "${database_url}")"

goose -dir "${MIGRATION_DIR}" postgres "${database_url}" up
