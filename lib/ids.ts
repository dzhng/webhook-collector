import { randomBytes } from "node:crypto";

function randomToken(byteLength: number): string {
  return randomBytes(byteLength).toString("base64url");
}

export function generateEndpointId(): string {
  return `ep_${randomToken(12)}`;
}

export function generateEventId(): string {
  return `evt_${randomToken(12)}`;
}

export function generateConsumerGroupId(): string {
  return `cg_${randomToken(12)}`;
}
