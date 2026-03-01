import { generateEventId } from "@/lib/ids";
import type { CapturedWebhookBody, CapturedWebhookEvent } from "@/lib/types";

const TEXT_TYPE_HINTS = ["application/json", "application/xml", "text/", "application/x-www-form-urlencoded"];

function isTextContentType(contentType: string | null): boolean {
  if (!contentType) {
    return true;
  }

  return TEXT_TYPE_HINTS.some((typeHint) => contentType.includes(typeHint));
}

function serializeBody(
  rawBody: Buffer,
  contentType: string | null,
  maxCaptureBytes: number,
): CapturedWebhookBody | null {
  const originalBytes = rawBody.byteLength;
  if (originalBytes === 0) {
    return null;
  }

  const capturedBytes = Math.min(originalBytes, maxCaptureBytes);
  const truncated = originalBytes > maxCaptureBytes;
  const capturedSlice = rawBody.subarray(0, capturedBytes);
  const shouldTreatAsText = isTextContentType(contentType);

  return {
    contentType,
    encoding: shouldTreatAsText ? "utf8" : "base64",
    data: shouldTreatAsText
      ? capturedSlice.toString("utf8")
      : capturedSlice.toString("base64"),
    originalBytes,
    capturedBytes,
    truncated,
  };
}

export async function captureRequestAsEvent(
  request: Request,
  endpointId: string,
  maxCaptureBytes: number,
  pathOverride?: string,
): Promise<CapturedWebhookEvent> {
  const requestUrl = new URL(request.url);
  const rawBody = Buffer.from(await request.arrayBuffer());

  const headers = Object.fromEntries(request.headers.entries());
  const query = Object.fromEntries(requestUrl.searchParams.entries());

  return {
    eventId: generateEventId(),
    endpointId,
    receivedAt: new Date().toISOString(),
    method: request.method,
    path: pathOverride ?? requestUrl.pathname,
    query,
    headers,
    body: serializeBody(rawBody, request.headers.get("content-type"), maxCaptureBytes),
    sourceIp: request.headers.get("x-forwarded-for"),
  };
}
