/**
 * Consistent API error envelope (Spec 005, FR-010). Every failure — validation,
 * not-found, backend error, dependency-down — is returned in this single shape so
 * clients can handle errors uniformly. Messages are human-readable and secret-free;
 * raw driver/engine errors are logged server-side, never serialized here.
 */

export type ApiErrorCode = "bad_request" | "not_found" | "internal" | "unavailable";

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/** Build a JSON error response with the given HTTP status, stable code, and message. */
export function jsonError(
  status: number,
  code: ApiErrorCode,
  message: string,
): Response {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, { status });
}
