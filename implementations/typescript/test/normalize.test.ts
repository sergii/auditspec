import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAuditEvent } from "../src/normalize.js";
import type { AuditEvent } from "../src/types.js";

const event: AuditEvent = {
  recorded_at: "2026-08-24T16:00:00.001Z",
  occurred_at: "2026-08-24T16:00:00Z",
  result: { status: "succeeded" },
  action: "project.update",
  actor: { id: "usr_1", type: "user" },
  source: "urn:test:typescript",
  id: "aud_normalize_001",
  spec_version: "0.1",
};

test("produces deterministic object-key ordering without changing semantics", () => {
  const first = JSON.stringify(normalizeAuditEvent(event));
  const second = JSON.stringify(normalizeAuditEvent(structuredClone(event)));
  assert.equal(first, second);
  assert.equal(normalizeAuditEvent(event).id, event.id);
});
