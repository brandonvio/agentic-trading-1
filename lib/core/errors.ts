/**
 * Application error hierarchy. Every error carries an HTTP-ish status and a
 * stable machine-readable code so route handlers can map errors uniformly.
 */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INVALID_STATE"
  | "RISK_REJECTED"
  | "BROKER_ERROR"
  | "LLM_ERROR"
  | "INTERNAL_ERROR";

/**
 * Brand used by `isAppError`. Next.js can evaluate this module once per bundle,
 * so an error thrown in one bundle is not `instanceof` another bundle's
 * `AppError`. Recognising errors structurally keeps HTTP status mapping and
 * server-action error messages correct across that boundary.
 */
export const APP_ERROR_BRAND = "__isAgenticPropAppError";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** @internal marker read by `isAppError`. */
  readonly [APP_ERROR_BRAND] = true as const;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details ?? null } };
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super("NOT_FOUND", id ? `${entity} '${id}' not found` : `${entity} not found`, 404, { entity, id });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions", details?: unknown) {
    super("FORBIDDEN", message, 403, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super("CONFLICT", message, 409, details);
  }
}

export class InvalidStateError extends AppError {
  constructor(message: string, details?: unknown) {
    super("INVALID_STATE", message, 409, details);
  }
}

export class RiskRejectedError extends AppError {
  constructor(message: string, details?: unknown) {
    super("RISK_REJECTED", message, 422, details);
  }
}

export class BrokerError extends AppError {
  constructor(message: string, details?: unknown) {
    super("BROKER_ERROR", message, 502, details);
  }
}

export class LLMError extends AppError {
  constructor(message: string, details?: unknown) {
    super("LLM_ERROR", message, 502, details);
  }
}

/**
 * True for any AppError, including one constructed by a different instance of
 * this module (see APP_ERROR_BRAND). Falls back to `instanceof` for subclasses
 * that predate the brand.
 */
export function isAppError(e: unknown): e is AppError {
  if (e instanceof AppError) return true;
  if (typeof e !== "object" || e === null) return false;
  const candidate = e as Record<string, unknown>;
  return candidate[APP_ERROR_BRAND] === true && typeof candidate.code === "string" && typeof candidate.status === "number";
}

export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError("INTERNAL_ERROR", message, 500);
}
