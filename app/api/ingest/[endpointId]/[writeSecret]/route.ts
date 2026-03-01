import { NextResponse } from "next/server";
import { captureRequestAsEvent } from "@/lib/capture";
import { getConfig } from "@/lib/config";
import { jsonError } from "@/lib/http";
import { getQueueClient, getTopicName } from "@/lib/queue";
import { deriveWriteSecret } from "@/lib/security";
import { isValidEndpointId, isValidWriteSecret } from "@/lib/validation";

export const runtime = "nodejs";

type IngestRouteContext = {
  params: Promise<{
    endpointId: string;
    writeSecret: string;
  }>;
};

async function handleIngest(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  try {
    const config = getConfig();
    const { endpointId, writeSecret } = await context.params;

    if (!isValidEndpointId(endpointId) || !isValidWriteSecret(writeSecret)) {
      return jsonError(404, "Not Found");
    }

    const expectedSecret = deriveWriteSecret(endpointId, config.signingSecret);
    if (writeSecret !== expectedSecret) {
      return jsonError(404, "Not Found");
    }

    const event = await captureRequestAsEvent(
      request,
      endpointId,
      config.maxCaptureBytes,
      `/api/ingest/${endpointId}/[redacted]`,
    );

    const queueClient = getQueueClient();
    const sendResult = await queueClient.send(getTopicName(endpointId), event, {
      retentionSeconds: config.eventRetentionSeconds,
    });

    return NextResponse.json(
      {
        accepted: true,
        eventId: event.eventId,
        messageId: sendResult.messageId,
      },
      {
        status: 202,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Failed to ingest webhook", error);
    return jsonError(500, "Could not store webhook event");
  }
}

export async function GET(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function POST(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function PUT(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function PATCH(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function DELETE(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function HEAD(
  request: Request,
  context: IngestRouteContext,
): Promise<NextResponse> {
  return handleIngest(request, context);
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}
