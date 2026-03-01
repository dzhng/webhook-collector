const SAFE_ID_REGEX = /^[A-Za-z0-9_-]+$/;

export function isValidEndpointId(value: string): boolean {
  return value.startsWith("ep_") && value.length >= 10 && SAFE_ID_REGEX.test(value);
}

export function isValidWriteSecret(value: string): boolean {
  return value.length >= 20 && SAFE_ID_REGEX.test(value);
}

export function isValidConsumerGroup(value: string): boolean {
  return value.startsWith("cg_") && value.length >= 10 && SAFE_ID_REGEX.test(value);
}
