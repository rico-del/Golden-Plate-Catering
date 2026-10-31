import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../server.mjs";

async function withServer(run, options = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "golden-plate-test-"));
  const server = createServer({ dataDir, mongoUri: "", adminUsername: "moderator", adminPassword: "correct-horse", ...options });
  const handler = server.listeners("request")[0];
  try {
    await run(handler, dataDir);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function request(handler, route, options = {}) {
  const body = options.body || "";
  const request = {
    url: route,
    method: options.method || "GET",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    socket: { remoteAddress: "test-client" },
    async *[Symbol.asyncIterator]() { if (body) yield Buffer.from(body); }
  };
  const response = { statusCode: 200, headers: {}, body: "", setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, writeHead(statusCode, headers = {}) { this.statusCode = statusCode; for (const [name, value] of Object.entries(headers)) this.headers[name.toLowerCase()] = value; }, once(event, listener) { if (event === "finish") this.finishListener = listener; return this; }, end(chunk) { this.body += chunk ? chunk.toString() : ""; this.finishListener?.(); } };
  await handler(request, response);
  const parsedBody = response.headers["content-type"]?.startsWith("application/json") ? JSON.parse(response.body || "{}") : {};
  return { response, body: parsedBody };
}

test("JPEG assets are served as images", async () => {
  await withServer(async (handler) => {
    const result = await request(handler, "/assets/dining_view.jpg");
    assert.equal(result.response.statusCode, 200);
    assert.match(result.response.headers["content-type"], /^image\/jpeg/);
  });
});

test("review submissions persist as pending and require authenticated moderation", async () => {
  await withServer(async (handler, dataDir) => {
    let result = await request(handler, "/api/reviews");
    assert.deepEqual(result.body, { reviews: [] });

    result = await request(handler, "/api/reviews", { method: "POST", body: JSON.stringify({ name: "Amina", rating: 5, text: "A genuine and useful review." }) });
    assert.equal(result.response.statusCode, 201);
    assert.equal(result.body.status, "pending");

    result = await request(handler, "/api/reviews");
    assert.deepEqual(result.body, { reviews: [] });

    result = await request(handler, "/api/admin/reviews");
    assert.equal(result.response.statusCode, 401);

    const auth = `Basic ${Buffer.from("moderator:correct-horse").toString("base64")}`;
    result = await request(handler, "/api/admin/reviews", { headers: { authorization: auth } });
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.reviews.length, 1);
    assert.equal(result.body.reviews[0].status, "pending");

    const reviewId = result.body.reviews[0].id;
    result = await request(handler, `/api/admin/reviews/${reviewId}`, { method: "PATCH", headers: { authorization: auth }, body: JSON.stringify({ status: "approved" }) });
    assert.equal(result.response.statusCode, 200);

    result = await request(handler, "/api/reviews");
    assert.equal(result.body.reviews.length, 1);
    assert.equal(result.body.reviews[0].name, "Amina");
    assert.equal(result.body.reviews[0].status, undefined);

    result = await request(handler, `/api/admin/reviews/${reviewId}`, { method: "PATCH", headers: { authorization: auth }, body: JSON.stringify({ status: "pending" }) });
    assert.equal(result.response.statusCode, 200);
    result = await request(handler, "/api/reviews");
    assert.deepEqual(result.body, { reviews: [] });

    result = await request(handler, `/api/admin/reviews/${reviewId}`, { method: "PATCH", headers: { authorization: auth }, body: JSON.stringify({ status: "rejected" }) });
    assert.equal(result.response.statusCode, 200);
    result = await request(handler, "/api/reviews");
    assert.deepEqual(result.body, { reviews: [] });

    result = await request(handler, "/api/admin/reviews", { headers: { authorization: auth } });
    assert.equal(result.body.reviews[0].status, "rejected");

    result = await request(handler, `/api/admin/reviews/${reviewId}`, { method: "DELETE", headers: { authorization: auth } });
    assert.equal(result.response.statusCode, 200);
    result = await request(handler, "/api/admin/reviews", { headers: { authorization: auth } });
    assert.deepEqual(result.body, { reviews: [] });
    await fs.access(path.join(dataDir, "reviews.json"));
  });
});

test("enquiries validate and can be tracked through admin status updates", async () => {
  await withServer(async (handler, dataDir) => {
    let result = await request(handler, "/api/enquiries", { method: "POST", body: JSON.stringify({ name: "Nia", message: "Too short" }) });
    assert.equal(result.response.statusCode, 422);
    assert.ok(result.body.errors.contact);
    assert.ok(result.body.errors.message);

    result = await request(handler, "/api/enquiries", { method: "POST", body: JSON.stringify({ name: "Nia", email: "not-an-email", phone: "0712345678", message: "I would like to discuss catering for an upcoming gathering and need a menu quote." }) });
    assert.equal(result.response.statusCode, 422);
    assert.ok(result.body.errors.email);
    assert.ok(result.body.errors.phone);

    result = await request(handler, "/api/enquiries", { method: "POST", body: JSON.stringify({ name: "Nia", phone: "+254712345678", message: "I would like to discuss catering for an upcoming gathering and need a menu quote." }) });
    assert.equal(result.response.statusCode, 201);
    assert.equal(result.body.status, "new");

    result = await request(handler, "/api/enquiries", { method: "POST", body: JSON.stringify({ name: "Nia", email: "nia@example.com", message: "I would like to discuss catering for an upcoming gathering and need a menu quote." }) });
    assert.equal(result.response.statusCode, 201);
    assert.equal(result.body.status, "new");
    assert.match(result.body.message, /not a booking confirmation/);
    const enquiries = JSON.parse(await fs.readFile(path.join(dataDir, "enquiries.json"), "utf8"));
    assert.equal(enquiries.length, 2);
    assert.equal(enquiries[1].status, "new");

    result = await request(handler, "/api/admin/enquiries");
    assert.equal(result.response.statusCode, 401);
    const auth = `Basic ${Buffer.from("moderator:correct-horse").toString("base64")}`;
    result = await request(handler, "/api/admin/enquiries", { headers: { authorization: auth } });
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.enquiries.length, 2);
    assert.equal(result.body.enquiries[0].status, "new");

    const enquiryId = result.body.enquiries[0].id;
    result = await request(handler, `/api/admin/enquiries/${enquiryId}`, { method: "PATCH", headers: { authorization: auth }, body: JSON.stringify({ status: "quoted" }) });
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.status, "quoted");

    result = await request(handler, "/api/admin/enquiries", { headers: { authorization: auth } });
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.body.enquiries[0].status, "quoted");
  });
});

test("metrics require a bearer token and expose aggregate persisted activity", async () => {
  await withServer(async (handler, dataDir) => {
    let result = await request(handler, "/metrics");
    assert.equal(result.response.statusCode, 404);

    result = await request(handler, "/api/enquiries", {
      method: "POST",
      body: JSON.stringify({ name: "Private Customer", email: "private@example.com", phone: "+254712345678", message: "Please provide catering details for an upcoming event." })
    });
    assert.equal(result.response.statusCode, 201);

    result = await request(handler, "/api/reviews", {
      method: "POST",
      body: JSON.stringify({ name: "Private Reviewer", rating: 5, text: "A private review that should never appear in metric labels." })
    });
    assert.equal(result.response.statusCode, 201);

    await fs.writeFile(path.join(dataDir, "deployment-state.json"), `${JSON.stringify({
      successes: 2,
      failures: 1,
      rollbacks: 1,
      last_duration_seconds: 18,
      last_success_timestamp_seconds: 1_800_000_000,
      last_result: "success"
    })}\n`);

    result = await request(handler, "/metrics", { headers: { authorization: "Bearer test-metrics-token" } });
    assert.equal(result.response.statusCode, 200);
    assert.match(result.response.body, /http_requests_total\{method="POST",route="api_enquiries",status_code="201",environment="test"\} 1/);
    assert.match(result.response.body, /http_request_duration_seconds_count\{method="POST",route="api_enquiries",environment="test"\} 1/);
    assert.match(result.response.body, /enquiries_submitted_total\{environment="test"\} 1/);
    assert.match(result.response.body, /reviews_submitted_total\{environment="test"\} 1/);
    assert.match(result.response.body, /application_info\{version="test-release",environment="test"\} 1/);
    assert.match(result.response.body, /deployment_successes_total 2/);
    assert.match(result.response.body, /deployment_failures_total 1/);
    assert.match(result.response.body, /deployment_rollbacks_total 1/);
    assert.match(result.response.body, /deployment_duration_seconds 18/);
    assert.match(result.response.body, /deployment_last_success_timestamp_seconds 1800000000/);
    assert.doesNotMatch(result.response.body, /Private Customer|Private Reviewer|private@example\.com|\+254712345678/);

    result = await request(handler, "/metrics", { headers: { authorization: "Bearer test-metrics-token" } });
    assert.equal((result.response.body.match(/deployment_successes_total 2/g) || []).length, 1);
  }, { env: { NODE_ENV: "test" }, metricsToken: "test-metrics-token", appVersion: "test-release" });
});
