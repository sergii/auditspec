import assert from "node:assert/strict";
import test from "node:test";
import { runtimeEvidenceFromOpenTelemetry } from "../src/opentelemetry-runtime.js";
import { validateRuntimeEvidenceRecord } from "../src/validate.js";

test("maps an explicitly targeted OpenTelemetry span into point runtime evidence", () => {
  const record = runtimeEvidenceFromOpenTelemetry({
    signal: "span",
    observed_at: "2026-08-24T22:10:00Z",
    name: "RefundService.call",
    trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
    span_id: "00f067aa0ba902b7",
    resource: {
      "service.name": "billing-service",
      "service.version": "1.4.2",
      "service.instance.id": "billing-7",
    },
    attributes: {
      "auditspec.boundary.fingerprint": "bfp_refund_update_001",
      "auditspec.event.source": "urn:example:billing",
      "auditspec.event.id": "aud_example_001",
    },
  });

  assert.equal(validateRuntimeEvidenceRecord(record).valid, true);
  assert.equal(record.kind, "trace_span");
  assert.equal(record.trust, "attributed");
  assert.equal(record.observation.state, "observed");
  assert.equal(record.observation.coverage, "point");
  assert.equal(record.targets?.boundary_fingerprint, "bfp_refund_update_001");
  assert.equal(record.correlation?.trace_id, "4bf92f3577b34da6a3ce929d0e0e4736");
  assert.equal(record.producer.name, "billing-service");
});

test("does not infer an AuditSpec target from an OpenTelemetry span name", () => {
  assert.throws(
    () =>
      runtimeEvidenceFromOpenTelemetry({
        signal: "span",
        observed_at: "2026-08-24T22:10:00Z",
        name: "RefundService.call",
        trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
        span_id: "00f067aa0ba902b7",
        attributes: {},
      }),
    /explicit auditspec\.boundary\.fingerprint or auditspec\.finding\.fingerprint/,
  );
});

test("explicit exhaustive coverage is preserved rather than inferred", () => {
  const record = runtimeEvidenceFromOpenTelemetry(
    {
      signal: "log",
      observed_at: "2026-08-24T22:10:00Z",
      name: "audit coverage inventory",
      attributes: {
        "auditspec.evidence.id": "otel_inventory_001",
        "auditspec.finding.fingerprint": "fp_example_001",
      },
    },
    {
      coverage: "exhaustive",
      state: "not_observed",
      detail: "A separately established complete inventory did not observe the targeted fact.",
    },
  );

  assert.equal(record.observation.coverage, "exhaustive");
  assert.equal(record.observation.state, "not_observed");
});

test("allows a caller to lower trust but never upgrades trust implicitly", () => {
  const record = runtimeEvidenceFromOpenTelemetry(
    {
      signal: "span",
      observed_at: "2026-08-24T22:10:00Z",
      name: "agent reported span",
      attributes: {
        "auditspec.boundary.fingerprint": "bfp_refund_update_001",
      },
    },
    { trust: "self_reported" },
  );

  assert.equal(record.trust, "self_reported");
});
