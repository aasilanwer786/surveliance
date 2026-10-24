export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const ACCESS_KEY = "sr.access";
const REFRESH_KEY = "sr.refresh";

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  return { res, data };
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!tokens.refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const { res, data } = await raw("POST", "/api/auth/refresh", { refreshToken: tokens.refresh });
        if (!res.ok) return false;
        const d = data as { accessToken: string; refreshToken: string };
        tokens.set(d.accessToken, d.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T = any>(
  method: string,
  path: string,
  body?: unknown,
  opts: { retry?: boolean } = {},
): Promise<T> {
  const authHeader: Record<string, string> = tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {};
  let { res, data } = await raw(method, path, body, authHeader);

  if (res.status === 401 && opts.retry !== false && tokens.refresh) {
    const ok = await tryRefresh();
    if (ok) {
      ({ res, data } = await raw(method, path, body, { Authorization: `Bearer ${tokens.access}` }));
    }
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: unknown } })?.error;
    if (res.status === 401) tokens.clear();
    throw new ApiError(res.status, err?.code ?? "ERROR", err?.message ?? `Request failed (${res.status})`, err?.details);
  }
  return data as T;
}

export const get = <T = any>(path: string) => api<T>("GET", path);
export const post = <T = any>(path: string, body?: unknown) => api<T>("POST", path, body);
export const put = <T = any>(path: string, body?: unknown) => api<T>("PUT", path, body);
export const del = <T = any>(path: string) => api<T>("DELETE", path);

export async function getBlob(path: string): Promise<Blob> {
  const authHeader: Record<string, string> = tokens.access ? { Authorization: `Bearer ${tokens.access}` } : {};
  let res = await fetch(path, { headers: authHeader });
  if (res.status === 401 && tokens.refresh) {
    const ok = await tryRefresh();
    if (ok) res = await fetch(path, { headers: { Authorization: `Bearer ${tokens.access}` } });
  }
  if (!res.ok) {
    if (res.status === 401) tokens.clear();
    let code = "ERROR";
    let message = `Request failed (${res.status})`;
    try {
      const err = (await res.json()) as { error?: { code?: string; message?: string } };
      code = err?.error?.code ?? code;
      message = err?.error?.message ?? message;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, code, message);
  }
  return res.blob();
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages?: number;
}
