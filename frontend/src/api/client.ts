// Minimal typed fetch wrapper. Centralises:
//   1) base URL (always `/api` — Vite dev proxies to localhost:8080, prod
//      Cloud Run serves frontend + backend from the same origin)
//   2) JSON encoding / Content-Type header
//   3) AbortSignal pass-through (StrictMode-safe useEffect cancellation)
//   4) HTTP-error → typed Error (handler sets `.status` so callers can
//      branch on 401 IAP, 409 conflict, etc.)
//
// Intentionally no auth header: IAP injects the Workspace user via
// `X-Goog-Authenticated-User-Email` upstream of the Go binary, and the
// backend's `auth.UserFromCtx` handler reads it from there. Browser-side
// stays auth-unaware.

export const API_BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ApiFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = opts;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal,
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(API_BASE + path, init);
  if (!res.ok) {
    // Try to surface backend's JSON error message, fall back to status text
    let detail = res.statusText;
    try {
      const errJson = (await res.json()) as { error?: string };
      if (errJson.error) detail = errJson.error;
    } catch {
      /* response wasn't JSON — keep statusText */
    }
    throw new ApiError(`${method} ${path} failed: ${detail}`, res.status);
  }

  // 204 No Content → callers must declare T = void
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
