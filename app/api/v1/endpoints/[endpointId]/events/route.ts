import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getBearerToken, jsonError, parseLimit } from "@/lib/http";
import { generateConsumerGroupId } from "@/lib/ids";
import { getQueueClient, getTopicName } from "@/lib/queue";
import { createCursorToken, verifyCursorToken, verifyReadToken } from "@/lib/security";
import type { CapturedWebhookEvent } from "@/lib/types";
import { isValidConsumerGroup, isValidEndpointId } from "@/lib/validation";

export const runtime = "nodejs";

type EventsRouteContext = {
  params: Promise<{
    endpointId: string;
  }>;
};

export async function GET(
  request: Request,
  context: EventsRouteContext,
): Promise<NextResponse> {
  try {
    const config = getConfig();
    const { endpointId } = await context.params;

    if (!isValidEndpointId(endpointId)) {
      return jsonError(400, "Invalid endpoint id");
    }

    const bearerToken = getBearerToken(request);
    if (!bearerToken) {
      return jsonError(401, "Missing bearer token");
    }

    const hasAdminAccess = bearerToken === config.apiKey;
    if (!hasAdminAccess && !verifyReadToken(bearerToken, endpointId, config.signingSecret)) {
      return jsonError(403, "Invalid token for this endpoint");
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"), 10, 1, 10);
    if (!limit) {
      return jsonError(400, "limit must be an integer between 1 and 10");
    }

    let consumerGroup = generateConsumerGroupId();
    const incomingCursor = url.searchParams.get("cursor");

    if (incomingCursor) {
      const cursorPayload = verifyCursorToken(
        incomingCursor,
        endpointId,
        config.signingSecret,
      );

      if (!cursorPayload || !isValidConsumerGroup(cursorPayload.consumerGroup)) {
        return jsonError(400, "Invalid cursor");
      }

      consumerGroup = cursorPayload.consumerGroup;
    }

    const queueClient = getQueueClient();
    const events: CapturedWebhookEvent[] = [];

    const result = await queueClient.receive<CapturedWebhookEvent>(
      getTopicName(endpointId),
      consumerGroup,
      (payload) => {
        events.push(payload);
      },
      {
        limit,
      },
    );

    if (!result.ok && result.reason !== "empty") {
      console.error("Unexpected queue receive result", result);
      return jsonError(503, "Could not read events from queue");
    }

    const nextCursor = createCursorToken(
      endpointId,
      consumerGroup,
      config.signingSecret,
      config.cursorTokenTtlSeconds,
    );

    return NextResponse.json(
      {
        endpointId,
        events,
        nextCursor,
        hasMore: events.length === limit,
        empty: events.length === 0,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to read webhook events", error);
    return jsonError(500, "Could not read webhook events");
  }
}
