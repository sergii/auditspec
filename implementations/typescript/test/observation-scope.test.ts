import assert from "node:assert/strict";
import test from "node:test";
import {
  compareObservationScopes,
  unknownObservationScope,
  type RuntimeObservationScope,
} from "../src/observation-scope.js";

function declared(overrides: Partial<RuntimeObservationScope> = {}): RuntimeObservationScope {
  return {
    scope_version: "0.1",
    basis: "declared",
    environment: "staging",
    window: {
      start: "2026-08-25T00:00:00Z",
      end: "2026-08-25T01:00:00Z",
    },
    collection_policy: {
      id: "runtime-hourly-v1",
      version: "1.0",
      mode: "continuous",
    },
    producers: [
      { name: "postgres-audit-observer", type: "database", version: "0.1" },
      { name: "otel-collector", type: "collector", version: "0.1" },
    ],
    ...overrides,
  };
}

test("treats fully declared matching observation protocols as comparable", () => {
  const base = declared();
  const head = declared({
    window: {
      start: "2026-08-25T02:00:00Z",
      end: "2026-08-25T03:00:00Z",
    },
  });

  const result = compareObservationScopes(base, head);
  assert.equal(result.status, "comparable");
  assert.deepEqual(result.dimensions, {
    environment: "match",
    window: "match",
    collection_policy: "match",
    producers: "match",
  });
});

test("different producer sets are not comparable", () => {
  const result = compareObservationScopes(
    declared(),
    declared({ producers: [{ name: "otel-collector", type: "collector", version: "0.1" }] }),
  );
  assert.equal(result.status, "not_comparable");
  assert.equal(result.dimensions.producers, "mismatch");
});

test("different window durations are only partially comparable when the protocol matches", () => {
  const result = compareObservationScopes(
    declared(),
    declared({
      window: {
        start: "2026-08-25T02:00:00Z",
        end: "2026-08-25T02:30:00Z",
      },
    }),
  );
  assert.equal(result.status, "partially_comparable");
  assert.equal(result.dimensions.window, "mismatch");
});

test("unknown scope remains explicitly unknown", () => {
  const result = compareObservationScopes(unknownObservationScope(), declared());
  assert.equal(result.status, "unknown");
  assert.ok(result.reasons.some((reason) => reason.includes("does not declare enough")));
});
