import { createServer as createHttpServer } from "node:http";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "@prometheus-io/client";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, "data");
const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

const LIMITS = {
  name: 120,
  email: 254,
  phone: 13,
  eventType: 120,
  eventDate: 10,
  location: 180,
  guests: 20,
  requirements: 2_000,
  message: 4_000,
  review: 2_000
};

const ALLOWED_REVIEW_STATUSES = new Set(["approved", "rejected", "pending"]);
const ALLOWED_ENQUIRY_STATUSES = new Set(["new", "contacted", "quoted", "booked", "closed"]);

function loadLocalEnv() {
  try {
    const contents = readFileSync(path.join(ROOT_DIR, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^(["'])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch {
    // Environment variables supplied by the host are sufficient in deployment.
  }
}

loadLocalEnv();

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(value) {
  return value.length <= LIMITS.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidKenyanPhone(value) {
  return /^\+254\d{9}$/.test(value);
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return date >= today;
}

function jsonResponse(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  res.end(body);
}

function securityHeaders() {
  return {
    "Content-Security-Policy": "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; media-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none';",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  };
}

async function ensureJsonFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "[]\n", "utf8");
  }
}

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(content);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeJson(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

function createPersistence({ dataDir, mongoUri, mongoDbName }) {
  if (!mongoUri) {
    const reviewsPath = path.join(dataDir, "reviews.json");
    const enquiriesPath = path.join(dataDir, "enquiries.json");
    return {
      kind: "json-file",
      ready: fs.mkdir(dataDir, { recursive: true }).then(() => Promise.all([ensureJsonFile(reviewsPath), ensureJsonFile(enquiriesPath)])),
      listReviews: () => readJson(reviewsPath),
      async createReview(review) { const reviews = await readJson(reviewsPath); reviews.push(review); await writeJson(reviewsPath, reviews); },
      async updateReview(id, changes) {
        const reviews = await readJson(reviewsPath);
        const index = reviews.findIndex((review) => review.id === id);
        if (index < 0) return false;
        reviews[index] = { ...reviews[index], ...changes };
        await writeJson(reviewsPath, reviews);
        return true;
      },
      async deleteReview(id) {
        const reviews = await readJson(reviewsPath);
        const index = reviews.findIndex((review) => review.id === id);
        if (index < 0) return false;
        reviews.splice(index, 1);
        await writeJson(reviewsPath, reviews);
        return true;
      },
      listEnquiries: () => readJson(enquiriesPath),
      async createEnquiry(enquiry) { const enquiries = await readJson(enquiriesPath); enquiries.push(enquiry); await writeJson(enquiriesPath, enquiries); },
      async updateEnquiry(id, changes) {
        const enquiries = await readJson(enquiriesPath);
        const index = enquiries.findIndex((enquiry) => enquiry.id === id);
        if (index < 0) return false;
        enquiries[index] = { ...enquiries[index], ...changes };
        await writeJson(enquiriesPath, enquiries);
        return true;
      }
    };
  }

  let database;
  return {
    kind: "mongodb",
    ready: (async () => {
      const { MongoClient } = await import("mongodb");
      const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10_000 });
      await client.connect();
      database = client.db(mongoDbName);
      await Promise.all([
        database.collection("reviews").createIndex({ status: 1, approvedAt: -1 }),
        database.collection("enquiries").createIndex({ submittedAt: -1 })
      ]);
    })(),
    listReviews: () => database.collection("reviews").find({}, { projection: { _id: 0 } }).toArray(),
    createReview: (review) => database.collection("reviews").insertOne(review),
    updateReview: async (id, changes) => (await database.collection("reviews").updateOne({ id }, { $set: changes })).matchedCount === 1,
    deleteReview: async (id) => (await database.collection("reviews").deleteOne({ id })).deletedCount === 1,
    listEnquiries: () => database.collection("enquiries").find({}, { projection: { _id: 0 } }).sort({ submittedAt: -1 }).toArray(),
    createEnquiry: (enquiry) => database.collection("enquiries").insertOne(enquiry),
    updateEnquiry: async (id, changes) => (await database.collection("enquiries").updateOne({ id }, { $set: changes })).matchedCount === 1
  };
}

async function readRequestBody(req) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function clientAddress(req) {
  return req.socket.remoteAddress || "unknown";
}

function makeRateLimiter() {
  const attempts = new Map();
  return (key) => {
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);
    if (recent.length >= RATE_LIMIT_MAX) {
      attempts.set(key, recent);
      return false;
    }
    recent.push(now);
    attempts.set(key, recent);
    return true;
  };
}

function basicAuthCredentials(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return null;
  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizedMethod(method) {
  const allowed = new Set(["GET", "HEAD", "POST", "PATCH", "DELETE", "OPTIONS"]);
  return allowed.has(method) ? method : "OTHER";
}

function normalizedRoute(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl || "/", "http://localhost").pathname;
  } catch {
    return "unmatched";
  }
  if (pathname === "/metrics") return "metrics";
  if (["/", "/about/", "/services/", "/work/", "/menu/", "/reviews/", "/contact/", "/privacy/", "/admin/"].includes(pathname)) return "page";
  if (pathname === "/api/health") return "api_health";
  if (pathname === "/api/config") return "api_config";
  if (pathname === "/api/reviews") return "api_reviews";
  if (pathname === "/api/enquiries") return "api_enquiries";
  if (pathname === "/api/admin/reviews") return "api_admin_reviews";
  if (pathname === "/api/admin/enquiries") return "api_admin_enquiries";
  if (/^\/api\/admin\/reviews\/[^/]+$/.test(pathname)) return "api_admin_review_moderation";
  if (/^\/api\/admin\/enquiries\/[^/]+$/.test(pathname)) return "api_admin_enquiry_moderation";
  if (pathname.startsWith("/api/")) return "api_unknown";
  if (pathname.startsWith("/assets/")) return "static_asset";
  return "page";
}

function createApplicationMetrics({ applicationVersion, environment }) {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });
  const httpRequests = new Counter({
    name: "http_requests_total",
    help: "Completed HTTP requests.",
    labelNames: ["method", "route", "status_code", "environment"],
    registers: [registry]
  });
  const httpRequestsFailed = new Counter({
    name: "http_requests_failed_total",
    help: "HTTP requests that completed with a server error.",
    labelNames: ["method", "route", "status_code", "environment"],
    registers: [registry]
  });
  const httpRequestDuration = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request duration in seconds.",
    labelNames: ["method", "route", "environment"],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry]
  });
  const enquiriesSubmitted = new Counter({
    name: "enquiries_submitted_total",
    help: "Enquiries successfully persisted by the application.",
    labelNames: ["environment"],
    registers: [registry]
  });
  const enquiriesFailed = new Counter({
    name: "enquiries_failed_total",
    help: "Enquiry requests that were not successfully persisted.",
    labelNames: ["environment"],
    registers: [registry]
  });
  const reviewsSubmitted = new Counter({
    name: "reviews_submitted_total",
    help: "Reviews successfully persisted by the application.",
    labelNames: ["environment"],
    registers: [registry]
  });
  const applicationInfo = new Gauge({
    name: "application_info",
    help: "Application release and environment information.",
    labelNames: ["version", "environment"],
    registers: [registry]
  });
  const deploymentSuccesses = new Counter({
    name: "deployment_successes_total",
    help: "Successful production deployments recorded by the host deployer.",
    registers: [registry]
  });
  const deploymentFailures = new Counter({
    name: "deployment_failures_total",
    help: "Failed production deployments recorded by the host deployer.",
    registers: [registry]
  });
  const deploymentRollbacks = new Counter({
    name: "deployment_rollbacks_total",
    help: "Successful release rollbacks recorded by the host deployer.",
    registers: [registry]
  });
  const deploymentDuration = new Gauge({
    name: "deployment_duration_seconds",
    help: "Duration of the most recently completed deployment attempt.",
    registers: [registry]
  });
  const deploymentLastSuccess = new Gauge({
    name: "deployment_last_success_timestamp_seconds",
    help: "Unix timestamp of the most recent successful release activation.",
    registers: [registry]
  });
  const deploymentLastResult = new Gauge({
    name: "deployment_last_result",
    help: "Outcome of the most recent deployment attempt.",
    labelNames: ["result"],
    registers: [registry]
  });
  applicationInfo.set({ version: applicationVersion, environment }, 1);
  const knownDeploymentTotals = { successes: 0, failures: 0, rollbacks: 0 };
  return {
    registry,
    httpRequests,
    httpRequestsFailed,
    httpRequestDuration,
    enquiriesSubmitted,
    enquiriesFailed,
    reviewsSubmitted,
    knownDeploymentTotals,
    deploymentSuccesses,
    deploymentFailures,
    deploymentRollbacks,
    deploymentDuration,
    deploymentLastSuccess,
    deploymentLastResult
  };
}

async function refreshDeploymentMetrics(metrics, statePath) {
  try {
    const state = JSON.parse(await fs.readFile(statePath, "utf8"));
    for (const [key, counter, field] of [
      ["successes", metrics.deploymentSuccesses, "successes"],
      ["failures", metrics.deploymentFailures, "failures"],
      ["rollbacks", metrics.deploymentRollbacks, "rollbacks"]
    ]) {
      const total = Number.isSafeInteger(state[field]) && state[field] >= 0 ? state[field] : 0;
      if (total > metrics.knownDeploymentTotals[key]) counter.inc(total - metrics.knownDeploymentTotals[key]);
      metrics.knownDeploymentTotals[key] = Math.max(metrics.knownDeploymentTotals[key], total);
    }
    metrics.deploymentDuration.set(Number.isFinite(state.last_duration_seconds) ? state.last_duration_seconds : 0);
    metrics.deploymentLastSuccess.set(Number.isFinite(state.last_success_timestamp_seconds) ? state.last_success_timestamp_seconds : 0);
    const result = ["success", "failure", "rollback", "unknown"].includes(state.last_result) ? state.last_result : "unknown";
    metrics.deploymentLastResult.reset();
    metrics.deploymentLastResult.set({ result }, 1);
  } catch {
    metrics.deploymentLastResult.reset();
    metrics.deploymentLastResult.set({ result: "unknown" }, 1);
  }
}

function authorizeAdmin(req, config) {
  const credentials = basicAuthCredentials(req);
  const valid = Boolean(
    config.adminUsername &&
      config.adminPassword &&
      credentials &&
      safeEqual(credentials.username, config.adminUsername) &&
      safeEqual(credentials.password, config.adminPassword)
  );
  if (!valid) return false;
  return true;
}

function adminRequired(res) {
  jsonResponse(res, 401, { error: "Administrator authentication is required." }, { "WWW-Authenticate": 'Basic realm="Golden Plate moderation"' });
}

function validateReview(input) {
  const name = cleanText(input.name, LIMITS.name);
  const text = cleanText(input.text, LIMITS.review);
  const rating = Number(input.rating);
  const errors = {};
  if (name.length < 2) errors.name = "Please enter your name.";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) errors.rating = "Choose a rating from 1 to 5.";
  if (text.length < 10) errors.text = "Please share at least 10 characters.";
  return { errors, value: { name, rating, text } };
}

function validateEnquiry(input) {
  const value = {
    name: cleanText(input.name, LIMITS.name),
    email: cleanText(input.email, LIMITS.email),
    phone: cleanText(input.phone, LIMITS.phone),
    eventType: cleanText(input.eventType, LIMITS.eventType),
    eventDate: cleanText(input.eventDate, LIMITS.eventDate),
    location: cleanText(input.location, LIMITS.location),
    guests: cleanText(input.guests, LIMITS.guests),
    requirements: cleanText(input.requirements, LIMITS.requirements),
    message: cleanText(input.message, LIMITS.message)
  };
  const errors = {};
  if (value.name.length < 2) errors.name = "Please enter your name.";
  if (!value.email && !value.phone) errors.contact = "Please provide an email address or telephone number.";
  if (value.email && !isValidEmail(value.email)) errors.email = "Please enter a valid email address.";
  if (value.phone && !isValidKenyanPhone(value.phone)) errors.phone = "Use the format +254712345678.";
  if (value.eventDate && !isValidDate(value.eventDate)) errors.eventDate = "Choose today or a future date.";
  if (value.guests && !/^\d{1,6}$/.test(value.guests)) errors.guests = "Enter a whole-number guest estimate.";
  if (value.message.length < 10) errors.message = "Please tell us a little more about your enquiry.";
  return { errors, value };
}

function publicConfig(env) {
  return {
    siteUrl: env.SITE_URL || "",
    contact: {
      email: env.CONTACT_EMAIL || "",
      phone: env.CONTACT_PHONE || "",
      whatsapp: env.WHATSAPP_NUMBER || ""
    },
    socials: {
      facebook: env.FACEBOOK_URL || "",
      instagram: env.INSTAGRAM_URL || "",
      tiktok: env.TIKTOK_URL || ""
    }
  };
}

async function serveFile(res, filePath, contentType, cacheControl = "no-cache") {
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": cacheControl, ...securityHeaders() });
    res.end(data);
  } catch {
    jsonResponse(res, 404, { error: "Not found." }, securityHeaders());
  }
}

function resolveInside(baseDir, relativePath) {
  const resolved = path.resolve(baseDir, relativePath);
  return resolved.startsWith(`${path.resolve(baseDir)}${path.sep}`) ? resolved : null;
}

export function createServer(options = {}) {
  const env = options.env || process.env;
  const dataDir = options.dataDir || env.DATA_DIR || DEFAULT_DATA_DIR;
  const applicationVersion = options.appVersion || env.APP_VERSION || "development";
  const environment = ["production", "test", "development"].includes(env.NODE_ENV) ? env.NODE_ENV : "other";
  const metricsToken = options.metricsToken ?? env.METRICS_TOKEN ?? "";
  const deploymentStatePath = options.deploymentStatePath || env.DEPLOYMENT_STATE_FILE || path.join(dataDir, "deployment-state.json");
  const metrics = createApplicationMetrics({ applicationVersion, environment });
  const config = {
    adminUsername: options.adminUsername ?? env.ADMIN_USERNAME ?? "",
    adminPassword: options.adminPassword ?? env.ADMIN_PASSWORD ?? ""
  };
  const persistence = createPersistence({
    dataDir,
    mongoUri: options.mongoUri ?? env.MONGODB_URI ?? "",
    mongoDbName: options.mongoDbName ?? env.MONGODB_DB ?? "golden_plate_catering"
  });
  const reviewRateLimit = makeRateLimiter();
  const enquiryRateLimit = makeRateLimiter();

  const ready = persistence.ready;

  const server = createHttpServer(async (req, res) => {
    for (const [header, value] of Object.entries(securityHeaders())) res.setHeader(header, value);
    const method = req.method || "GET";
    const route = normalizedRoute(req.url);
    const metricMethod = normalizedMethod(method);
    const requestStarted = process.hrtime.bigint();
    if (route !== "metrics") {
      res.once?.("finish", () => {
        const statusCode = String(res.statusCode || 200);
        const labels = { method: metricMethod, route, status_code: statusCode, environment };
        metrics.httpRequests.inc(labels);
        if (Number(statusCode) >= 500) metrics.httpRequestsFailed.inc(labels);
        metrics.httpRequestDuration.observe({ method: metricMethod, route, environment }, Number(process.hrtime.bigint() - requestStarted) / 1e9);
        if (route === "api_enquiries" && statusCode !== "201") metrics.enquiriesFailed.inc({ environment });
      });
    }
    try {
      if (route === "metrics") {
        const authorization = req.headers.authorization || "";
        const suppliedToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
        if (method !== "GET") return jsonResponse(res, 405, { error: "Method not allowed." }, { Allow: "GET" });
        if (!metricsToken || !safeEqual(suppliedToken, metricsToken)) return jsonResponse(res, 404, { error: "Not found." });
        await refreshDeploymentMetrics(metrics, deploymentStatePath);
        res.writeHead(200, { "Content-Type": metrics.registry.contentType, "Cache-Control": "no-store" });
        return res.end(await metrics.registry.metrics());
      }
      await ready;
      const url = new URL(req.url || "/", "http://localhost");

      if (url.pathname === "/api/health" && method === "GET") {
        return jsonResponse(res, 200, { status: "ok", persistence: persistence.kind, version: applicationVersion });
      }

      if (url.pathname === "/api/config" && method === "GET") {
        return jsonResponse(res, 200, publicConfig(env));
      }

      if (url.pathname === "/api/reviews" && method === "GET") {
        const reviews = await persistence.listReviews();
        const approved = reviews
          .filter((review) => review.status === "approved")
          .sort((a, b) => String(b.approvedAt || b.submittedAt).localeCompare(String(a.approvedAt || a.submittedAt)))
          .map(({ id, name, rating, text, approvedAt }) => ({ id, name, rating, text, approvedAt }));
        return jsonResponse(res, 200, { reviews: approved });
      }

      if (url.pathname === "/api/reviews" && method === "POST") {
        if (!reviewRateLimit(clientAddress(req))) return jsonResponse(res, 429, { error: "Too many submissions. Please try again later." });
        const input = await readRequestBody(req);
        if (cleanText(input.website, 200)) return jsonResponse(res, 400, { error: "Invalid submission." });
        const { errors, value } = validateReview(input);
        if (Object.keys(errors).length) return jsonResponse(res, 422, { errors });
        const review = {
          id: crypto.randomUUID(),
          ...value,
          status: "pending",
          submittedAt: new Date().toISOString()
        };
        await persistence.createReview(review);
        metrics.reviewsSubmitted.inc({ environment });
        return jsonResponse(res, 201, { status: "pending", message: "Thank you. Your review was received and is awaiting moderation." });
      }

      metrics.enquiriesSubmitted.inc({ environment });
      if (url.pathname === "/api/enquiries" && method === "POST") {
        if (!enquiryRateLimit(clientAddress(req))) return jsonResponse(res, 429, { error: "Too many submissions. Please try again later." });
        const input = await readRequestBody(req);
        if (cleanText(input.website, 200)) return jsonResponse(res, 400, { error: "Invalid submission." });
        const { errors, value } = validateEnquiry(input);
        if (Object.keys(errors).length) return jsonResponse(res, 422, { errors });
        const enquiry = { id: crypto.randomUUID(), ...value, status: "new", submittedAt: new Date().toISOString() };
        await persistence.createEnquiry(enquiry);
        return jsonResponse(res, 201, { status: "new", message: "Your enquiry was saved. This is not a booking confirmation." });
      }

      if (url.pathname === "/api/admin/reviews" && method === "GET") {
        if (!authorizeAdmin(req, config)) return adminRequired(res);
        const reviews = await persistence.listReviews();
        return jsonResponse(res, 200, { reviews });
      }

      if (url.pathname === "/api/admin/enquiries" && method === "GET") {
        if (!authorizeAdmin(req, config)) return adminRequired(res);
        const enquiries = await persistence.listEnquiries();
        return jsonResponse(res, 200, { enquiries: enquiries.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""))) });
      }

      const moderationMatch = url.pathname.match(/^\/api\/admin\/reviews\/([^/]+)$/);
      if (moderationMatch && (method === "PATCH" || method === "DELETE")) {
        if (!authorizeAdmin(req, config)) return adminRequired(res);
        if (method === "DELETE") {
          if (!await persistence.deleteReview(moderationMatch[1])) return jsonResponse(res, 404, { error: "Review not found." });
          return jsonResponse(res, 200, { status: "removed" });
        }
        const input = await readRequestBody(req);
        const status = cleanText(input.status, 20);
        if (!ALLOWED_REVIEW_STATUSES.has(status)) return jsonResponse(res, 422, { error: "Invalid review status." });
        const changes = status === "approved" ? { status, approvedAt: new Date().toISOString() } : { status, approvedAt: null };
        if (!await persistence.updateReview(moderationMatch[1], changes)) return jsonResponse(res, 404, { error: "Review not found." });
        return jsonResponse(res, 200, { status });
      }

      const enquiryModerationMatch = url.pathname.match(/^\/api\/admin\/enquiries\/([^/]+)$/);
      if (enquiryModerationMatch && method === "PATCH") {
        if (!authorizeAdmin(req, config)) return adminRequired(res);
        const input = await readRequestBody(req);
        const status = cleanText(input.status, 20);
        if (!ALLOWED_ENQUIRY_STATUSES.has(status)) return jsonResponse(res, 422, { error: "Invalid enquiry status." });
        if (!await persistence.updateEnquiry(enquiryModerationMatch[1], { status })) return jsonResponse(res, 404, { error: "Enquiry not found." });
        return jsonResponse(res, 200, { status });
      }

      if (method !== "GET" && method !== "HEAD") return jsonResponse(res, 405, { error: "Method not allowed." }, { Allow: "GET, HEAD" });

      if (url.pathname.startsWith("/assets/")) {
        const relative = decodeURIComponent(url.pathname.slice("/assets/".length));
        const assetPath = resolveInside(ASSETS_DIR, relative);
        if (!assetPath) return jsonResponse(res, 400, { error: "Invalid path." });
        const extension = path.extname(assetPath).toLowerCase();
        return serveFile(res, assetPath, MIME_TYPES[extension] || "application/octet-stream", "public, max-age=31536000, immutable");
      }

      let relative = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
      let filePath = resolveInside(PUBLIC_DIR, relative);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) throw new Error("Not a file");
      } catch {
        filePath = path.join(PUBLIC_DIR, "index.html");
      }
      const extension = path.extname(filePath).toLowerCase();
      return serveFile(res, filePath, MIME_TYPES[extension] || "application/octet-stream");
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) console.error(error);
      return jsonResponse(res, status, { error: status >= 500 ? "An unexpected server error occurred." : error.message }, securityHeaders());
    }
  });

  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  const server = createServer();
  server.listen(port, host, () => console.log(`Golden Plate Catering listening at http://${host}:${port}`));
}
