/**
 * Browser-side fetch helper for app/api/**.
 *
 *   const orders = await apiFetch<Paged<Order>>("/api/orders", { query: { portfolioId } });
 *   await apiFetch<Order>("/api/orders", { method: "POST", body: input });
 *
 * - Unwraps the `{ data }` success envelope.
 * - Throws `ApiClientError` built from the `{ error: { code, message, details } }` envelope.
 * - Plain-object `body` is JSON-encoded automatically.
 * - Same-origin cookies (the session) are always sent.
 */
import type { ErrorCode } from "@/lib/core/errors";

export type ApiErrorCode = ErrorCode | "NETWORK_ERROR" | "BAD_RESPONSE";

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  get isUnauthorized() {
    return this.status === 401;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isValidation() {
    return this.code === "VALIDATION_ERROR";
  }

  /** Field-level messages from a zod `flatten()` payload, when present. */
  get fieldErrors(): Record<string, string[]> {
    const d = this.details as { fieldErrors?: Record<string, string[]> } | null;
    return d && typeof d === "object" && d.fieldErrors ? d.fieldErrors : {};
  }
}

export type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

export interface ApiFetchInit extends Omit<RequestInit, "body"> {
  /** Appended to the URL; arrays are joined with commas, null/undefined are skipped. */
  query?: Record<string, QueryValue>;
  /** Plain objects are JSON-encoded; strings/FormData/Blobs pass through unchanged. */
  body?: unknown;
}

export function buildQueryString(query: Record<string, QueryValue> | undefined): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function isRawBody(b: unknown): b is BodyInit {
  return (
    typeof b === "string" ||
    b instanceof ArrayBuffer ||
    ArrayBuffer.isView(b) ||
    (typeof Blob !== "undefined" && b instanceof Blob) ||
    (typeof FormData !== "undefined" && b instanceof FormData) ||
    (typeof URLSearchParams !== "undefined" && b instanceof URLSearchParams) ||
    (typeof ReadableStream !== "undefined" && b instanceof ReadableStream)
  );
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { query, body, headers: initHeaders, ...rest } = init;
  const headers = new Headers(initHeaders);
  headers.set("accept", "application/json");

  let payload: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (isRawBody(body)) {
      payload = body;
    } else {
      payload = JSON.stringify(body);
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
    }
  }

  let res: Response;
  try {
    res = await fetch(`${path}${buildQueryString(query)}`, {
      method: rest.method ?? (payload !== undefined ? "POST" : "GET"),
      credentials: "same-origin",
      ...rest,
      headers,
      body: payload,
    });
  } catch (e) {
    throw new ApiClientError("NETWORK_ERROR", e instanceof Error ? e.message : "Network request failed", 0);
  }

  if (res.status === 204) return undefined as T;

  let json: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new ApiClientError("BAD_RESPONSE", `Non-JSON response (${res.status})`, res.status, text.slice(0, 500));
    }
  }

  const envelope = (json ?? {}) as { data?: T; error?: { code?: ApiErrorCode; message?: string; details?: unknown } };

  if (!res.ok || envelope.error) {
    const err = envelope.error ?? {};
    throw new ApiClientError(err.code ?? "INTERNAL_ERROR", err.message ?? `Request failed (${res.status})`, res.status, err.details ?? null);
  }

  return envelope.data as T;
}

/** Convenience wrappers so call sites read naturally. */
export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, init?: ApiFetchInit) => apiFetch<T>(path, { ...init, method: "GET", query }),
  post: <T>(path: string, body?: unknown, init?: ApiFetchInit) => apiFetch<T>(path, { ...init, method: "POST", body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, init?: ApiFetchInit) => apiFetch<T>(path, { ...init, method: "PATCH", body: body ?? {} }),
  delete: <T>(path: string, init?: ApiFetchInit) => apiFetch<T>(path, { ...init, method: "DELETE" }),
};
