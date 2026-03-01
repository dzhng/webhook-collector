const DEFAULT_QUEUE_REGION = "iad1";
const DEFAULT_EVENT_RETENTION_SECONDS = 60 * 60 * 24;
const DEFAULT_MAX_CAPTURE_BYTES = 64 * 1024;
const DEFAULT_READ_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const DEFAULT_CURSOR_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface AppConfig {
  signingSecret: string;
  queueRegion: string;
  queueToken?: string;
  eventRetentionSeconds: number;
  maxCaptureBytes: number;
  readTokenTtlSeconds: number;
  cursorTokenTtlSeconds: number;
}

let cachedConfig: AppConfig | null = null;

function requireValue(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseInteger(
  name: string,
  fallback: number,
  options: { min: number; max?: number },
): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }

  if (parsed < options.min) {
    throw new Error(`${name} must be >= ${options.min}.`);
  }

  if (typeof options.max === "number" && parsed > options.max) {
    throw new Error(`${name} must be <= ${options.max}.`);
  }

  return parsed;
}

export function getConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const signingSecret = requireValue("WEBHOOK_CATCHER_SIGNING_SECRET");

  cachedConfig = {
    signingSecret,
    queueRegion:
      process.env.WEBHOOK_CATCHER_QUEUE_REGION ??
      process.env.VERCEL_REGION ??
      DEFAULT_QUEUE_REGION,
    queueToken: process.env.WEBHOOK_CATCHER_QUEUE_TOKEN,
    eventRetentionSeconds: parseInteger(
      "WEBHOOK_CATCHER_EVENT_RETENTION_SECONDS",
      DEFAULT_EVENT_RETENTION_SECONDS,
      { min: 60, max: 86400 },
    ),
    maxCaptureBytes: parseInteger(
      "WEBHOOK_CATCHER_MAX_CAPTURE_BYTES",
      DEFAULT_MAX_CAPTURE_BYTES,
      { min: 1024, max: 1024 * 1024 },
    ),
    readTokenTtlSeconds: parseInteger(
      "WEBHOOK_CATCHER_READ_TOKEN_TTL_SECONDS",
      DEFAULT_READ_TOKEN_TTL_SECONDS,
      { min: 300 },
    ),
    cursorTokenTtlSeconds: parseInteger(
      "WEBHOOK_CATCHER_CURSOR_TOKEN_TTL_SECONDS",
      DEFAULT_CURSOR_TOKEN_TTL_SECONDS,
      { min: 60 },
    ),
  };

  return cachedConfig;
}
