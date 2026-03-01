export interface CapturedWebhookBody {
  contentType: string | null;
  encoding: "utf8" | "base64";
  data: string;
  originalBytes: number;
  capturedBytes: number;
  truncated: boolean;
}

export interface CapturedWebhookEvent {
  eventId: string;
  endpointId: string;
  receivedAt: string;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: CapturedWebhookBody | null;
  sourceIp: string | null;
}

interface BaseTokenPayload {
  kind: "read" | "cursor";
  endpointId: string;
  exp: number;
}

export interface ReadTokenPayload extends BaseTokenPayload {
  kind: "read";
}

export interface CursorTokenPayload extends BaseTokenPayload {
  kind: "cursor";
  consumerGroup: string;
}
