# Multi-stage build for quote-app backend.
#
# Stage 1: Go 1.26 build with module cache (separate layer for faster rebuilds).
# Stage 2: Distroless runtime — no shell, no package manager, ~20MB image,
#          nonroot user. Surface area for supply-chain attacks ~ zero.
#
# Build:
#   docker build -t quote-app:dev backend/
#
# Run (local dev with Cloud SQL Auth Proxy or direct DATABASE_URL):
#   docker run --rm -p 8080:8080 \
#     -e DATABASE_URL='postgres://...' \
#     -e ENV=dev -e DEV_USER_EMAIL=peter@artogo.co \
#     quote-app:dev

FROM golang:1.26-alpine AS builder
WORKDIR /src

# Module cache layer — only invalidates when go.{mod,sum} change.
COPY go.mod go.sum ./
RUN go mod download

# Source layer
COPY . .

# Static binary (no CGO, no glibc dep) so distroless/static works.
# -ldflags="-s -w" strips debug symbols (smaller image).
# -trimpath removes absolute paths from binary (reproducible builds).
ENV CGO_ENABLED=0 GOOS=linux
RUN go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /out/server \
    ./cmd/server

# ─── Runtime ──────────────────────────────────────────────────────────────
FROM gcr.io/distroless/static:nonroot

# Cloud Run injects PORT env var; we listen on whatever it says (config.go).
# EXPOSE is documentation only — Cloud Run reads $PORT regardless.
EXPOSE 8080

COPY --from=builder /out/server /server

USER nonroot:nonroot
ENTRYPOINT ["/server"]
