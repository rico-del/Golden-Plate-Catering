import assert from "node:assert/strict";
import test from "node:test";
import { createHandlers } from "../lambda/src/handlers.mjs";

function makeCommands() {
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DeleteCommand: class DeleteCommand extends Command {},
    GetCommand: class GetCommand extends Command {},
    PutCommand: class PutCommand extends Command {},
    QueryCommand: class QueryCommand extends Command {},
    UpdateCommand: class UpdateCommand extends Command {},
    PublishCommand: class PublishCommand extends Command {}
  };
}

function event(path, method = "GET", body, groups = undefined) {
  return {
    rawPath: path,
    requestContext: {
      http: { method },
      requestId: "request-test",
      ...(groups === undefined ? {} : { authorizer: { jwt: { claims: { "cognito:groups": JSON.stringify(groups) } } } })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };
}

function responseBody(result) {
  return JSON.parse(result.body);
}

test("public review reads query only the approved review index", async () => {
  const calls = [];
  const handlers = createHandlers({
    tableName: "test-table",
    commands: makeCommands(),
    documentClient: { async send(command) { calls.push(command); return { Items: [{ id: "approved-1", status: "approved" }] }; } }
  });

  const result = await handlers.reviewsRead(event("/api/reviews"));

  assert.equal(result.statusCode, 200);
  assert.deepEqual(responseBody(result), { reviews: [{ id: "approved-1", status: "approved" }] });
  assert.equal(calls[0].input.IndexName, "GSI1");
  assert.equal(calls[0].input.ExpressionAttributeValues[":approved"], "REVIEW#APPROVED");
});

test("review submit always stores pending, ignoring a caller-supplied status", async () => {
  const calls = [];
  const handlers = createHandlers({
    tableName: "test-table",
    commands: makeCommands(),
    documentClient: { async send(command) { calls.push(command); return {}; } },
    now: () => new Date("2026-11-01T12:00:00.000Z"),
    idGenerator: () => "review-id"
  });

  const result = await handlers.reviewSubmit(event("/api/reviews", "POST", {
    name: "Amina",
    rating: 5,
    text: "A useful and genuine review.",
    status: "approved"
  }));

  assert.equal(result.statusCode, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input.Item.status, "pending");
  assert.equal(calls[0].input.Item.PK, "REVIEW#review-id");
});

test("enquiry is persisted before an SNS notification is sent", async () => {
  const events = [];
  const handlers = createHandlers({
    tableName: "test-table",
    notificationTopicArn: "arn:aws:sns:eu-west-1:123456789012:golden-plate-enquiries",
    commands: makeCommands(),
    documentClient: { async send(command) { events.push(["dynamodb", command]); return {}; } },
    snsClient: { async send(command) { events.push(["sns", command]); return {}; } },
    now: () => new Date("2026-11-01T12:00:00.000Z"),
    idGenerator: () => "enquiry-id"
  });

  const result = await handlers.enquirySubmit(event("/api/enquiries", "POST", {
    name: "Nia",
    email: "nia@example.com",
    phone: "+254712345678",
    message: "Please provide catering information for an upcoming event."
  }));

  assert.equal(result.statusCode, 201);
  assert.deepEqual(events.map(([type]) => type), ["dynamodb", "sns"]);
  assert.equal(events[0][1].input.Item.status, "new");
  assert.equal(events[0][1].input.Item.GSI2PK, "ENQUIRIES");
  assert.equal(events[1][1].input.TopicArn, "arn:aws:sns:eu-west-1:123456789012:golden-plate-enquiries");
  assert.match(events[1][1].input.Message, /nia@example\.com/);
  assert.doesNotMatch(result.body, /nia@example\.com|\+254712345678/);
});

test("moderation requires membership in the owner Cognito group", async () => {
  let commandCount = 0;
  const handlers = createHandlers({
    tableName: "test-table",
    commands: makeCommands(),
    documentClient: { async send() { commandCount += 1; return { Items: [] }; } }
  });

  const unauthorized = await handlers.admin(event("/api/admin/enquiries"));
  const nonOwner = await handlers.admin(event("/api/admin/enquiries", "GET", undefined, ["customers"]));
  const owner = await handlers.admin(event("/api/admin/enquiries", "GET", undefined, ["owners"]));

  assert.equal(unauthorized.statusCode, 403);
  assert.equal(nonOwner.statusCode, 403);
  assert.equal(owner.statusCode, 200);
  assert.equal(commandCount, 1);
});