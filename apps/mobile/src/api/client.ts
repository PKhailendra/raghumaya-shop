import { useAuthStore } from '../store/auth';
import { ApiErrorBody } from './types';

const baseUrl =
  (process.env as Record<string, string | undefined>).EXPO_PUBLIC_API_URL ??
  'https://raghumaya-api-production.up.railway.app/api/v1';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken, setTokens, clearAuth } = useAuthStore.getState();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      await setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  const ok = await refreshPromise;
  if (!ok) {
    await useAuthStore.getState().clearAuth();
  }
  return ok;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  /** skip auto-refresh retry (used by the refresh call itself) */
  noRetry?: boolean;
  idempotencyKey?: string;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const url = new URL(`${baseUrl}${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !opts.noRetry) {
    const refreshed = await doRefresh();
    if (refreshed) {
      return api<T>(path, { ...opts, noRetry: true });
    }
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please log in again.');
  }

  if (!res.ok) {
    let code = 'REQUEST_FAILED';
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body.error) {
        code = body.error.code;
        message = body.error.message;
      }
    } catch {
      /* keep defaults */
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getBaseUrl(): string {
  return baseUrl;
}
