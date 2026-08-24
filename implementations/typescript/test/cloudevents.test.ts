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
  assert.deepEqual(fromCloudEvent(envelope), event);
});

test("rejects envelope and payload identity mismatch", () => {
  const envelope = toCloudEvent(event);
  assert.throws(() => fromCloudEvent({ ...envelope, id: "different" }), /does not match/);
});
