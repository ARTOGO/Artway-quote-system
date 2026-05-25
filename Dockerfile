# Cloud Run production image for the single-service ARTWAY quote app.
#
# Build context must be the repository root:
#   docker build -t quote-app:dev .
#
# The image builds the React frontend, copies frontend/dist into the Go embed
# directory, then compiles a static Go binary that serves both SPA and /api.

FROM node:24-alpine AS frontend-builder
WORKDIR /src/frontend

RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

FROM golang:1.26-alpine AS backend-builder
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN rm -rf internal/static/dist
COPY --from=frontend-builder /src/frontend/dist ./internal/static/dist

ENV CGO_ENABLED=0 GOOS=linux
RUN go build \
    -ldflags="-s -w -extldflags '-static'" \
    -trimpath \
    -o /out/server \
    ./cmd/server

FROM gcr.io/distroless/static:nonroot

EXPOSE 8080
COPY --from=backend-builder /out/server /server

USER nonroot:nonroot
ENTRYPOINT ["/server"]
