import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { fromCloudEvent, toCloudEvent } from "../src/cloudevents.js";
import type { AuditEvent } from "../src/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const event = JSON.parse(
  readFileSync(resolve(root, "conformance/valid/agent-action.json"), "utf8"),
) as AuditEvent;

test("round-trips an AuditSpec event through a CloudEvents envelope", () => {
  const envelope = toCloudEvent(event);
  assert.equal(envelope.id, event.id);
  assert.equal(envelope.source, event.source);
  assert.equal(envelope.type, event.action);
  assert.equal(envelope.time, event.occurred_at);
  assert.equal(envelope.auditspecversion, event.spec_version);
  assert.equal(envelope.datacontenttype, "application/json");
  assert.deepEqual(fromCloudEvent(envelope), event);
});

test("rejects envelope and payload identity mismatch", () => {
  const envelope = toCloudEvent(event);
  assert.throws(() => fromCloudEvent({ ...envelope, id: "different" }), /does not match/);
  assert.throws(() => fromCloudEvent({ ...envelope, source: "urn:different" }), /source does not match/);
  assert.throws(() => fromCloudEvent({ ...envelope, type: "different.action" }), /type does not match/);
  assert.throws(() => fromCloudEvent({ ...envelope, time: "2026-08-24T00:00:00Z" }), /time does not match/);
  assert.throws(() => fromCloudEvent({ ...envelope, auditspecversion: "9.9" }), /version does not match/);
});

test("rejects conflicting CloudEvents semantic envelope fields", () => {
  const envelope = toCloudEvent(event);

  assert.throws(
    () => fromCloudEvent({ ...envelope, datacontenttype: "text/plain" as "application/json" }),
    /datacontenttype must be application\/json/,
  );
  assert.throws(
    () => fromCloudEvent({ ...envelope, subject: "invoice/DIFFERENT" }),
    /subject does not match/,
  );
  assert.throws(
    () => fromCloudEvent({ ...envelope, dataschema: "https://example.com/wrong-schema" }),
    /dataschema does not match/,
  );
});

test("accepts optional CloudEvents subject, time, and dataschema when omitted", () => {
  const envelope = toCloudEvent(event);
  const withoutOptional = {
    ...envelope,
    subject: undefined,
    time: undefined,
    dataschema: undefined,
  };

  assert.deepEqual(fromCloudEvent(withoutOptional), event);
});
