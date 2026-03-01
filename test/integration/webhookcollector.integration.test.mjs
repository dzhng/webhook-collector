import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

const BASE_URL = process.env.WEBHOOKCOLLECTOR_BASE_URL ?? "https://webhookcollector.dev";
const BASE_ORIGIN = new URL(BASE_URL).origin;

const REQUEST_TIMEOUT_MS = 15_000;
const POLL_ATTEMPTS = 20;
const POLL_DELAY_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const text = await response.text();
    let json = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      body: json,
      text,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function createEndpoint() {
  const response = await fetchJson(`${BASE_ORIGIN}/api/v1/endpoints`, {
    method: "POST",
  });

  assert.equal(
    response.status,
    200,
    `Expected create endpoint to return 200, got ${response.status}. Body: ${response.text}`,
  );

  const body = response.body;
  assert.ok(body, "Create endpoint response must be valid JSON.");
  assert.equal(typeof body.ingestUrl, "string");
  assert.equal(typeof body.eventsUrl, "string");
  assert.equal("readToken" in body, false, "readToken should not exist anymore");

  const ingestUrl = new URL(body.ingestUrl);
  const eventsUrl = new URL(body.eventsUrl);

  assert.equal(ingestUrl.origin, BASE_ORIGIN);
  assert.equal(eventsUrl.origin, BASE_ORIGIN);

  const ingestMatch = ingestUrl.pathname.match(/^\/api\/ingest\/([^/]+)\/([^/]+)$/);
  assert.ok(ingestMatch, `Unexpected ingest URL path: ${ingestUrl.pathname}`);

  const eventsMatch = eventsUrl.pathname.match(
    /^\/api\/v1\/endpoints\/([^/]+)\/events$/,
  );
  assert.ok(eventsMatch, `Unexpected events URL path: ${eventsUrl.pathname}`);

  const endpointIdFromIngest = ingestMatch[1];
  const endpointIdFromEvents = eventsMatch[1];
  const writeSecret = ingestMatch[2];

  assert.equal(endpointIdFromIngest, endpointIdFromEvents);

  return {
    endpointId: endpointIdFromEvents,
    writeSecret,
    ingestUrl: ingestUrl.toString(),
    eventsUrl: eventsUrl.toString(),
  };
}

async function ingestRequest(ingestUrl, init = {}) {
  const response = await fetchJson(ingestUrl, init);
  assert.equal(
    response.status,
    202,
    `Expected ingest to return 202, got ${response.status}. Body: ${response.text}`,
  );

  assert.equal(response.body?.accepted, true);
  assert.equal(typeof response.body?.eventId, "string");

  return response.body;
}

async function readEvents(eventsUrl, { limit = 10, cursor, headers } = {}) {
  const url = new URL(eventsUrl);
  url.searchParams.set("limit", String(limit));
  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  return fetchJson(url.toString(), headers ? { headers } : undefined);
}

async function pollForEvent(eventsUrl, predicate, { limit = 10 } = {}) {
  let cursor;

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const response = await readEvents(eventsUrl, { limit, cursor });

    assert.equal(
      response.status,
      200,
      `Expected read events to return 200, got ${response.status}. Body: ${response.text}`,
    );

    const body = response.body;
    assert.ok(body, "Read events must return JSON body.");
    assert.ok(Array.isArray(body.events), "Read events response must include events array.");
    assert.equal(typeof body.nextCursor, "string");

    const match = body.events.find(predicate);
    if (match) {
      return { response, event: match };
    }

    cursor = body.nextCursor;
    await sleep(POLL_DELAY_MS);
  }

  assert.fail("Timed out waiting for expected event in queue.");
}

test(
  "create endpoint returns expected contract",
  { timeout: 60_000 },
  async () => {
    const endpoint = await createEndpoint();

    assert.match(endpoint.endpointId, /^ep_[A-Za-z0-9_-]+$/);
    assert.match(endpoint.writeSecret, /^[A-Za-z0-9_-]+$/);
  },
);

test(
  "read endpoint works with or without Authorization header",
  { timeout: 60_000 },
  async () => {
    const endpoint = await createEndpoint();

    const noHeader = await readEvents(endpoint.eventsUrl, { limit: 1 });
    assert.equal(noHeader.status, 200);
    assert.ok(Array.isArray(noHeader.body?.events));

    const withHeader = await readEvents(endpoint.eventsUrl, {
      limit: 1,
      headers: {
        Authorization: "Bearer anything",
      },
    });
    assert.equal(withHeader.status, 200);
    assert.ok(Array.isArray(withHeader.body?.events));
  },
);

test(
  "cursor from endpoint A is invalid for endpoint B",
  { timeout: 60_000 },
  async () => {
    const endpointA = await createEndpoint();
    const endpointB = await createEndpoint();

    const firstReadA = await readEvents(endpointA.eventsUrl, { limit: 1 });
    assert.equal(firstReadA.status, 200);
    assert.equal(typeof firstReadA.body?.nextCursor, "string");

    const crossCursorRead = await readEvents(endpointB.eventsUrl, {
      limit: 1,
      cursor: firstReadA.body.nextCursor,
    });

    assert.equal(crossCursorRead.status, 400);
    assert.equal(crossCursorRead.body?.error, "Invalid cursor");
  },
);

test(
  "events from endpoint A are not visible on endpoint B",
  { timeout: 90_000 },
  async () => {
    const endpointA = await createEndpoint();
    const endpointB = await createEndpoint();
    const marker = uniqueId("isolation");

    await ingestRequest(endpointA.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ marker }),
    });

    await pollForEvent(endpointA.eventsUrl, (event) => {
      const data = event?.body?.data;
      return typeof data === "string" && data.includes(marker);
    });

    const readB = await readEvents(endpointB.eventsUrl, { limit: 10 });
    assert.equal(readB.status, 200);

    const leaked = (readB.body?.events ?? []).some((event) => {
      const data = event?.body?.data;
      return typeof data === "string" && data.includes(marker);
    });

    assert.equal(leaked, false, "Endpoint B should not expose events ingested to endpoint A");
  },
);

test(
  "read endpoint validates limit bounds",
  { timeout: 60_000 },
  async () => {
    const endpoint = await createEndpoint();

    const tooLow = await readEvents(endpoint.eventsUrl, { limit: 0 });
    assert.equal(tooLow.status, 400);
    assert.equal(tooLow.body?.error, "limit must be an integer between 1 and 10");

    const tooHigh = await readEvents(endpoint.eventsUrl, { limit: 11 });
    assert.equal(tooHigh.status, 400);
    assert.equal(tooHigh.body?.error, "limit must be an integer between 1 and 10");
  },
);

test(
  "ingest endpoint rejects incorrect write secret",
  { timeout: 60_000 },
  async () => {
    const endpoint = await createEndpoint();
    const badSecret = endpoint.writeSecret.slice(0, -1) + (endpoint.writeSecret.endsWith("a") ? "b" : "a");

    const badUrl = endpoint.ingestUrl.replace(endpoint.writeSecret, badSecret);
    const response = await fetchJson(badUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ bad: true }),
    });

    assert.equal(response.status, 404);
    assert.equal(response.body?.error, "Not Found");
  },
);

test(
  "captures POST JSON and supports cursor pagination",
  { timeout: 90_000 },
  async () => {
    const endpoint = await createEndpoint();
    const tag1 = uniqueId("json-a");
    const tag2 = uniqueId("json-b");

    await ingestRequest(endpoint.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: tag1, type: "integration" }),
    });

    await ingestRequest(endpoint.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tag: tag2, type: "integration" }),
    });

    const firstPage = await readEvents(endpoint.eventsUrl, { limit: 1 });
    assert.equal(firstPage.status, 200);
    assert.equal(Array.isArray(firstPage.body?.events), true);
    assert.equal(firstPage.body?.events.length, 1);
    assert.equal(typeof firstPage.body?.nextCursor, "string");

    const secondPage = await readEvents(endpoint.eventsUrl, {
      limit: 1,
      cursor: firstPage.body.nextCursor,
    });

    assert.equal(secondPage.status, 200);
    assert.equal(Array.isArray(secondPage.body?.events), true);

    const collected = [
      ...(firstPage.body?.events ?? []),
      ...(secondPage.body?.events ?? []),
    ];

    const tagsSeen = new Set(
      collected
        .map((event) => event?.body?.data)
        .filter((value) => typeof value === "string")
        .flatMap((value) => [value.includes(tag1) ? tag1 : null, value.includes(tag2) ? tag2 : null])
        .filter(Boolean),
    );

    if (!tagsSeen.has(tag1) || !tagsSeen.has(tag2)) {
      const awaited = new Set([tag1, tag2]);
      for (const tag of tagsSeen) {
        awaited.delete(tag);
      }

      let cursor = secondPage.body?.nextCursor;
      for (let attempt = 1; attempt <= POLL_ATTEMPTS && awaited.size > 0; attempt += 1) {
        const page = await readEvents(endpoint.eventsUrl, {
          limit: 1,
          cursor,
        });
        assert.equal(page.status, 200);

        const events = page.body?.events ?? [];
        for (const event of events) {
          const data = event?.body?.data;
          if (typeof data === "string") {
            if (data.includes(tag1)) {
              awaited.delete(tag1);
            }
            if (data.includes(tag2)) {
              awaited.delete(tag2);
            }
          }
        }

        cursor = page.body?.nextCursor;
        await sleep(POLL_DELAY_MS);
      }

      assert.equal(awaited.size, 0, `Missing tags after pagination: ${Array.from(awaited).join(", ")}`);
    }
  },
);

test(
  "captures GET query params and null body",
  { timeout: 90_000 },
  async () => {
    const endpoint = await createEndpoint();
    const marker = uniqueId("get");
    const ingestUrl = new URL(endpoint.ingestUrl);
    ingestUrl.searchParams.set("probe", marker);

    await ingestRequest(ingestUrl.toString(), {
      method: "GET",
    });

    const { event } = await pollForEvent(
      endpoint.eventsUrl,
      (candidate) => candidate?.query?.probe === marker,
      { limit: 5 },
    );

    assert.equal(event.method, "GET");
    assert.equal(event.query.probe, marker);
    assert.equal(event.body, null);
  },
);

test(
  "captures binary payloads as base64",
  { timeout: 90_000 },
  async () => {
    const endpoint = await createEndpoint();
    const marker = uniqueId("binary");
    const payload = Buffer.from([0, 1, 2, 3, 4, 250, 251, 252, 253, 254, 255]);

    const ingestUrl = new URL(endpoint.ingestUrl);
    ingestUrl.searchParams.set("probe", marker);

    await ingestRequest(ingestUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: payload,
    });

    const { event } = await pollForEvent(
      endpoint.eventsUrl,
      (candidate) => candidate?.query?.probe === marker,
      { limit: 5 },
    );

    assert.ok(event.body, "binary webhook should include a body object");
    assert.equal(event.body.encoding, "base64");

    const decoded = Buffer.from(event.body.data, "base64");
    assert.deepEqual(decoded, payload);
    assert.equal(event.body.truncated, false);
  },
);
