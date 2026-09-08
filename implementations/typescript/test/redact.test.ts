import assert from "node:assert/strict";
import test from "node:test";
import { redactAuditEvent } from "../src/redact.js";
import type { AuditEvent } from "../src/types.js";

const event: AuditEvent = {
  spec_version: "0.1",
  id: "aud_redact_ts_001",
  source: "urn:test:typescript",
  actor: { type: "user", id: "usr_1" },
  action: "credential.rotate",
  result: { status: "succeeded" },
  changes: {
    after: {
      api_key: "raw-secret",
      nested: { password: "also-secret", safe: "visible" },
    },
  },
  occurred_at: "2026-08-24T16:00:00Z",
  recorded_at: "2026-08-24T16:00:00.001Z",
};

test("redacts known secret keys and records paths", () => {
  const redacted = redactAuditEvent(event);
  const after = redacted.changes?.after as Record<string, unknown>;
  const nested = after.nested as Record<string, unknown>;

  assert.equal(after.api_key, "[REDACTED]");
  assert.equal(nested.password, "[REDACTED]");
  assert.equal(nested.safe, "visible");
  assert.deepEqual(
    redacted.redactions?.map((item) => item.path),
    ["/changes/after/api_key", "/changes/after/nested/password"],
  );
  assert.equal(event.changes?.after?.api_key, "raw-secret");
});

test("redaction is idempotent across retries", () => {
  const once = redactAuditEvent(event);
  const twice = redactAuditEvent(once);

  assert.deepEqual(twice, once);
  assert.equal(twice.redactions?.length, 2);
});

test("explicit JSON-pointer paths are escaped and remain idempotent", () => {
  const value: AuditEvent = {
    ...event,
    id: "aud_redact_ts_002",
    metadata: {
      "credential/with~separator": "sensitive",
    },
  };
  const policy = {
    keys: [],
    paths: ["/metadata/credential~1with~0separator"],
  } as const;

  const once = redactAuditEvent(value, policy);
  const twice = redactAuditEvent(once, policy);

  assert.equal(once.metadata?.["credential/with~separator"], "[REDACTED]");
  assert.deepEqual(once.redactions, [
    {
      path: "/metadata/credential~1with~0separator",
      method: "redacted",
      reason: "sensitive_data",
    },
  ]);
  assert.deepEqual(twice, once);
});
