#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infra/phase-a.env}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

ALLOW_MISSING=0
CHECK_HTTP=0
for arg in "$@"; do
  case "${arg}" in
    --allow-missing) ALLOW_MISSING=1 ;;
    --check-http) CHECK_HTTP=1 ;;
    *)
      echo "unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

PROJECT_ID="${PROJECT_ID:-artogo-v2}"
REGION="${REGION:-asia-east1}"
SQL_INSTANCE="${SQL_INSTANCE:-artogo-auth-db}"
RUN_SA="${RUN_SA:-quote-app-runner}"
DEPLOYER_SA="${DEPLOYER_SA:-github-actions-deployer}"
WIF_POOL="${WIF_POOL:-github-actions}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-ARTOGO/Artway-quote-system}"
URL_MAP="${URL_MAP:-https}"
HTTPS_TARGET_PROXY="${HTTPS_TARGET_PROXY:-https-target-proxy-2}"
CERT_NAME="${CERT_NAME:-quote-app-cert}"
LB_IP="${LB_IP:-35.241.57.95}"
HOST_STAGING="${HOST_STAGING:-quote-staging.artogo.co}"
HOST_PROD="${HOST_PROD:-quote.artogo.co}"
SERVICE_STAGING="${SERVICE_STAGING:-quote-app-staging}"
SERVICE_PROD="${SERVICE_PROD:-quote-app-prod}"
DB_STAGING="${DB_STAGING:-quotes_staging}"
DB_PROD="${DB_PROD:-quotes_prod}"
DB_USER_STAGING="${DB_USER_STAGING:-quote_app_staging}"
DB_USER_PROD="${DB_USER_PROD:-quote_app_prod}"

missing=0

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

section() {
  printf '\n== %s ==\n' "$1"
}

mark_missing() {
  echo "missing: $1" >&2
  missing=$((missing + 1))
}

check_cmd() {
  local label="$1"
  shift
  echo "+ $*"
  local output
  if output="$("$@" 2>&1)"; then
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}"
    fi
    echo "ok: ${label}"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "${label}"
  fi
}

check_database() {
  local database="$1"
  echo "+ gcloud sql databases list --instance=${SQL_INSTANCE} | grep ${database}"
  local output
  if output="$(gcloud sql databases list \
    --project="${PROJECT_ID}" \
    --instance="${SQL_INSTANCE}" \
    --format='value(name)' 2>&1)" && printf '%s\n' "${output}" | grep -qx "${database}"; then
    echo "ok: database ${database}"
  else
    if [[ "${output}" == ERROR:* ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "database ${database}"
  fi
}

check_sql_user() {
  local user="$1"
  echo "+ gcloud sql users list --instance=${SQL_INSTANCE} | grep ${user}"
  local output
  if output="$(gcloud sql users list \
    --project="${PROJECT_ID}" \
    --instance="${SQL_INSTANCE}" \
    --format='value(name)' 2>&1)" && printf '%s\n' "${output}" | grep -qx "${user}"; then
    echo "ok: SQL user ${user}"
  else
    if [[ "${output}" == ERROR:* ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "SQL user ${user}"
  fi
}

check_url_host_target() {
  local host="$1"
  local matcher="$2"
  local backend="$3"
  echo "+ gcloud compute url-maps describe ${URL_MAP} | check ${host} -> ${matcher} -> ${backend}"
  local output
  if output="$(gcloud compute url-maps describe "${URL_MAP}" \
    --project="${PROJECT_ID}" \
    --format='json(hostRules,pathMatchers)' 2>/dev/null | HOST_TO_FIND="${host}" EXPECTED_MATCHER="${matcher}" EXPECTED_BACKEND="${backend}" python3 -c '
import json
import os
import sys

data = json.load(sys.stdin)
host = os.environ["HOST_TO_FIND"]
expected_matcher = os.environ["EXPECTED_MATCHER"]
expected_backend = os.environ["EXPECTED_BACKEND"]

def display(value):
    return value if value else "<missing>"

host_rule = next((r for r in data.get("hostRules", []) if host in r.get("hosts", [])), None)
if not host_rule:
    print(f"host rule missing for {host}", file=sys.stderr)
    sys.exit(1)

actual_matcher = host_rule.get("pathMatcher", "")
if actual_matcher != expected_matcher:
    print(f"{host} uses pathMatcher {display(actual_matcher)}, want {expected_matcher}", file=sys.stderr)
    sys.exit(1)

path_matcher = next((p for p in data.get("pathMatchers", []) if p.get("name") == expected_matcher), None)
if not path_matcher:
    print(f"path matcher missing: {expected_matcher}", file=sys.stderr)
    sys.exit(1)

actual_backend = path_matcher.get("defaultService", "").rstrip("/").split("/")[-1]
if actual_backend != expected_backend:
    print(f"{expected_matcher} defaultService {display(actual_backend)}, want {expected_backend}", file=sys.stderr)
    sys.exit(1)
')" && [[ -z "${output}" ]]; then
    echo "ok: URL map ${host} -> ${backend}"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "URL map ${host} -> ${backend}"
  fi
}

check_iap_backend() {
  local backend="$1"
  echo "+ gcloud compute backend-services describe ${backend} | check IAP"
  local enabled
  enabled="$(gcloud compute backend-services describe "${backend}" \
    --project="${PROJECT_ID}" \
    --global \
    --format='value(iap.enabled)' 2>/dev/null || true)"
  if [[ "${enabled}" == "True" || "${enabled}" == "true" ]]; then
    echo "ok: IAP enabled on ${backend}"
  else
    mark_missing "IAP enabled on ${backend}"
  fi
}

check_cert_attached() {
  local cert="$1"
  echo "+ gcloud compute target-https-proxies describe ${HTTPS_TARGET_PROXY} | check cert ${cert}"
  if gcloud compute target-https-proxies describe "${HTTPS_TARGET_PROXY}" \
    --project="${PROJECT_ID}" \
    --format='value(sslCertificates.basename())' 2>/dev/null | tr ';' '\n' | grep -qx "${cert}"; then
    echo "ok: target proxy has cert ${cert}"
  else
    mark_missing "target proxy has cert ${cert}"
  fi
}

check_cert_active() {
  local cert="$1"
  echo "+ gcloud compute ssl-certificates describe ${cert} | check ACTIVE"
  local status
  status="$(gcloud compute ssl-certificates describe "${cert}" \
    --project="${PROJECT_ID}" \
    --global \
    --format='value(managed.status)' 2>/dev/null || true)"
  if [[ "${status}" == "ACTIVE" ]]; then
    echo "ok: managed certificate ${cert} ACTIVE"
  else
    mark_missing "managed certificate ${cert} ACTIVE (current: ${status:-missing})"
  fi
}

check_dns_host() {
  local host="$1"
  echo "+ dig +short ${host} A | check ${LB_IP}"
  local records
  records="$(dig +short "${host}" A 2>/dev/null || true)"
  if printf '%s\n' "${records}" | grep -qx "${LB_IP}"; then
    echo "ok: DNS ${host} -> ${LB_IP}"
  else
    mark_missing "DNS ${host} -> ${LB_IP}"
  fi
}

check_iap_http() {
  local url="$1"
  echo "+ curl -I --max-redirs 0 ${url}"
  local headers
  headers="$(curl -sSI --max-time 20 --max-redirs 0 "${url}" 2>/dev/null || true)"
  if printf '%s\n' "${headers}" | grep -qi '^x-goog-iap-generated-response: true'; then
    echo "ok: IAP challenge ${url}"
  else
    if [[ -n "${headers}" ]]; then
      printf '%s\n' "${headers}" | head -n 1 >&2
    fi
    mark_missing "HTTP check ${url}"
  fi
}

check_cloud_run_service() {
  local service="$1"
  echo "+ gcloud run services describe ${service} | check URL and ingress"
  local output
  if output="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json 2>/dev/null | EXPECTED_INGRESS="internal-and-cloud-load-balancing" python3 -c '
import json
import os
import sys

data = json.load(sys.stdin)
expected = os.environ["EXPECTED_INGRESS"]
url = data.get("status", {}).get("url", "")
ingress = data.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/ingress", "")

if not url:
    print("status.url missing", file=sys.stderr)
    sys.exit(1)
if ingress != expected:
    display_ingress = ingress or "<missing>"
    print(f"ingress {display_ingress}, want {expected}", file=sys.stderr)
    sys.exit(1)

print(url)
')" && [[ -n "${output}" ]]; then
    printf '%s\n' "${output}"
    echo "ok: Cloud Run service ${service} ingress internal-and-cloud-load-balancing"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "Cloud Run service ${service} ingress internal-and-cloud-load-balancing"
  fi
}

require_cmd gcloud
require_cmd python3
require_cmd dig

section "project"
check_cmd "project ${PROJECT_ID}" gcloud projects describe "${PROJECT_ID}" --format='value(projectId)'
project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)' 2>/dev/null || true)"
echo "project number: ${project_number:-<unavailable>}"

section "runtime identity"
check_cmd "runtime service account" gcloud iam service-accounts describe "${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}"
if [[ -n "${project_number}" ]]; then
  iap_sa="service-${project_number}@gcp-sa-iap.iam.gserviceaccount.com"
  echo "expected IAP service account: ${iap_sa}"
fi

section "cloud sql"
check_cmd "SQL instance ${SQL_INSTANCE}" gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" --format='value(connectionName)'
check_database "${DB_STAGING}"
check_database "${DB_PROD}"
check_sql_user "${DB_USER_STAGING}"
check_sql_user "${DB_USER_PROD}"

section "secret manager"
for secret in \
  quote-app-staging-db-password \
  quote-app-prod-db-password \
  quote-app-staging-database-url \
  quote-app-prod-database-url; do
  check_cmd "secret ${secret}" gcloud secrets describe "${secret}" --project="${PROJECT_ID}" --format='value(name)'
done

section "cloud run"
for service in "${SERVICE_STAGING}" "${SERVICE_PROD}"; do
  check_cloud_run_service "${service}"
done

section "load balancer"
for neg in quote-app-staging-neg quote-app-prod-neg; do
  check_cmd "serverless NEG ${neg}" gcloud compute network-endpoint-groups describe "${neg}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format='value(name)'
done
for backend in quote-app-staging-backend quote-app-prod-backend; do
  check_cmd "backend service ${backend}" gcloud compute backend-services describe "${backend}" \
    --project="${PROJECT_ID}" \
    --global \
    --format='value(name)'
  check_iap_backend "${backend}"
done
check_url_host_target "${HOST_STAGING}" "quote-app-staging" "quote-app-staging-backend"
check_url_host_target "${HOST_PROD}" "quote-app-prod" "quote-app-prod-backend"

section "certificate"
check_cmd "managed certificate ${CERT_NAME}" gcloud compute ssl-certificates describe "${CERT_NAME}" \
  --project="${PROJECT_ID}" \
  --global \
  --format='table(name,managed.status,managed.domains)'
check_cert_attached "${CERT_NAME}"
check_cert_active "${CERT_NAME}"

section "DNS"
check_dns_host "${HOST_STAGING}"
check_dns_host "${HOST_PROD}"

section "workload identity"
if [[ -n "${project_number}" ]]; then
  principal="principalSet://iam.googleapis.com/projects/${project_number}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPOSITORY}"
  echo "+ gcloud iam service-accounts get-iam-policy ${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com | grep repository principal"
  if gcloud iam service-accounts get-iam-policy "${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" \
    --format=json | grep -q "${principal}"; then
    echo "ok: WIF binding for ${GITHUB_REPOSITORY}"
  else
    mark_missing "WIF binding for ${GITHUB_REPOSITORY}"
  fi
else
  mark_missing "project number for WIF verification"
fi

if [[ "${CHECK_HTTP}" -eq 1 ]]; then
  section "HTTP smoke"
  require_cmd curl
  check_iap_http "https://${HOST_STAGING}/"
  check_iap_http "https://${HOST_STAGING}/readyz"
  check_iap_http "https://${HOST_PROD}/"
  check_iap_http "https://${HOST_PROD}/readyz"
fi

section "summary"
if [[ "${missing}" -eq 0 ]]; then
  echo "Phase A verification passed"
  exit 0
fi

echo "Phase A verification found ${missing} missing or incomplete item(s)"
if [[ "${ALLOW_MISSING}" -eq 1 ]]; then
  exit 0
fi
exit 1
