#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infra/phase-a.env}"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

APPLY=0
for arg in "$@"; do
  case "${arg}" in
    --apply) APPLY=1 ;;
    *)
      echo "unknown argument: ${arg}" >&2
      exit 2
      ;;
  esac
done

PROJECT_ID="${PROJECT_ID:-artogo-v2}"
REGION="${REGION:-asia-east1}"
AR_REPOSITORY="${AR_REPOSITORY:-internal}"
IMAGE_NAME="${IMAGE_NAME:-quote-app}"
DEFAULT_IMAGE_TAG="$(git -C "${ROOT_DIR}" rev-parse --short HEAD)"
if [[ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]]; then
  DEFAULT_IMAGE_TAG="${DEFAULT_IMAGE_TAG}-dirty"
fi
IMAGE_TAG="${IMAGE_TAG:-${DEFAULT_IMAGE_TAG}}"

SQL_INSTANCE="${SQL_INSTANCE:-artogo-auth-db}"
DB_STAGING="${DB_STAGING:-quotes_staging}"
DB_PROD="${DB_PROD:-quotes_prod}"
DB_USER_STAGING="${DB_USER_STAGING:-quote_app_staging}"
DB_USER_PROD="${DB_USER_PROD:-quote_app_prod}"
DB_ADMIN_USER="${DB_ADMIN_USER:-postgres}"
DB_ADMIN_PASSWORD_SECRET="${DB_ADMIN_PASSWORD_SECRET:-}"

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
HOST_STAGING="${HOST_STAGING:-quote-staging.artogo.co}"
HOST_PROD="${HOST_PROD:-quote.artogo.co}"

SERVICE_STAGING="${SERVICE_STAGING:-quote-app-staging}"
SERVICE_PROD="${SERVICE_PROD:-quote-app-prod}"

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
RUN_SA_EMAIL="${RUN_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA_STAGING_EMAIL="${RUN_SA_STAGING}@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA_PROD_EMAIL="${RUN_SA_PROD}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA_EMAIL="${DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
LEGACY_DEPLOYER_SA_EMAIL="${LEGACY_DEPLOYER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

if [[ "${DEPLOYER_SA}" != "${EXPECTED_DEPLOYER_SA}" ]]; then
  cat >&2 <<EOF
DEPLOYER_SA=${DEPLOYER_SA} does not match the staging workflow deployer (${EXPECTED_DEPLOYER_SA}).
Remove the stale DEPLOYER_SA override from ${ENV_FILE}, or update EXPECTED_DEPLOYER_SA and .github/workflows/deploy-staging.yml together.
EOF
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

run() {
  echo "+ $*" >&2
  if [[ "${APPLY}" -eq 1 ]]; then
    "$@"
  fi
}

section() {
  printf '\n== %s ==\n' "$1" >&2
}

secret_exists() {
  gcloud secrets describe "$1" --project="${PROJECT_ID}" >/dev/null 2>&1
}

secret_value_or_create_password() {
  local secret_name="$1"
  if secret_exists "${secret_name}"; then
    if [[ "${APPLY}" -eq 1 ]]; then
      gcloud secrets versions access latest --secret="${secret_name}" --project="${PROJECT_ID}"
    else
      printf '<existing-secret:%s>' "${secret_name}"
    fi
    return
  fi

  local generated
  if [[ "${APPLY}" -eq 1 ]]; then
    generated="$(openssl rand -base64 36 | tr -d '\n')"
  else
    generated="<generated-secret:${secret_name}>"
  fi
  run gcloud secrets create "${secret_name}" \
    --project="${PROJECT_ID}" \
    --replication-policy=user-managed \
    --locations="${REGION}"
  if [[ "${APPLY}" -eq 1 ]]; then
    printf '%s' "${generated}" | gcloud secrets versions add "${secret_name}" \
      --project="${PROJECT_ID}" \
      --data-file=-
  fi
  printf '%s' "${generated}"
}

database_url() {
  local user="$1"
  local password="$2"
  local database="$3"
  local connection_name="$4"
  DB_USER="${user}" DB_PASSWORD="${password}" DB_NAME="${database}" INSTANCE_CONNECTION="${connection_name}" python3 - <<'PY'
import os
from urllib.parse import quote

user = quote(os.environ["DB_USER"], safe="")
password = quote(os.environ["DB_PASSWORD"], safe="")
db = quote(os.environ["DB_NAME"], safe="")
host = quote("/cloudsql/" + os.environ["INSTANCE_CONNECTION"], safe="/:")
print(f"postgres://{user}:{password}@/{db}?host={host}")
PY
}

sql_ident() {
  local value="$1"
  SQL_VALUE="${value}" python3 - <<'PY'
import os

value = os.environ["SQL_VALUE"]
print('"' + value.replace('"', '""') + '"')
PY
}

sql_literal() {
  local value="$1"
  SQL_VALUE="${value}" python3 - <<'PY'
import os

value = os.environ["SQL_VALUE"]
print("'" + value.replace("'", "''") + "'")
PY
}

create_or_update_secret() {
  local secret_name="$1"
  local value="$2"
  if ! secret_exists "${secret_name}"; then
    run gcloud secrets create "${secret_name}" \
      --project="${PROJECT_ID}" \
      --replication-policy=user-managed \
      --locations="${REGION}"
  fi
  if [[ "${APPLY}" -eq 1 ]]; then
    printf '%s' "${value}" | gcloud secrets versions add "${secret_name}" \
      --project="${PROJECT_ID}" \
      --data-file=-
  else
    echo "+ add new version to secret ${secret_name}"
  fi
}

grant_secret_accessor() {
  local secret_name="$1"
  local member_email="$2"
  run gcloud secrets add-iam-policy-binding "${secret_name}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${member_email}" \
    --role=roles/secretmanager.secretAccessor \
    --condition=None
}

revoke_secret_accessor() {
  local secret_name="$1"
  local member_email="$2"
  run gcloud secrets remove-iam-policy-binding "${secret_name}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${member_email}" \
    --role=roles/secretmanager.secretAccessor || true
}

grant_artifact_repository_role() {
  local member_email="$1"
  local role="$2"
  run gcloud artifacts repositories add-iam-policy-binding "${AR_REPOSITORY}" \
    --project="${PROJECT_ID}" \
    --location="${REGION}" \
    --member="serviceAccount:${member_email}" \
    --role="${role}" \
    --condition=None
}

grant_cloud_run_service_role() {
  local service="$1"
  local member_email="$2"
  local role="$3"
  run gcloud run services add-iam-policy-binding "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --member="serviceAccount:${member_email}" \
    --role="${role}" \
    --condition=None
}

grant_project_role() {
  local member_email="$1"
  local role="$2"
  run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${member_email}" \
    --role="${role}" \
    --condition=None
}

revoke_project_role() {
  local member_email="$1"
  local role="$2"
  run gcloud projects remove-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${member_email}" \
    --role="${role}" \
    --condition=None || true
}

ensure_github_provider_attribute_mapping() {
  run gcloud iam workload-identity-pools providers update-oidc "${WIF_PROVIDER}" \
    --project="${PROJECT_ID}" \
    --location=global \
    --workload-identity-pool="${WIF_POOL}" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref" \
    --attribute-condition="assertion.repository_owner == 'ARTOGO'"
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

sql_user_exists() {
  local user="$1"
  gcloud sql users list \
    --project="${PROJECT_ID}" \
    --instance="${SQL_INSTANCE}" \
    --format='value(name)' | grep -qx "${user}"
}

ensure_sql_user() {
  local user="$1"
  local password="$2"
  if sql_user_exists "${user}"; then
    echo "+ gcloud sql users set-password ${user} --project=${PROJECT_ID} --instance=${SQL_INSTANCE} --password=<redacted>" >&2
    if [[ "${APPLY}" -eq 1 ]]; then
      gcloud sql users set-password "${user}" \
        --project="${PROJECT_ID}" \
        --instance="${SQL_INSTANCE}" \
        --password="${password}"
    fi
  else
    echo "+ gcloud sql users create ${user} --project=${PROJECT_ID} --instance=${SQL_INSTANCE} --password=<redacted>" >&2
    if [[ "${APPLY}" -eq 1 ]]; then
      gcloud sql users create "${user}" \
        --project="${PROJECT_ID}" \
        --instance="${SQL_INSTANCE}" \
        --password="${password}"
    fi
  fi
}

ensure_database() {
  local database="$1"
  if gcloud sql databases list \
    --project="${PROJECT_ID}" \
    --instance="${SQL_INSTANCE}" \
    --format='value(name)' | grep -qx "${database}"; then
    echo "database exists: ${database}"
  else
    run gcloud sql databases create "${database}" \
      --project="${PROJECT_ID}" \
      --instance="${SQL_INSTANCE}"
  fi
}

resolve_db_admin_password() {
  if [[ -n "${DB_ADMIN_PASSWORD:-}" ]]; then
    printf '%s' "${DB_ADMIN_PASSWORD}"
    return
  fi

  if [[ -n "${DB_ADMIN_PASSWORD_SECRET}" ]]; then
    gcloud secrets versions access latest \
      --secret="${DB_ADMIN_PASSWORD_SECRET}" \
      --project="${PROJECT_ID}"
    return
  fi

  echo "DB admin password is required for --apply." >&2
  echo "Set DB_ADMIN_PASSWORD or DB_ADMIN_PASSWORD_SECRET in infra/phase-a.env." >&2
  exit 1
}

preflight_apply_prereqs() {
  if [[ "${APPLY}" -ne 1 ]]; then
    return
  fi

  require_cmd psql
  DB_ADMIN_PASSWORD_VALUE="$(resolve_db_admin_password)"
  if [[ -z "${DB_ADMIN_PASSWORD_VALUE}" ]]; then
    echo "DB admin password resolved to an empty value." >&2
    exit 1
  fi
}

admin_psql() {
  local database="$1"
  PGPASSWORD="${DB_ADMIN_PASSWORD_VALUE}" gcloud sql connect "${SQL_INSTANCE}" \
    --project="${PROJECT_ID}" \
    --user="${DB_ADMIN_USER}" \
    --database="${database}" \
    --quiet
}

ensure_database_privileges() {
  local database="$1"
  local app_user="$2"

  echo "+ grant ${app_user} ownership/privileges on ${database} public schema" >&2
  if [[ "${APPLY}" -ne 1 ]]; then
    return
  fi

  if [[ -z "${DB_ADMIN_PASSWORD_VALUE:-}" ]]; then
    echo "DB admin password was not preflighted before privilege hardening." >&2
    exit 1
  fi

  local database_ident app_user_ident app_user_literal admin_user_ident grant_membership_sql
  database_ident="$(sql_ident "${database}")"
  app_user_ident="$(sql_ident "${app_user}")"
  app_user_literal="$(sql_literal "${app_user}")"
  admin_user_ident="$(sql_ident "${DB_ADMIN_USER}")"
  grant_membership_sql=""
  if [[ "${DB_ADMIN_USER}" != "${app_user}" ]]; then
    grant_membership_sql="GRANT ${app_user_ident} TO ${admin_user_ident};"
  fi

  admin_psql "postgres" <<SQL
\set ON_ERROR_STOP on
DO \$do\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${app_user_literal}) THEN
    RAISE EXCEPTION 'role % does not exist', ${app_user_literal};
  END IF;
END
\$do\$;
${grant_membership_sql}
ALTER DATABASE ${database_ident} OWNER TO ${app_user_ident};
GRANT CONNECT, TEMPORARY ON DATABASE ${database_ident} TO ${app_user_ident};
SQL

  admin_psql "${database}" <<SQL
\set ON_ERROR_STOP on
DO \$do\$
DECLARE
  target_role text := ${app_user_literal};
  rel record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
    RAISE EXCEPTION 'role % does not exist', target_role;
  END IF;

  EXECUTE format('ALTER SCHEMA public OWNER TO %I', target_role);
  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', target_role);
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    target_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
    target_role
  );
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', target_role);
  EXECUTE format('GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO %I', target_role);

  FOR rel IN
    SELECT c.oid::regclass AS name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'S')
  LOOP
    IF rel.relkind = 'S' THEN
      EXECUTE format('ALTER SEQUENCE %s OWNER TO %I', rel.name, target_role);
    ELSE
      EXECUTE format('ALTER TABLE %s OWNER TO %I', rel.name, target_role);
    END IF;
  END LOOP;
END
\$do\$;
SQL
}

ensure_service_account() {
  local account="$1"
  local display_name="$2"
  if gcloud iam service-accounts describe "${account}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --project="${PROJECT_ID}" >/dev/null 2>&1; then
    echo "service account exists: ${account}@${PROJECT_ID}.iam.gserviceaccount.com"
  else
    run gcloud iam service-accounts create "${account}" \
      --project="${PROJECT_ID}" \
      --display-name="${display_name}"
  fi
}

ensure_neg_and_backend() {
  local service="$1"
  local neg="$2"
  local backend="$3"

  if gcloud compute network-endpoint-groups describe "${neg}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" >/dev/null 2>&1; then
    echo "NEG exists: ${neg}"
  else
    run gcloud compute network-endpoint-groups create "${neg}" \
      --project="${PROJECT_ID}" \
      --region="${REGION}" \
      --network-endpoint-type=serverless \
      --cloud-run-service="${service}"
  fi

  if gcloud compute backend-services describe "${backend}" \
    --project="${PROJECT_ID}" \
    --global >/dev/null 2>&1; then
    echo "backend service exists: ${backend}"
  else
    run gcloud compute backend-services create "${backend}" \
      --project="${PROJECT_ID}" \
      --global \
      --load-balancing-scheme=EXTERNAL \
      --protocol=HTTP \
      --port-name=http \
      --timeout=30s
  fi

  if gcloud compute backend-services describe "${backend}" \
    --project="${PROJECT_ID}" \
    --global \
    --format='value(backends[].group)' 2>/dev/null | grep -q "/${neg}$"; then
    echo "backend already has NEG: ${backend} -> ${neg}"
  else
    run gcloud compute backend-services add-backend "${backend}" \
      --project="${PROJECT_ID}" \
      --global \
      --network-endpoint-group="${neg}" \
      --network-endpoint-group-region="${REGION}"
  fi
}

ensure_url_map_host() {
  local host="$1"
  local matcher="$2"
  local backend="$3"

  local output
  if output="$(gcloud compute url-maps describe "${URL_MAP}" \
    --project="${PROJECT_ID}" \
    --format='json(hostRules,pathMatchers)' | HOST_TO_FIND="${host}" EXPECTED_MATCHER="${matcher}" EXPECTED_BACKEND="${backend}" python3 -c '
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
    sys.exit(10)

actual_matcher = host_rule.get("pathMatcher", "")
if actual_matcher != expected_matcher:
    print(f"{host} uses pathMatcher {display(actual_matcher)}, want {expected_matcher}", file=sys.stderr)
    sys.exit(20)

path_matcher = next((p for p in data.get("pathMatchers", []) if p.get("name") == expected_matcher), None)
if not path_matcher:
    print(f"path matcher missing: {expected_matcher}", file=sys.stderr)
    sys.exit(21)

actual_backend = path_matcher.get("defaultService", "").rstrip("/").split("/")[-1]
if actual_backend != expected_backend:
    print(f"{expected_matcher} defaultService {display(actual_backend)}, want {expected_backend}", file=sys.stderr)
    sys.exit(22)
' 2>&1)"; then
    echo "URL map host target exists: ${host} -> ${backend}"
  else
    local rc=$?
    if [[ "${rc}" -eq 10 ]]; then
      run gcloud compute url-maps add-path-matcher "${URL_MAP}" \
        --project="${PROJECT_ID}" \
        --path-matcher-name="${matcher}" \
        --default-service="${backend}" \
        --new-hosts="${host}"
    else
      if [[ -n "${output}" ]]; then
        printf '%s\n' "${output}" >&2
      fi
      echo "URL map host target mismatch: ${host} must route via ${matcher} to ${backend}" >&2
      exit 1
    fi
  fi
}

require_cmd gcloud
require_cmd docker
require_cmd git
require_cmd openssl
require_cmd python3

if [[ "${APPLY}" -ne 1 ]]; then
  cat <<EOF
Dry run only. Re-run with --apply to modify GCP resources.

Target:
  project: ${PROJECT_ID}
  region: ${REGION}
  image: ${IMAGE_URI}
  SQL instance: ${SQL_INSTANCE}
  Cloud Run: ${SERVICE_STAGING}, ${SERVICE_PROD}
  hosts: ${HOST_STAGING}, ${HOST_PROD}
EOF
fi

section "project metadata"
project_number="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
instance_connection="$(gcloud sql instances describe "${SQL_INSTANCE}" --project="${PROJECT_ID}" --format='value(connectionName)')"
iap_sa="service-${project_number}@gcp-sa-iap.iam.gserviceaccount.com"
echo "project number: ${project_number}"
echo "SQL connection: ${instance_connection}"
echo "IAP service account: ${iap_sa}"

section "apply preflight"
preflight_apply_prereqs

section "service agents"
run gcloud beta services identity create \
  --project="${PROJECT_ID}" \
  --service=iap.googleapis.com || true

section "service accounts"
ensure_service_account "${RUN_SA_STAGING}" "Quote App Cloud Run staging runtime"
ensure_service_account "${RUN_SA_PROD}" "Quote App Cloud Run prod runtime"
ensure_service_account "${DEPLOYER_SA}" "Quote App GitHub Actions staging deployer"
for runtime_sa_email in "${RUN_SA_STAGING_EMAIL}" "${RUN_SA_PROD_EMAIL}"; do
  grant_project_role "${runtime_sa_email}" roles/cloudsql.client
done
for role in \
  roles/cloudsql.client \
  roles/serviceusage.serviceUsageConsumer; do
  grant_project_role "${DEPLOYER_SA_EMAIL}" "${role}"
done
for role in \
  roles/run.admin \
  roles/run.developer \
  roles/iam.serviceAccountUser; do
  revoke_project_role "${DEPLOYER_SA_EMAIL}" "${role}"
done
run gcloud iam service-accounts add-iam-policy-binding "${RUN_SA_STAGING_EMAIL}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_SA_EMAIL}" \
  --role=roles/iam.serviceAccountUser \
  --condition=None
run gcloud iam service-accounts remove-iam-policy-binding "${RUN_SA_PROD_EMAIL}" \
  --project="${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOYER_SA_EMAIL}" \
  --role=roles/iam.serviceAccountUser || true
if gcloud iam service-accounts describe "${RUN_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  run gcloud iam service-accounts remove-iam-policy-binding "${RUN_SA_EMAIL}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOYER_SA_EMAIL}" \
    --role=roles/iam.serviceAccountUser || true
fi

section "cloud sql databases and secrets"
ensure_database "${DB_STAGING}"
ensure_database "${DB_PROD}"
staging_password="$(secret_value_or_create_password quote-app-staging-db-password)"
prod_password="$(secret_value_or_create_password quote-app-prod-db-password)"
ensure_sql_user "${DB_USER_STAGING}" "${staging_password}"
ensure_sql_user "${DB_USER_PROD}" "${prod_password}"
ensure_database_privileges "${DB_STAGING}" "${DB_USER_STAGING}"
ensure_database_privileges "${DB_PROD}" "${DB_USER_PROD}"
create_or_update_secret "quote-app-staging-database-url" "$(database_url "${DB_USER_STAGING}" "${staging_password}" "${DB_STAGING}" "${instance_connection}")"
create_or_update_secret "quote-app-prod-database-url" "$(database_url "${DB_USER_PROD}" "${prod_password}" "${DB_PROD}" "${instance_connection}")"
grant_secret_accessor "quote-app-staging-database-url" "${RUN_SA_STAGING_EMAIL}"
grant_secret_accessor "quote-app-prod-database-url" "${RUN_SA_PROD_EMAIL}"
grant_secret_accessor "quote-app-staging-database-url" "${DEPLOYER_SA_EMAIL}"
revoke_secret_accessor "quote-app-prod-database-url" "${RUN_SA_STAGING_EMAIL}"
revoke_secret_accessor "quote-app-staging-database-url" "${RUN_SA_PROD_EMAIL}"
revoke_secret_accessor "quote-app-prod-database-url" "${DEPLOYER_SA_EMAIL}"

section "build and push image"
run gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run docker buildx build \
  --platform=linux/amd64 \
  --provenance=false \
  --push \
  -t "${IMAGE_URI}" \
  "${ROOT_DIR}"

section "deploy cloud run"
for env_name in staging prod; do
  if [[ "${env_name}" == "staging" ]]; then
    service="${SERVICE_STAGING}"
    db_secret="quote-app-staging-database-url"
    service_account="${RUN_SA_STAGING_EMAIL}"
    min_instances=0
  else
    service="${SERVICE_PROD}"
    db_secret="quote-app-prod-database-url"
    service_account="${RUN_SA_PROD_EMAIL}"
    min_instances=1
  fi

  run gcloud run deploy "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --image="${IMAGE_URI}" \
    --service-account="${service_account}" \
    --add-cloudsql-instances="${instance_connection}" \
    --ingress=internal-and-cloud-load-balancing \
    --no-allow-unauthenticated \
    --min-instances="${min_instances}" \
    --set-env-vars="ENV=${env_name}" \
    --set-secrets="DATABASE_URL=${db_secret}:latest"

  run gcloud run services add-iam-policy-binding "${service}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --member="serviceAccount:${iap_sa}" \
    --role=roles/run.invoker
done

section "legacy runtime database access cleanup"
if gcloud iam service-accounts describe "${RUN_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  revoke_project_role "${RUN_SA_EMAIL}" roles/cloudsql.client
  revoke_secret_accessor "quote-app-staging-database-url" "${RUN_SA_EMAIL}"
  revoke_secret_accessor "quote-app-prod-database-url" "${RUN_SA_EMAIL}"
else
  echo "legacy runtime service account absent: ${RUN_SA_EMAIL}"
fi

section "staging deployer access"
grant_artifact_repository_role "${DEPLOYER_SA_EMAIL}" roles/artifactregistry.writer
grant_cloud_run_service_role "${SERVICE_STAGING}" "${DEPLOYER_SA_EMAIL}" roles/run.developer

section "load balancer backends"
ensure_neg_and_backend "${SERVICE_STAGING}" "quote-app-staging-neg" "quote-app-staging-backend"
ensure_neg_and_backend "${SERVICE_PROD}" "quote-app-prod-neg" "quote-app-prod-backend"
ensure_url_map_host "${HOST_STAGING}" "quote-app-staging" "quote-app-staging-backend"
ensure_url_map_host "${HOST_PROD}" "quote-app-prod" "quote-app-prod-backend"

section "managed certificate"
if gcloud compute ssl-certificates describe "${CERT_NAME}" --project="${PROJECT_ID}" --global >/dev/null 2>&1; then
  echo "certificate exists: ${CERT_NAME}"
else
  run gcloud compute ssl-certificates create "${CERT_NAME}" \
    --project="${PROJECT_ID}" \
    --global \
    --domains="${HOST_STAGING},${HOST_PROD}"
fi
cat <<EOF

Manual review required before certificate attachment:
  gcloud compute target-https-proxies describe ${HTTPS_TARGET_PROXY} --project=${PROJECT_ID}
  gcloud compute target-https-proxies update ${HTTPS_TARGET_PROXY} --project=${PROJECT_ID} --ssl-certificates=<existing certs>,${CERT_NAME}

Manual DNS required in Cloudflare:
  ${HOST_STAGING} A 35.241.57.95
  ${HOST_PROD} A 35.241.57.95
EOF

section "IAP"
for backend in quote-app-staging-backend quote-app-prod-backend; do
  if [[ -n "${IAP_OAUTH_CLIENT_ID:-}" && -n "${IAP_OAUTH_CLIENT_SECRET:-}" ]]; then
    echo "+ gcloud compute backend-services update ${backend} --project=${PROJECT_ID} --global --iap=enabled,oauth2-client-id=<redacted>,oauth2-client-secret=<redacted>" >&2
    if [[ "${APPLY}" -eq 1 ]]; then
      gcloud compute backend-services update "${backend}" \
        --project="${PROJECT_ID}" \
        --global \
        --iap="enabled,oauth2-client-id=${IAP_OAUTH_CLIENT_ID},oauth2-client-secret=${IAP_OAUTH_CLIENT_SECRET}"
    fi
  else
    run gcloud compute backend-services update "${backend}" \
      --project="${PROJECT_ID}" \
      --global \
      --iap=enabled
  fi
  run gcloud iap web add-iam-policy-binding \
    --project="${PROJECT_ID}" \
    --resource-type=backend-services \
    --service="${backend}" \
    --member=domain:artogo.co \
    --role=roles/iap.httpsResourceAccessor
done

section "WIF binding for staging GitHub Actions"
repository_principal="$(wif_repository_principal)"
workflow_principal="$(wif_deploy_workflow_principal)"
ensure_github_provider_attribute_mapping
run gcloud iam service-accounts remove-iam-policy-binding "${DEPLOYER_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="${repository_principal}" \
  --condition=None || true
run gcloud iam service-accounts remove-iam-policy-binding "${DEPLOYER_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="${workflow_principal}" \
  --condition=None || true
run gcloud iam service-accounts add-iam-policy-binding "${DEPLOYER_SA_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="${workflow_principal}" \
  --condition=None

if [[ "${LEGACY_DEPLOYER_SA}" != "${DEPLOYER_SA}" ]] && gcloud iam service-accounts describe "${LEGACY_DEPLOYER_SA_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  section "legacy deployer cleanup"
  for legacy_principal in "${repository_principal}" "${workflow_principal}"; do
    run gcloud iam service-accounts remove-iam-policy-binding "${LEGACY_DEPLOYER_SA_EMAIL}" \
      --project="${PROJECT_ID}" \
      --role=roles/iam.workloadIdentityUser \
      --member="${legacy_principal}" \
      --condition=None || true
  done
  for runtime_sa_email in "${RUN_SA_STAGING_EMAIL}" "${RUN_SA_PROD_EMAIL}" "${RUN_SA_EMAIL}"; do
    if gcloud iam service-accounts describe "${runtime_sa_email}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
      run gcloud iam service-accounts remove-iam-policy-binding "${runtime_sa_email}" \
        --project="${PROJECT_ID}" \
        --member="serviceAccount:${LEGACY_DEPLOYER_SA_EMAIL}" \
        --role=roles/iam.serviceAccountUser || true
    fi
  done
  run gcloud secrets remove-iam-policy-binding "quote-app-staging-database-url" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${LEGACY_DEPLOYER_SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor || true
  run gcloud secrets remove-iam-policy-binding "quote-app-prod-database-url" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${LEGACY_DEPLOYER_SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor || true
fi

section "done"
echo "Phase A setup script completed"
