const EXAMPLE_CREATE = `curl -s -X POST http://localhost:3000/api/v1/endpoints \\
  -H 'Authorization: Bearer YOUR_API_KEY'`;

const EXAMPLE_INGEST = `curl -s -X POST 'https://your-app.vercel.app/api/ingest/ep_xxx/WRITE_SECRET' \\
  -H 'Content-Type: application/json' \\
  -d '{"hello":"world"}'`;

const EXAMPLE_READ_FIRST = `curl -s 'https://your-app.vercel.app/api/v1/endpoints/ep_xxx/events?limit=10' \\
  -H 'Authorization: Bearer READ_TOKEN'`;

const EXAMPLE_READ_NEXT = `curl -s 'https://your-app.vercel.app/api/v1/endpoints/ep_xxx/events?limit=10&cursor=NEXT_CURSOR' \\
  -H 'Authorization: Bearer READ_TOKEN'`;

export default function Home() {
  return (
    <main className="docs-root">
      <h1>Webhook Catcher API</h1>
      <p>
        API-only webhook catcher. Create dynamic endpoints, send webhooks to
        them, then page through captured events with a cursor.
      </p>

      <section>
        <h2>1) Create endpoint</h2>
        <p>
          Returns <code>endpointId</code>, <code>writeSecret</code>,{" "}
          <code>readToken</code>, <code>ingestUrl</code>, and{" "}
          <code>eventsUrl</code>.
        </p>
        <pre>{EXAMPLE_CREATE}</pre>
      </section>

      <section>
        <h2>2) Send webhooks</h2>
        <p>
          Send any HTTP method to the ingest URL. The request is captured and
          queued as an event.
        </p>
        <pre>{EXAMPLE_INGEST}</pre>
      </section>

      <section>
        <h2>3) Read events with cursor</h2>
        <p>
          First request: omit cursor to create a read session. Following
          requests: pass <code>nextCursor</code> from the previous response.
        </p>
        <pre>{EXAMPLE_READ_FIRST}</pre>
        <pre>{EXAMPLE_READ_NEXT}</pre>
      </section>

      <section>
        <h2>Important limits</h2>
        <p>
          This project uses Vercel Queues only. Event retention is bounded by
          queue retention (up to 24 hours).
        </p>
      </section>
    </main>
  );
}
