# Webhook Catcher (API-only)

Simple webhook capture service with:
- Dynamic ingest endpoints
- Cursor-based event reads
- No database (queue-only)

Built for Vercel with `@vercel/queue` and Next.js route handlers.

## How it works

1. `POST /api/v1/endpoints` creates an endpoint configuration.
2. You send webhooks to `/api/ingest/{endpointId}/{writeSecret}`.
3. The app publishes captured requests to a topic (`wh_{endpointId}`).
4. You read captured events with `GET /api/v1/endpoints/{endpointId}/events` using a signed cursor.

Cursors map to queue consumer groups, so queue state acts as read position.

## Important limit

This project intentionally uses queues only (no DB).
Event history is limited by Vercel queue retention (`<= 24h`).

## Environment

Copy `.env.example` to `.env.local` and set required values:

- `WEBHOOK_CATCHER_API_KEY`
- `WEBHOOK_CATCHER_SIGNING_SECRET`
- `WEBHOOK_CATCHER_QUEUE_REGION`

Optional settings are documented in `.env.example`.

## Run locally

```bash
npm install
npm run dev
```

Landing docs: `http://localhost:3000`

## API

### Create endpoint

`POST /api/v1/endpoints`

Headers:
- `Authorization: Bearer <WEBHOOK_CATCHER_API_KEY>`

Example:

```bash
curl -s -X POST http://localhost:3000/api/v1/endpoints \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

Response fields:
- `endpointId`
- `writeSecret`
- `readToken`
- `ingestUrl`
- `eventsUrl`

### Ingest webhook

`ANY /api/ingest/{endpointId}/{writeSecret}`

Example:

```bash
curl -s -X POST 'https://your-app.vercel.app/api/ingest/ep_xxx/WRITE_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
```

### Read events

`GET /api/v1/endpoints/{endpointId}/events?limit=10&cursor=...`

Headers:
- `Authorization: Bearer <readToken>`
  - You can also use the admin API key.

First page (no cursor):

```bash
curl -s 'https://your-app.vercel.app/api/v1/endpoints/ep_xxx/events?limit=10' \
  -H 'Authorization: Bearer READ_TOKEN'
```

Next page:

```bash
curl -s 'https://your-app.vercel.app/api/v1/endpoints/ep_xxx/events?limit=10&cursor=NEXT_CURSOR' \
  -H 'Authorization: Bearer READ_TOKEN'
```

The response includes `nextCursor` for the next request.

## Deploy to Vercel

1. Create a Vercel project from this repo.
2. Ensure Queues are enabled for the project.
3. Set environment variables from `.env.example`.
4. Deploy.

## Future upgrade (if >24h history is needed)

If you want longer retention, add a database from the Vercel ecosystem (for example Upstash Redis) and persist each captured event there while still using queues for ingestion.
