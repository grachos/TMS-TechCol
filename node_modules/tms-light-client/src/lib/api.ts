/**
 * Light TMS - API client.
 *
 * Thin fetch wrapper that attaches the JWT from the auth store and normalises
 * errors. On 401 it clears the session so the app falls back to the login page.
 */

import { useAuthStore } from '../store/auth';

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Query params appended to the URL. */
  query?: Record<string, string | number | boolean | null | undefined>;
  /** When true, do not attach the Authorization header (e.g. login). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

/**
 * Fetches a binary/document endpoint with the JWT attached and opens it in a new
 * tab (used for PDFs, which can't use a plain <a href> because that omits the
 * Authorization header). Returns false if the popup was blocked.
 */
export async function openAuthedFile(path: string): Promise<boolean> {
  const { token, logout } = useAuthStore.getState();
  const res = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    logout();
    throw new ApiError(401, 'No autenticado.');
  }
  if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke a bit later so the tab has time to load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return win != null;
}

/**
 * Downloads a file endpoint (with the JWT attached) and saves it via a temporary
 * <a download>. Used for the CSV report, which can't use a plain link (no auth
 * header). `query` params are appended to the URL.
 */
export async function downloadAuthedFile(
  path: string,
  filename: string,
  query?: RequestOptions['query'],
): Promise<void> {
  const { token, logout } = useAuthStore.getState();
  const res = await fetch(buildUrl(path, query), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401) {
    logout();
    throw new ApiError(401, 'No autenticado.');
  }
  if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { token, logout } = useAuthStore.getState();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!opts.anonymous && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && !opts.anonymous) {
    logout();
  }

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message =
      isJson && payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `Error ${res.status}`;
    throw new ApiError(res.status, message);
  }
  return payload as T;
}
