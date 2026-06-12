import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

export const NATIVE_TOKEN_KEY = "cafebara_native_token";

// ── URL helpers ───────────────────────────────────────────────────────────────

export function resolveUrl(url: string): string {
  if (API_BASE && url.startsWith("/")) return `${API_BASE}${url}`;
  return url;
}

export function setNativeToken(token: string) {
  if (!API_BASE) return;
  localStorage.setItem(NATIVE_TOKEN_KEY, token);
}

export function clearNativeToken() {
  localStorage.removeItem(NATIVE_TOKEN_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(NATIVE_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getCredentials(): "include" | "omit" {
  return API_BASE || localStorage.getItem(NATIVE_TOKEN_KEY) ? "omit" : "include";
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ?? "";
}

export function getCsrfHeaders(method: string): Record<string, string> {
  if (!UNSAFE_METHODS.has(method.toUpperCase())) return {};
  if (API_BASE) return {};
  const token = getCsrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

// ── Axios instance ────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: API_BASE || undefined,
  withCredentials: true,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor ───────────────────────────────────────────────────────
// Injects auth token + CSRF header on every outgoing request.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "GET").toUpperCase();
  Object.assign(config.headers, getAuthHeaders());
  Object.assign(config.headers, getCsrfHeaders(method));
  if (getCredentials() === "omit") config.withCredentials = false;
  return config;
});

// ── 503 retry interceptor ─────────────────────────────────────────────────────
// Silent exponential back-off (up to 3 retries) on server-overload.
// Respects the Retry-After header when present.
const MAX_503_RETRIES = 3;
const BASE_503_DELAY_MS = 1_000;

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as InternalAxiosRequestConfig & {
      _503retries?: number;
    };
    if (!config || err.response?.status !== 503) return Promise.reject(err);

    const attempt = config._503retries ?? 0;
    if (attempt >= MAX_503_RETRIES) return Promise.reject(err);
    config._503retries = attempt + 1;

    const retryAfter = err.response!.headers["retry-after"];
    const serverMs = retryAfter ? parseFloat(retryAfter) * 1_000 : null;
    const backoff = Math.min(BASE_503_DELAY_MS * 2 ** attempt, 10_000);
    const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.round(serverMs ?? backoff + jitter);

    await new Promise<void>((r) => setTimeout(r, delay));
    return api(config);
  },
);

// ── Error normaliser ──────────────────────────────────────────────────────────
// Converts AxiosError into a plain Error with a readable message from the
// response body. Callers never need to import AxiosError themselves.
export function normaliseError(err: unknown): Error {
  if (err instanceof AxiosError) {
    const data = err.response?.data as
      | { message?: string; error?: string }
      | undefined;
    const message =
      data?.message ||
      data?.error ||
      err.response?.statusText ||
      err.message ||
      "Something went wrong";
    const out = new Error(message);
    (out as any).status = err.response?.status;
    return out;
  }
  return err instanceof Error ? err : new Error(String(err));
}

// ── Duplicate-request guard ───────────────────────────────────────────────────
// POST / PUT calls with the same method+url+body fingerprint share a Promise
// while in-flight — prevents duplicate charges / orders from double-taps.
const _inflight = new Map<string, Promise<AxiosResponse>>();

function inflightKey(method: string, url: string, data: unknown): string {
  return `${method}:${url}:${JSON.stringify(data ?? null)}`;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * GET — used by the TanStack Query default queryFn.
 * Returns the parsed body; throws a normalised Error on non-2xx.
 */
export async function apiGet<T = unknown>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const res = await api.get<T>(resolveUrl(url), { signal });
    return res.data;
  } catch (err) {
    throw normaliseError(err);
  }
}

/**
 * Mutations (POST / PUT / PATCH / DELETE).
 *
 * POST and PUT are deduplicated: identical in-flight calls share a Promise so
 * a double-tap never fires two charges or two pending orders.
 *
 * Returns the Axios response augmented with a `.json()` shim so existing
 * callers that do `(await apiRequest(...)).json()` keep working unchanged.
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<AxiosResponse & { ok: true; json: () => Promise<any> }> {
  const m = method.toUpperCase();
  const resolved = resolveUrl(url);

  async function exec(): Promise<AxiosResponse> {
    try {
      return await api.request({ method: m, url: resolved, data });
    } catch (err) {
      throw normaliseError(err);
    }
  }

  let res: AxiosResponse;

  if (m === "POST" || m === "PUT") {
    const key = inflightKey(m, resolved, data);
    const existing = _inflight.get(key);
    if (existing) {
      res = await existing;
    } else {
      const promise = exec().finally(() => _inflight.delete(key));
      _inflight.set(key, promise);
      res = await promise;
    }
  } else {
    res = await exec();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Object.assign(res, { ok: true as const, json: async (): Promise<any> => res.data });
}

/**
 * Low-level native-fetch wrapper for offline-sync code that needs to inspect
 * raw Response status before parsing. Returns a fetch-API Response.
 */
export async function nativeFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  return fetch(resolveUrl(url), {
    ...options,
    credentials: getCredentials(),
    headers: {
      ...(options.headers ?? {}),
      ...getAuthHeaders(),
      ...getCsrfHeaders(method),
    },
  });
}
