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
AR_REPOSITORY="${AR_REPOSITORY:-internal}"
SQL_INSTANCE="${SQL_INSTANCE:-artogo-auth-db}"
RUN_SA="${RUN_SA:-quote-app-runner}"
RUN_SA_STAGING="${RUN_SA_STAGING:-quote-app-staging-runner}"
RUN_SA_PROD="${RUN_SA_PROD:-quote-app-prod-runner}"
EXPECTED_DEPLOYER_SA="${EXPECTED_DEPLOYER_SA:-quote-app-staging-deployer}"
DEPLOYER_SA="${DEPLOYER_SA:-${EXPECTED_DEPLOYER_SA}}"
LEGACY_DEPLOYER_SA="${LEGACY_DEPLOYER_SA:-github-actions-deployer}"
WIF_POOL="${WIF_POOL:-github-actions}"
WIF_PROVIDER="${WIF_PROVIDER:-github}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-ARTOGO/Artway-quote-system}"
WIF_DEPLOY_REF="${WIF_DEPLOY_REF:-refs/heads/staging}"
WIF_DEPLOY_WORKFLOW_REF="${WIF_DEPLOY_WORKFLOW_REF:-${GITHUB_REPOSITORY}/.github/workflows/deploy-staging.yml@${WIF_DEPLOY_REF}}"
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

if [[ "${DEPLOYER_SA}" != "${EXPECTED_DEPLOYER_SA}" ]]; then
  cat >&2 <<EOF
DEPLOYER_SA=${DEPLOYER_SA} does not match the staging workflow deployer (${EXPECTED_DEPLOYER_SA}).
Remove the stale DEPLOYER_SA override from ${ENV_FILE}, or update EXPECTED_DEPLOYER_SA and .github/workflows/deploy-staging.yml together.
EOF
  exit 1
fi

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
  local expected_service_account="$2"
  echo "+ gcloud run services describe ${service} | check URL, ingress, and service account"
  local output
  if output="$(gcloud run services describe "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --format=json 2>/dev/null | EXPECTED_INGRESS="internal-and-cloud-load-balancing" EXPECTED_SERVICE_ACCOUNT="${expected_service_account}" python3 -c '
import json
import os
import sys

data = json.load(sys.stdin)
expected = os.environ["EXPECTED_INGRESS"]
expected_service_account = os.environ["EXPECTED_SERVICE_ACCOUNT"]
url = data.get("status", {}).get("url", "")
ingress = data.get("metadata", {}).get("annotations", {}).get("run.googleapis.com/ingress", "")
service_account = data.get("spec", {}).get("template", {}).get("spec", {}).get("serviceAccountName", "")

if not url:
    print("status.url missing", file=sys.stderr)
    sys.exit(1)
if ingress != expected:
    display_ingress = ingress or "<missing>"
    print(f"ingress {display_ingress}, want {expected}", file=sys.stderr)
    sys.exit(1)
if service_account != expected_service_account:
    display_service_account = service_account or "<missing>"
    print(f"serviceAccountName {display_service_account}, want {expected_service_account}", file=sys.stderr)
    sys.exit(1)

print(url)
')" && [[ -n "${output}" ]]; then
    printf '%s\n' "${output}"
    echo "ok: Cloud Run service ${service} ingress internal-and-cloud-load-balancing service account ${expected_service_account}"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "Cloud Run service ${service} ingress internal-and-cloud-load-balancing service account ${expected_service_account}"
  fi
}

check_project_iam_role() {
  local member="$1"
  local role="$2"
  echo "+ gcloud projects get-iam-policy ${PROJECT_ID} | check ${member} ${role}"
  local output
  if output="$(gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null)" && printf '%s\n' "${output}" | grep -qx "${role}"; then
    echo "ok: ${member} has ${role}"
  else
    mark_missing "${member} has ${role}"
  fi
}

check_project_iam_role_absent() {
  local member="$1"
  local role="$2"
  echo "+ gcloud projects get-iam-policy ${PROJECT_ID} | assert absent ${member} ${role}"
  local output
  output="$(gcloud projects get-iam-policy "${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null || true)"
  if printf '%s\n' "${output}" | grep -qx "${role}"; then
    mark_missing "${member} must not have project ${role}"
  else
    echo "ok: ${member} does not have project ${role}"
  fi
}

check_artifact_repository_iam_role() {
  local member="$1"
  local role="$2"
  echo "+ gcloud artifacts repositories get-iam-policy ${AR_REPOSITORY} | check ${member} ${role}"
  local output
  if output="$(gcloud artifacts repositories get-iam-policy "${AR_REPOSITORY}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null)" && printf '%s\n' "${output}" | grep -qx "${role}"; then
    echo "ok: ${member} has ${role} on Artifact Registry ${AR_REPOSITORY}"
  else
    mark_missing "${member} has ${role} on Artifact Registry ${AR_REPOSITORY}"
  fi
}

check_cloud_run_service_iam_role() {
  local service="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud run services get-iam-policy ${service} | check ${member} ${role}"
  local output
  if output="$(gcloud run services get-iam-policy "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null)" && printf '%s\n' "${output}" | grep -qx "${role}"; then
    echo "ok: ${member} has ${role} on Cloud Run ${service}"
  else
    mark_missing "${member} has ${role} on Cloud Run ${service}"
  fi
}

check_cloud_run_service_iam_role_absent() {
  local service="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud run services get-iam-policy ${service} | assert absent ${member} ${role}"
  local output
  output="$(gcloud run services get-iam-policy "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null || true)"
  if printf '%s\n' "${output}" | grep -qx "${role}"; then
    mark_missing "${member} must not have ${role} on Cloud Run ${service}"
  else
    echo "ok: ${member} does not have ${role} on Cloud Run ${service}"
  fi
}

check_service_account_iam_role() {
  local service_account_email="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud iam service-accounts get-iam-policy ${service_account_email} | check ${member} ${role}"
  local output
  if output="$(gcloud iam service-accounts get-iam-policy "${service_account_email}" \
    --project="${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null)" && printf '%s\n' "${output}" | grep -qx "${role}"; then
    echo "ok: ${member} has ${role} on ${service_account_email}"
  else
    mark_missing "${member} has ${role} on ${service_account_email}"
  fi
}

check_service_account_iam_role_absent() {
  local service_account_email="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud iam service-accounts get-iam-policy ${service_account_email} | assert absent ${member} ${role}"
  if ! gcloud iam service-accounts describe "${service_account_email}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "ok: service account absent: ${service_account_email}"
    return
  fi
  local output
  output="$(gcloud iam service-accounts get-iam-policy "${service_account_email}" \
    --project="${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null || true)"
  if printf '%s\n' "${output}" | grep -qx "${role}"; then
    mark_missing "${member} must not have ${role} on ${service_account_email}"
  else
    echo "ok: ${member} does not have ${role} on ${service_account_email}"
  fi
}

check_secret_iam_role() {
  local secret_name="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud secrets get-iam-policy ${secret_name} | check ${member} ${role}"
  local output
  if output="$(gcloud secrets get-iam-policy "${secret_name}" \
    --project="${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null)" && printf '%s\n' "${output}" | grep -qx "${role}"; then
    echo "ok: ${member} has ${role} on ${secret_name}"
  else
    mark_missing "${member} has ${role} on ${secret_name}"
  fi
}

check_secret_iam_role_absent() {
  local secret_name="$1"
  local member="$2"
  local role="$3"
  echo "+ gcloud secrets get-iam-policy ${secret_name} | assert absent ${member} ${role}"
  local output
  output="$(gcloud secrets get-iam-policy "${secret_name}" \
    --project="${PROJECT_ID}" \
    --flatten='bindings[].members' \
    --filter="bindings.role=${role} AND bindings.members=${member}" \
    --format='value(bindings.role)' 2>/dev/null || true)"
  if printf '%s\n' "${output}" | grep -qx "${role}"; then
    mark_missing "${member} must not have ${role} on ${secret_name}"
  else
    echo "ok: ${member} does not have ${role} on ${secret_name}"
  fi
}

check_service_account_wif_binding_absent() {
  local service_account_email="$1"
  local principal="$2"
  local label="$3"
  echo "+ gcloud iam service-accounts get-iam-policy ${service_account_email} | assert absent ${label}"
  if ! gcloud iam service-accounts describe "${service_account_email}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "ok: legacy service account absent: ${service_account_email}"
    return
  fi
  if gcloud iam service-accounts get-iam-policy "${service_account_email}" \
    --project="${PROJECT_ID}" \
    --format=json | grep -Fq "${principal}"; then
    mark_missing "${service_account_email} must not have ${label}"
  else
    echo "ok: ${service_account_email} has no ${label}"
  fi
}

check_wif_provider_attribute_mapping() {
  echo "+ gcloud iam workload-identity-pools providers describe ${WIF_PROVIDER} | check GitHub attributes"
  local output
  if output="$(gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER}" \
    --project="${PROJECT_ID}" \
    --location=global \
    --workload-identity-pool="${WIF_POOL}" \
    --format=json 2>/dev/null | python3 -c '
import json
import sys

data = json.load(sys.stdin)
mapping = data.get("attributeMapping", {})
expected = {
    "google.subject": "assertion.sub",
    "attribute.repository": "assertion.repository",
    "attribute.ref": "assertion.ref",
    "attribute.workflow_ref": "assertion.workflow_ref",
}
missing = [key for key, value in expected.items() if mapping.get(key) != value]
if missing:
    print("missing or mismatched mappings: " + ", ".join(missing), file=sys.stderr)
    sys.exit(1)
')"; then
    echo "ok: WIF provider maps repository/ref/workflow_ref"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "WIF provider maps repository/ref/workflow_ref"
  fi
}

wif_repository_principal() {
  printf "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.repository/%s" \
    "${project_number}" \
    "${WIF_POOL}" \
    "${GITHUB_REPOSITORY}"
}

wif_deploy_workflow_principal() {
  printf "principalSet://iam.googleapis.com/projects/%s/locations/global/workloadIdentityPools/%s/attribute.workflow_ref/%s" \
    "${project_number}" \
    "${WIF_POOL}" \
    "${WIF_DEPLOY_WORKFLOW_REF}"
}

check_service_account_wif_binding() {
  local service_account_email="$1"
  local principal="$2"
  local label="$3"
  echo "+ gcloud iam service-accounts get-iam-policy ${service_account_email} | check ${label}"
  local output
  if output="$(gcloud iam service-accounts get-iam-policy "${service_account_email}" \
    --project="${PROJECT_ID}" \
    --format=json | PRINCIPAL="${principal}" python3 -c '
import json
import os
import sys

data = json.load(sys.stdin)
principal = os.environ["PRINCIPAL"]
found = False

for binding in data.get("bindings", []):
    if binding.get("role") != "roles/iam.workloadIdentityUser":
        continue
    if principal not in binding.get("members", []):
        continue
    if "condition" not in binding:
        found = True

if not found:
    print("expected unconditioned workflow_ref WIF binding not found", file=sys.stderr)
    sys.exit(1)
')"; then
    echo "ok: ${label}"
  else
    if [[ -n "${output}" ]]; then
      printf '%s\n' "${output}" | head -n 1 >&2
    fi
    mark_missing "${label}"
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
check_cmd "staging runtime service account" gcloud iam service-accounts describe "${RUN_SA_STAGING}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}"
check_cmd "prod runtime service account" gcloud iam service-accounts describe "${RUN_SA_PROD}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}"
check_cmd "deployer service account" gcloud iam service-accounts describe "${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" --project="${PROJECT_ID}"
staging_run_member="serviceAccount:${RUN_SA_STAGING}@${PROJECT_ID}.iam.gserviceaccount.com"
prod_run_member="serviceAccount:${RUN_SA_PROD}@${PROJECT_ID}.iam.gserviceaccount.com"
deployer_member="serviceAccount:${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
legacy_run_member="serviceAccount:${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
staging_run_sa_email="${RUN_SA_STAGING}@${PROJECT_ID}.iam.gserviceaccount.com"
prod_run_sa_email="${RUN_SA_PROD}@${PROJECT_ID}.iam.gserviceaccount.com"
legacy_run_sa_email="${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
check_project_iam_role "${staging_run_member}" "roles/cloudsql.client"
check_project_iam_role "${prod_run_member}" "roles/cloudsql.client"
check_project_iam_role_absent "${legacy_run_member}" "roles/cloudsql.client"
for role in \
  roles/cloudsql.client \
  roles/serviceusage.serviceUsageConsumer; do
  check_project_iam_role "${deployer_member}" "${role}"
done
check_project_iam_role_absent "${deployer_member}" "roles/run.admin"
check_project_iam_role_absent "${deployer_member}" "roles/run.developer"
check_project_iam_role_absent "${deployer_member}" "roles/iam.serviceAccountUser"
check_artifact_repository_iam_role "${deployer_member}" "roles/artifactregistry.writer"
check_cloud_run_service_iam_role "${SERVICE_STAGING}" "${deployer_member}" "roles/run.developer"
check_cloud_run_service_iam_role_absent "${SERVICE_PROD}" "${deployer_member}" "roles/run.developer"
check_service_account_iam_role "${staging_run_sa_email}" "${deployer_member}" "roles/iam.serviceAccountUser"
check_service_account_iam_role_absent "${prod_run_sa_email}" "${deployer_member}" "roles/iam.serviceAccountUser"
check_service_account_iam_role_absent "${legacy_run_sa_email}" "${deployer_member}" "roles/iam.serviceAccountUser"
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
check_secret_iam_role "quote-app-staging-database-url" "${staging_run_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role_absent "quote-app-prod-database-url" "${staging_run_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role "quote-app-prod-database-url" "${prod_run_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role_absent "quote-app-staging-database-url" "${prod_run_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role "quote-app-staging-database-url" "${deployer_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role_absent "quote-app-prod-database-url" "${deployer_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role_absent "quote-app-staging-database-url" "${legacy_run_member}" "roles/secretmanager.secretAccessor"
check_secret_iam_role_absent "quote-app-prod-database-url" "${legacy_run_member}" "roles/secretmanager.secretAccessor"

section "cloud run"
check_cloud_run_service "${SERVICE_STAGING}" "${staging_run_sa_email}"
check_cloud_run_service "${SERVICE_PROD}" "${prod_run_sa_email}"

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
  repository_principal="$(wif_repository_principal)"
  workflow_principal="$(wif_deploy_workflow_principal)"
  check_wif_provider_attribute_mapping
  check_service_account_wif_binding "${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" "${workflow_principal}" "WIF deployer workflow_ref ${WIF_DEPLOY_WORKFLOW_REF}"
  check_service_account_wif_binding_absent "${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" "${repository_principal}" "repository-wide WIF binding for ${GITHUB_REPOSITORY}"
  if [[ "${LEGACY_DEPLOYER_SA}" != "${DEPLOYER_SA}" ]]; then
    check_service_account_wif_binding_absent "${LEGACY_DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" "${repository_principal}" "repository-wide WIF binding for ${GITHUB_REPOSITORY}"
    check_service_account_wif_binding_absent "${LEGACY_DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com" "${workflow_principal}" "workflow_ref WIF binding for ${WIF_DEPLOY_WORKFLOW_REF}"
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
