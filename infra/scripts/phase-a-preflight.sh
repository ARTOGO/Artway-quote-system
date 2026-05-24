#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infra/phase-a.env}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

PROJECT_ID="${PROJECT_ID:-artogo-v2}"
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
REGION="${REGION:-asia-east1}"
AR_REPOSITORY="${AR_REPOSITORY:-internal}"
SQL_INSTANCE="${SQL_INSTANCE:-artogo-auth-db}"
URL_MAP="${URL_MAP:-https}"
HTTPS_TARGET_PROXY="${HTTPS_TARGET_PROXY:-https-target-proxy-2}"
WIF_POOL="${WIF_POOL:-github-actions}"
WIF_PROVIDER="${WIF_PROVIDER:-github}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-ARTOGO/Artway-quote-system}"
HOST_STAGING="${HOST_STAGING:-quote-staging.artogo.co}"
HOST_PROD="${HOST_PROD:-quote.artogo.co}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

section() {
  printf '\n== %s ==\n' "$1"
}

require_cmd gcloud
require_cmd docker

section "gcloud account and project"
gcloud auth list --filter=status:ACTIVE --format='table(account,status)'
current_project="$(gcloud config get-value project 2>/dev/null || true)"
echo "gcloud default project: ${current_project:-<unset>}"
echo "target project: ${PROJECT_ID}"
if [[ "${current_project}" != "${PROJECT_ID}" ]]; then
  echo "warning: default project differs; scripts use --project=${PROJECT_ID} explicitly"
fi

section "project"
gcloud projects describe "${PROJECT_ID}" --format='table(projectId,name,lifecycleState)'
actual_project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
echo "project number: ${actual_project_number}"
if [[ -n "${PROJECT_NUMBER}" && "${PROJECT_NUMBER}" != "${actual_project_number}" ]]; then
  echo "warning: PROJECT_NUMBER=${PROJECT_NUMBER} does not match ${actual_project_number}" >&2
fi

section "required APIs"
gcloud services list \
  --project="${PROJECT_ID}" \
  --enabled \
  --filter='config.name:(run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com iap.googleapis.com compute.googleapis.com iamcredentials.googleapis.com)' \
  --format='value(config.name)' | sort

section "artifact registry"
gcloud artifacts repositories describe "${AR_REPOSITORY}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" \
  --format='table(name,format,location)'

section "cloud sql"
gcloud sql instances describe "${SQL_INSTANCE}" \
  --project="${PROJECT_ID}" \
  --format='table(name,databaseVersion,region,state,connectionName)'
gcloud sql databases list \
  --project="${PROJECT_ID}" \
  --instance="${SQL_INSTANCE}" \
  --format='table(name,charset,collation)'

section "cloud run services"
gcloud run services list \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='table(metadata.name,status.url,status.conditions[0].status)'

section "load balancer"
gcloud compute forwarding-rules list \
  --project="${PROJECT_ID}" \
  --global \
  --format='table(name,IPAddress,IPProtocol,target)'
gcloud compute target-https-proxies describe "${HTTPS_TARGET_PROXY}" \
  --project="${PROJECT_ID}" \
  --format='table(name,urlMap,sslCertificates)'
gcloud compute url-maps describe "${URL_MAP}" \
  --project="${PROJECT_ID}" \
  --format='json(hostRules,pathMatchers)' >/tmp/artway-url-map.json
python3 - <<'PY'
import json
from pathlib import Path

data = json.loads(Path("/tmp/artway-url-map.json").read_text())
for rule in data.get("hostRules", []):
    hosts = ", ".join(rule.get("hosts", []))
    print(f"{rule.get('pathMatcher')}: {hosts}")
PY

section "certificates"
gcloud compute ssl-certificates list \
  --project="${PROJECT_ID}" \
  --global \
  --format='table(name,type,managed.status,managed.domains)'

section "workload identity"
gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
  --project="${PROJECT_ID}" \
  --location=global \
  --workload-identity-pool="${WIF_POOL}" \
  --format='table(name,state,attributeCondition)'
echo "expected repository: ${GITHUB_REPOSITORY}"

section "done"
echo "preflight completed without modifying GCP resources"
