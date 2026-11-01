import crypto from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const MAX_BODY_BYTES = 32_000;
const REVIEW_LIMITS = { name: 120, text: 2_000 };
const ENQUIRY_LIMITS = {
  name: 120,
  email: 254,
  phone: 13,
  eventType: 120,
  eventDate: 10,
  location: 180,
  guests: 20,
  requirements: 2_000,
  message: 4_000
};
const REVIEW_STATUSES = new Set(["approved", "rejected", "pending"]);
const ENQUIRY_STATUSES = new Set(["new", "contacted", "quoted", "booked", "closed"]);

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    },
    body: JSON.stringify(payload)
  };
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, maxLength);
}

function validateReview(input) {
  const value = {
    name: cleanText(input.name, REVIEW_LIMITS.name),
    text: cleanText(input.text, REVIEW_LIMITS.text),
    rating: Number(input.rating)
  };
  const errors = {};
  if (value.name.length < 2) errors.name = "Please enter your name.";
  if (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) errors.rating = "Choose a rating from 1 to 5.";
  if (value.text.length < 10) errors.text = "Please share at least 10 characters.";
  return { errors, value };
}

function validateEnquiry(input, now) {
  const value = Object.fromEntries(Object.entries(ENQUIRY_LIMITS).map(([field, limit]) => [field, cleanText(input[field], limit)]));
  const errors = {};
  if (value.name.length < 2) errors.name = "Please enter your name.";
  if (!value.email && !value.phone) errors.contact = "Please provide an email address or telephone number.";
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.email = "Please enter a valid email address.";
  if (value.phone && !/^\+254\d{9}$/.test(value.phone)) errors.phone = "Use the format +254712345678.";
  if (value.eventDate) {
    const date = new Date(`${value.eventDate}T00:00:00Z`);
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.eventDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.eventDate || date < today) {
      errors.eventDate = "Choose today or a future date.";
    }
  }
  if (value.guests && !/^\d{1,6}$/.test(value.guests)) errors.guests = "Enter a whole-number guest estimate.";
  if (value.message.length < 10) errors.message = "Please tell us a little more about your enquiry.";
  return { errors, value };
}

function requestMethod(event) {
  return event.requestContext?.http?.method || event.httpMethod || "GET";
}

function requestPath(event) {
  return event.rawPath || event.path || "/";
}

function parseBody(event) {
  const rawBody = event.body || "";
  const body = event.isBase64Encoded ? Buffer.from(rawBody, "base64") : Buffer.from(rawBody, "utf8");
  if (body.length > MAX_BODY_BYTES) {
    const error = new Error("Request body is too large.");
    error.statusCode = 413;
    throw error;
  }
  if (body.length === 0) return {};
  try {
    const parsed = JSON.parse(body.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Request body must be an object.");
    return parsed;
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function ownerAuthorized(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims || {};
  let groups = claims["cognito:groups"] || [];
  if (typeof groups === "string") {
    try {
      groups = JSON.parse(groups);
    } catch {
      groups = groups.split(",").map((group) => group.trim());
    }
  }
  return Array.isArray(groups) && groups.includes("owners");
}

function encodeEnquiryNotification(enquiry) {
  return [
    "A new Golden Plate Catering enquiry was received.",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email || "Not provided"}`,
    `Phone: ${enquiry.phone || "Not provided"}`,
    `Event: ${enquiry.eventType || "Not specified"}`,
    `Date: ${enquiry.eventDate || "Not specified"}`,
    `Guests: ${enquiry.guests || "Not specified"}`,
    `Location: ${enquiry.location || "Not specified"}`,
    `Requirements: ${enquiry.requirements || "None provided"}`,
    `Message: ${enquiry.message}`
  ].join("\n");
}

function entityKeys(kind, id) {
  return { PK: `${kind}#${id}`, SK: `${kind}#${id}` };
}

export function createHandlers({
  documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({})),
  snsClient = new SNSClient({}),
  commands = { DeleteCommand, GetCommand, PutCommand, QueryCommand, UpdateCommand, PublishCommand },
  tableName = process.env.TABLE_NAME,
  notificationTopicArn = process.env.ENQUIRY_TOPIC_ARN,
  publicConfig = {
    siteUrl: process.env.SITE_URL || "",
    contact: {
      email: process.env.CONTACT_EMAIL || "",
      phone: process.env.CONTACT_PHONE || "",
      whatsapp: process.env.WHATSAPP_NUMBER || ""
    },
    socials: {
      facebook: process.env.FACEBOOK_URL || "",
      instagram: process.env.INSTAGRAM_URL || "",
      tiktok: process.env.TIKTOK_URL || ""
    },
    auth: process.env.COGNITO_ENABLED === "true" ? {
      enabled: true,
      domain: `https://${process.env.COGNITO_DOMAIN}`,
      clientId: process.env.COGNITO_CLIENT_ID,
      redirectUri: process.env.COGNITO_REDIRECT_URI,
      logoutUri: process.env.COGNITO_LOGOUT_URI
    } : null
  },
  applicationVersion = process.env.APP_VERSION || "serverless",
  now = () => new Date(),
  idGenerator = () => crypto.randomUUID()
} = {}) {
  if (!tableName) {
    throw new Error("TABLE_NAME is required.");
  }

  async function reviewsRead(event) {
    const method = requestMethod(event);
    const path = requestPath(event);
    if (method === "GET" && path === "/api/health") return jsonResponse(200, { status: "ok", persistence: "dynamodb", version: applicationVersion });
    if (method === "GET" && path === "/api/config") return jsonResponse(200, publicConfig);
    if (method !== "GET" || path !== "/api/reviews") return jsonResponse(404, { error: "Not found." });

    const result = await documentClient.send(new commands.QueryCommand({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :approved",
      ExpressionAttributeValues: { ":approved": "REVIEW#APPROVED" },
      ScanIndexForward: false,
      Limit: 50,
      ProjectionExpression: "id, #name, rating, #text, approvedAt",
      ExpressionAttributeNames: { "#name": "name", "#text": "text" }
    }));
    return jsonResponse(200, { reviews: result.Items || [] });
  }

  async function reviewSubmit(event) {
    if (requestMethod(event) !== "POST" || requestPath(event) !== "/api/reviews") return jsonResponse(404, { error: "Not found." });
    try {
      const input = parseBody(event);
      if (cleanText(input.website, 200)) return jsonResponse(400, { error: "Invalid submission." });
      const { errors, value } = validateReview(input);
      if (Object.keys(errors).length) return jsonResponse(422, { errors });
      const submittedAt = now().toISOString();
      const id = idGenerator();
      const review = {
        ...entityKeys("REVIEW", id),
        id,
        ...value,
        status: "pending",
        submittedAt,
        GSI2PK: "REVIEWS",
        GSI2SK: `${submittedAt}#${id}`
      };
      await documentClient.send(new commands.PutCommand({
        TableName: tableName,
        Item: review,
        ConditionExpression: "attribute_not_exists(PK)"
      }));
      return jsonResponse(201, { status: "pending", message: "Thank you. Your review was received and is awaiting moderation." });
    } catch (error) {
      return jsonResponse(error.statusCode || 500, { error: error.statusCode ? error.message : "An unexpected server error occurred." });
    }
  }

  async function enquirySubmit(event) {
    if (requestMethod(event) !== "POST" || requestPath(event) !== "/api/enquiries") return jsonResponse(404, { error: "Not found." });
    try {
      const input = parseBody(event);
      if (cleanText(input.website, 200)) return jsonResponse(400, { error: "Invalid submission." });
      const { errors, value } = validateEnquiry(input, now());
      if (Object.keys(errors).length) return jsonResponse(422, { errors });
      const submittedAt = now().toISOString();
      const id = idGenerator();
      const enquiry = {
        ...entityKeys("ENQUIRY", id),
        id,
        ...value,
        status: "new",
        submittedAt,
        GSI2PK: "ENQUIRIES",
        GSI2SK: `${submittedAt}#${id}`
      };
      await documentClient.send(new commands.PutCommand({
        TableName: tableName,
        Item: enquiry,
        ConditionExpression: "attribute_not_exists(PK)"
      }));
      if (notificationTopicArn) {
        try {
          await snsClient.send(new commands.PublishCommand({
            TopicArn: notificationTopicArn,
            Subject: "New Golden Plate Catering enquiry",
            Message: encodeEnquiryNotification(enquiry)
          }));
        } catch {
          console.error(JSON.stringify({ event: "enquiry-notification-failed", requestId: event.requestContext?.requestId || "unknown" }));
        }
      }
      return jsonResponse(201, { status: "new", message: "Your enquiry was saved. This is not a booking confirmation." });
    } catch (error) {
      return jsonResponse(error.statusCode || 500, { error: error.statusCode ? error.message : "An unexpected server error occurred." });
    }
  }

  async function admin(event) {
    if (!ownerAuthorized(event)) return jsonResponse(403, { error: "Owner access is required." });
    const method = requestMethod(event);
    const path = requestPath(event);
    if (method === "GET" && path === "/api/admin/reviews") {
      const result = await documentClient.send(new commands.QueryCommand({
        TableName: tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :reviews",
        ExpressionAttributeValues: { ":reviews": "REVIEWS" },
        ScanIndexForward: false,
        Limit: 250
      }));
      return jsonResponse(200, { reviews: result.Items || [] });
    }
    if (method === "GET" && path === "/api/admin/enquiries") {
      const result = await documentClient.send(new commands.QueryCommand({
        TableName: tableName,
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :enquiries",
        ExpressionAttributeValues: { ":enquiries": "ENQUIRIES" },
        ScanIndexForward: false,
        Limit: 250
      }));
      return jsonResponse(200, { enquiries: result.Items || [] });
    }

    const reviewMatch = path.match(/^\/api\/admin\/reviews\/([^/]+)$/);
    if (reviewMatch && method === "DELETE") {
      const id = decodeURIComponent(reviewMatch[1]);
      await documentClient.send(new commands.DeleteCommand({
        TableName: tableName,
        Key: entityKeys("REVIEW", id),
        ConditionExpression: "attribute_exists(PK)"
      }));
      return jsonResponse(200, { status: "removed" });
    }
    if (reviewMatch && method === "PATCH") {
      const id = decodeURIComponent(reviewMatch[1]);
      const input = parseBody(event);
      const status = cleanText(input.status, 20);
      if (!REVIEW_STATUSES.has(status)) return jsonResponse(422, { error: "Invalid review status." });
      const approvedAt = status === "approved" ? now().toISOString() : null;
      const result = await documentClient.send(new commands.UpdateCommand({
        TableName: tableName,
        Key: entityKeys("REVIEW", id),
        UpdateExpression: status === "approved"
          ? "SET #status = :status, approvedAt = :approvedAt, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk"
          : "SET #status = :status, approvedAt = :approvedAt REMOVE GSI1PK, GSI1SK",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: status === "approved"
          ? { ":status": status, ":approvedAt": approvedAt, ":gsi1pk": "REVIEW#APPROVED", ":gsi1sk": `${approvedAt}#${id}` }
          : { ":status": status, ":approvedAt": approvedAt },
        ReturnValues: "ALL_NEW"
      }));
      return jsonResponse(200, { status, review: result.Attributes });
    }

    const enquiryMatch = path.match(/^\/api\/admin\/enquiries\/([^/]+)$/);
    if (enquiryMatch && method === "PATCH") {
      const id = decodeURIComponent(enquiryMatch[1]);
      const input = parseBody(event);
      const status = cleanText(input.status, 20);
      if (!ENQUIRY_STATUSES.has(status)) return jsonResponse(422, { error: "Invalid enquiry status." });
      await documentClient.send(new commands.UpdateCommand({
        TableName: tableName,
        Key: entityKeys("ENQUIRY", id),
        UpdateExpression: "SET #status = :status",
        ConditionExpression: "attribute_exists(PK)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": status }
      }));
      return jsonResponse(200, { status });
    }
    return jsonResponse(404, { error: "Not found." });
  }

  return { reviewsRead, reviewSubmit, enquirySubmit, admin };
}

let runtimeHandlers;
function getRuntimeHandlers() {
  runtimeHandlers ||= createHandlers();
  return runtimeHandlers;
}

export const reviewsRead = (event) => getRuntimeHandlers().reviewsRead(event);
export const reviewSubmit = (event) => getRuntimeHandlers().reviewSubmit(event);
export const enquirySubmit = (event) => getRuntimeHandlers().enquirySubmit(event);
export const admin = (event) => getRuntimeHandlers().admin(event);