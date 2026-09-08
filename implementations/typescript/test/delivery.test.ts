import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  AuditIdentityConflictError,
  InMemoryAuditDeduplicator,
  auditEventIdentity,
} from "../src/delivery.js";
import type { AuditEvent } from "../src/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const baseEvent = JSON.parse(
  readFileSync(resolve(root, "conformance/valid/agent-action.json"), "utf8"),
) as AuditEvent;

function clone(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    ...structuredClone(baseEvent),
    ...overrides,
  };
}

test("accepts the first logical event and deduplicates an identical retry", () => {
  const store = new InMemoryAuditDeduplicator();
  const event = clone({ idempotency_key: "approve:INV-0042" });

  assert.equal(store.accept(event).status, "accepted");
  assert.equal(store.accept(structuredClone(event)).status, "duplicate");
  assert.equal(store.size, 1);
  assert.equal(auditEventIdentity(event), `${event.source}\u0000${event.id}`);
});

test("same source and id with a different payload is an identity collision", () => {
  const store = new InMemoryAuditDeduplicator();
  const event = clone();
  store.accept(event);

  const conflicting = clone({ result: { status: "failed", code: "db_error" } });
  assert.throws(
    () => store.accept(conflicting),
    (error: unknown) => error instanceof AuditIdentityConflictError && /different payloads/.test(error.message),
  );
  assert.equal(store.size, 1);
});

test("same idempotency key cannot silently produce a second event identity", () => {
  const store = new InMemoryAuditDeduplicator();
  const first = clone({ id: "aud_1", idempotency_key: "approve:INV-0042" });
  const second = clone({ id: "aud_2", idempotency_key: "approve:INV-0042" });

  store.accept(first);
  assert.throws(
    () => store.accept(second),
    (error: unknown) => error instanceof AuditIdentityConflictError && /idempotency_key collision/.test(error.message),
  );
  assert.equal(store.size, 1);
});

test("the same id under a different source is a distinct logical event identity", () => {
  const store = new InMemoryAuditDeduplicator();
  const first = clone({ source: "urn:example:erp-a" });
  const second = clone({ source: "urn:example:erp-b" });

  assert.equal(store.accept(first).status, "accepted");
  assert.equal(store.accept(second).status, "accepted");
  assert.equal(store.size, 2);
});

test("property ordering does not create a false identity collision", () => {
  const store = new InMemoryAuditDeduplicator();
  const first = clone({ metadata: { z: 1, a: 2 } });
  const second = clone({ metadata: { a: 2, z: 1 } });

  assert.equal(store.accept(first).status, "accepted");
  assert.equal(store.accept(second).status, "duplicate");
});
