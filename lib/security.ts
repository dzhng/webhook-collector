import { createHmac, timingSafeEqual } from "node:crypto";
import type { CursorTokenPayload } from "@/lib/types";

interface GenericTokenPayload {
  kind: "cursor";
  endpointId: string;
  exp: number;
  consumerGroup?: string;
}

function encode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function signPayload(encodedHeader: string, encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
}

export function deriveWriteSecret(endpointId: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret)
    .update(`write:${endpointId}`)
    .digest("base64url")
    .slice(0, 40);
}

export function signToken(payload: GenericTokenPayload, secret: string): string {
  const encodedHeader = encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = signPayload(encodedHeader, encodedPayload, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyToken<T extends GenericTokenPayload>(
  token: string,
  secret: string,
): T | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, incomingSignature] = parts;
  const expectedSignature = signPayload(encodedHeader, encodedPayload, secret);

  const incoming = Buffer.from(incomingSignature);
  const expected = Buffer.from(expectedSignature);
  if (incoming.length !== expected.length || !timingSafeEqual(incoming, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(decode(encodedPayload).toString("utf8")) as T;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createCursorToken(
  endpointId: string,
  consumerGroup: string,
  signingSecret: string,
  ttlSeconds: number,
): string {
  return signToken(
    {
      kind: "cursor",
      endpointId,
      consumerGroup,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    },
    signingSecret,
  );
}

export function verifyCursorToken(
  token: string,
  endpointId: string,
  signingSecret: string,
): CursorTokenPayload | null {
  const payload = verifyToken<CursorTokenPayload>(token, signingSecret);
  if (
    !payload ||
    payload.kind !== "cursor" ||
    payload.endpointId !== endpointId ||
    typeof payload.consumerGroup !== "string"
  ) {
    return null;
  }

  return payload;
}
