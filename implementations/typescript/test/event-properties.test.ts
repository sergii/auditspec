import assert from "node:assert/strict";
import test from "node:test";
import { fromCloudEvent, toCloudEvent } from "../src/cloudevents.js";
import { normalizeAuditEvent } from "../src/normalize.js";
import { redactAuditEvent } from "../src/redact.js";
import type { ActorType, AuditEvent, Evidence } from "../src/types.js";
import { validateAuditEvent } from "../src/validate.js";

class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1103515245) + 12345) >>> 0;
    return this.state / 0x1_0000_0000;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  bool(): boolean {
    return this.next() < 0.5;
  }
}

const actorTypes: ActorType[] = ["user", "agent", "service", "api_key", "system", "automation"];
const trusts: Evidence["trust"][] = ["authoritative", "attributed", "self_reported", "derived"];

function generatedEvent(seed: number): AuditEvent {
  const random = new DeterministicRandom(seed);
  const denied = random.next() < 0.15;
  const actorType = actorTypes[random.int(actorTypes.length)] ?? "user";
  const trust = trusts[random.int(trusts.length)] ?? "derived";
  const withTarget = random.bool();
  const withEvidence = random.bool();

  return {
    spec_version: "0.1",
    id: `aud_property_${seed}`,
    source: `urn:property:service:${seed % 7}`,
    tenant: { type: "organization", id: `org_${seed % 11}` },
    actor: { type: actorType, id: `${actorType}_${seed}` },
    action: `resource.action_${seed % 13}`,
    action_version: 1 + (seed % 3),
    ...(withTarget
      ? {
          targets: [
            {
              type: "resource",
              id: `res_${seed}`,
              role: "primary",
              metadata: { shard: seed % 5 },
            },
          ],
        }
      : {}),
    authorization: {
      decision: denied ? "denied" : "allowed",
      reason: denied ? "policy_denied" : "policy_allowed",
      policy: { id: "property-policy", version: String(seed % 4) },
    },
    result: denied
      ? { status: "not_executed", code: "authorization_denied" }
      : { status: "succeeded" },
    changes: denied
      ? undefined
      : {
          fields: ["status"],
          before: { status: "before", nested: { token: `secret-${seed}` } },
          after: { status: "after", nested: { token: `secret-${seed + 1}` } },
        },
    producer: { name: "property-generator", version: "0.1" },
    ...(withEvidence
      ? {
          evidence: [
            {
              kind: "property_test",
              producer: { name: "property-generator", version: "0.1" },
              trust,
              metadata: { seed },
            },
          ],
        }
      : {}),
    metadata: {
      zeta: seed,
      alpha: `value-${seed}`,
      nested: {
        token: `metadata-secret-${seed}`,
        safe: true,
      },
    },
    occurred_at: "2026-08-24T20:00:00Z",
    recorded_at: "2026-08-24T20:00:00.001Z",
  };
}

test("generated events remain valid and normalization is idempotent", () => {
  for (let seed = 1; seed <= 500; seed += 1) {
    const event = generatedEvent(seed);
    assert.equal(validateAuditEvent(event).valid, true, `seed ${seed}: input validity`);

    const normalized = normalizeAuditEvent(event);
    assert.equal(validateAuditEvent(normalized).valid, true, `seed ${seed}: normalized validity`);
    assert.deepEqual(normalizeAuditEvent(normalized), normalized, `seed ${seed}: normalization idempotence`);
    assert.equal(event.metadata?.zeta, seed, `seed ${seed}: input must not be mutated`);
  }
});

test("generated events round-trip losslessly through CloudEvents", () => {
  for (let seed = 501; seed <= 800; seed += 1) {
    const event = generatedEvent(seed);
    const envelope = toCloudEvent(event);
    const roundTrip = fromCloudEvent(envelope);

    assert.deepEqual(roundTrip, event, `seed ${seed}: CloudEvents round trip`);
    assert.equal(envelope.id, event.id, `seed ${seed}: id mapping`);
    assert.equal(envelope.source, event.source, `seed ${seed}: source mapping`);
    assert.equal(envelope.type, event.action, `seed ${seed}: action mapping`);
  }
});

test("generated event redaction is valid, secret-safe, and retry-idempotent", () => {
  for (let seed = 801; seed <= 1_000; seed += 1) {
    const event = generatedEvent(seed);
    const once = redactAuditEvent(event);
    const twice = redactAuditEvent(once);

    assert.deepEqual(twice, once, `seed ${seed}: redaction idempotence`);
    assert.equal(validateAuditEvent(once).valid, true, `seed ${seed}: redacted validity`);

    const serialized = JSON.stringify(once);
    assert.equal(serialized.includes(`metadata-secret-${seed}`), false, `seed ${seed}: metadata secret removed`);
    if (event.changes) {
      assert.equal(serialized.includes(`secret-${seed}`), false, `seed ${seed}: before secret removed`);
      assert.equal(serialized.includes(`secret-${seed + 1}`), false, `seed ${seed}: after secret removed`);
    }
  }
});
