import { PollingQueueClient } from "@vercel/queue";
import { getConfig } from "@/lib/config";

let queueClient: PollingQueueClient | null = null;

export function getQueueClient(): PollingQueueClient {
  if (queueClient) {
    return queueClient;
  }

  const config = getConfig();
  queueClient = new PollingQueueClient({
    region: config.queueRegion,
    token: config.queueToken,
  });

  return queueClient;
}

export function getTopicName(endpointId: string): string {
  return `wh_${endpointId}`;
}
