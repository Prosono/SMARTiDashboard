import type { Session } from "./types";
let session: Session | null = null;
export function setSession(value: Session | null) {
  session = value;
}
const errorCodes = new Set([
  "pairing_already_active",
  "controller_busy",
  "controller_disconnected",
  "controller_state_unknown",
  "pairing_provider_unavailable",
  "origin_rejected",
  "ingress_rejected",
  "invalid_setup_secret",
  "already_configured",
  "invalid_timezone",
  "invalid_credentials",
  "rate_limited",
]);
const formFields = new Set([
  "name",
  "password",
  "secret",
  "home_name",
  "timezone",
  "language",
]);
export class ApiError extends Error {
  constructor(
    public status: number,
    public code = "",
    public fields: string[] = [],
  ) {
    super(`HTTP ${status}`);
  }
}

// Keep only known error codes/field names, never echoed request values or secrets.
export function responseError(status: number, text: string): ApiError {
  let detail: unknown = text;
  try {
    detail = JSON.parse(text).detail;
  } catch {
    /* Older backend returns plain error codes. */
  }
  if (typeof detail === "string" && errorCodes.has(detail))
    return new ApiError(status, detail);
  if (Array.isArray(detail)) {
    const fields = detail.flatMap((item) => {
      const field = item?.loc?.[1];
      return typeof field === "string" && formFields.has(field) ? [field] : [];
    });
    return new ApiError(status, "validation_error", [...new Set(fields)]);
  }
  return new ApiError(status);
}

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(new URL(`api/${path}`, document.baseURI), {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "X-CSRF-Token": session.csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw responseError(response.status, await response.text());
  return response.json();
}
