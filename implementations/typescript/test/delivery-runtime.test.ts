import assert from "node:assert/strict";
import test from "node:test";
import { runtimeEvidenceFromDeliveryReceipt } from "../src/delivery-runtime.js";
import { validateRuntimeEvidenceRecord } from "../src/validate.js";

test("maps a transport acknowledgement into attributed delivery evidence by default", () => {
  const record = runtimeEvidenceFromDeliveryReceipt({
    id: "delivery_receipt_001",
    observed_at: "2026-08-24T22:20:00Z",
    producer_name: "message-broker",
    producer_type: "external",
    boundary_fingerprint: "bfp_refund_update_001",
    event_source: "urn:example:billing",
    event_id: "aud_example_001",
    detail: "The broker acknowledged the message at the configured destination.",
    destination: "audit.events",
    delivery_id: "delivery-991",
    acknowledgement_type: "broker_ack",
  });

  assert.equal(validateRuntimeEvidenceRecord(record).valid, true);
  assert.equal(record.kind, "delivery_receipt");
  assert.equal(record.trust, "attributed");
  assert.equal(record.observation.coverage, "point");
  assert.equal(record.metadata?.acknowledgement_type, "broker_ack");
});

test("receiver-owned receipt may explicitly assert authoritative trust for the delivery fact", () => {
  const record = runtimeEvidenceFromDeliveryReceipt({
    id: "delivery_receiver_001",
    observed_at: "2026-08-24T22:20:00Z",
    producer_name: "audit-receiver",
    producer_type: "external",
    boundary_fingerprint: "bfp_refund_update_001",
    detail: "The receiving audit store durably accepted the event.",
    acknowledgement_type: "receiver_durable_accept",
    trust: "authoritative",
  });

  assert.equal(record.trust, "authoritative");
});

test("finding-target delivery receipt preserves explicit assessment relation", () => {
  const record = runtimeEvidenceFromDeliveryReceipt({
    id: "delivery_finding_001",
    observed_at: "2026-08-24T22:20:00Z",
    producer_name: "audit-receiver",
    finding_fingerprint: "fp_example_001",
    assessment_relation: "contradicts",
    detail: "Receiver-owned evidence contradicts the targeted finding for this assessment.",
    trust: "authoritative",
  });

  assert.equal(validateRuntimeEvidenceRecord(record).valid, true);
  assert.equal(record.assessment_relation, "contradicts");
});

test("finding-target delivery receipt fails closed without assessment relation", () => {
  assert.throws(
    () =>
      runtimeEvidenceFromDeliveryReceipt({
        id: "delivery_finding_missing_relation",
        observed_at: "2026-08-24T22:20:00Z",
        producer_name: "audit-receiver",
        finding_fingerprint: "fp_example_001",
        detail: "The receipt is linked to a finding but does not state its assessment meaning.",
      }),
    /requires explicit assessment_relation/,
  );
});

test("requires an explicit static assessment target", () => {
  assert.throws(
    () =>
      runtimeEvidenceFromDeliveryReceipt({
        id: "delivery_missing_target",
        observed_at: "2026-08-24T22:20:00Z",
        producer_name: "message-broker",
        detail: "A delivery acknowledgement exists but is not linked to an AuditSpec target.",
      }),
    /explicit boundary_fingerprint or finding_fingerprint/,
  );
});
