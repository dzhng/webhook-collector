import { NextResponse } from "next/server";

export function jsonError(
  status: number,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details ?? {}),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function parseLimit(
  rawLimit: string | null,
  defaultLimit: number,
  min: number,
  max: number,
): number | null {
  if (!rawLimit) {
    return defaultLimit;
  }

  const value = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(value) || value < min || value > max) {
    return null;
  }

  return value;
}

export function buildAbsoluteUrl(
  request: Request,
  path: string,
  configuredBaseUrl?: string,
): string {
  const base = configuredBaseUrl ? new URL(configuredBaseUrl) : new URL(request.url);
  return new URL(path, base).toString();
}
