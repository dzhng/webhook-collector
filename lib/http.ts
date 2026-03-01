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
