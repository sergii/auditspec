import assert from "node:assert/strict";
import test from "node:test";
import { getRuntimeProducer, listRuntimeProducers } from "../src/runtime-producer-registry.js";

test("loads schema-valid runtime producer manifests", () => {
  const manifests = listRuntimeProducers();
  assert.deepEqual(
    manifests.map((manifest) => manifest.id),
    ["database-receipt", "delivery-receipt", "opentelemetry"],
  );
});

test("OpenTelemetry producer advertises conservative defaults", () => {
  const manifest = getRuntimeProducer("opentelemetry");
  assert.ok(manifest);
  assert.equal(manifest.default_trust, "attributed");
  assert.equal(manifest.default_coverage, "point");
  assert.equal(manifest.explicit_target_required, true);
});

test("database receipt authority is explicitly narrow", () => {
  const manifest = getRuntimeProducer("database-receipt");
  assert.ok(manifest);
  assert.equal(manifest.default_trust, "authoritative");
  assert.ok(manifest.authority_scope.some((item) => item.includes("transaction commit")));
  assert.ok(manifest.limitations.some((item) => item.includes("business intent")));
});

test("delivery receipts default to attributed rather than authoritative", () => {
  const manifest = getRuntimeProducer("delivery-receipt");
  assert.ok(manifest);
  assert.equal(manifest.default_trust, "attributed");
});

test("unknown producer id returns null", () => {
  assert.equal(getRuntimeProducer("ebpf"), null);
});
