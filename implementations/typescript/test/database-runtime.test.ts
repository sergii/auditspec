import assert from "node:assert/strict";
import test from "node:test";
import { runtimeEvidenceFromDatabaseReceipt } from "../src/database-runtime.js";
import { validateRuntimeEvidenceRecord } from "../src/validate.js";

test("maps a database-owned transaction receipt into authoritative point evidence", () => {
  const record = runtimeEvidenceFromDatabaseReceipt({
    id: "db_receipt_001",
    kind: "transaction_commit",
    observed_at: "2026-08-24T22:15:00Z",
    producer_name: "postgres-commit-observer",
    producer_version: "0.1",
    boundary_fingerprint: "bfp_refund_update_001",
    trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
    event_source: "urn:example:billing",
    event_id: "aud_example_001",
    detail: "The database-owned observer saw the targeted transaction commit.",
    transaction_id: "tx-8842",
    database_system: "postgresql",
    database_name: "billing",
  });

  assert.equal(validateRuntimeEvidenceRecord(record).valid, true);
  assert.equal(record.trust, "authoritative");
  assert.equal(record.kind, "transaction_commit");
  assert.equal(record.observation.coverage, "point");
  assert.equal(record.targets?.boundary_fingerprint, "bfp_refund_update_001");
  assert.equal(record.metadata?.transaction_id, "tx-8842");
});

test("supports authoritative audit and outbox persistence receipts", () => {
  for (const kind of ["audit_persist", "outbox_persist"] as const) {
    const record = runtimeEvidenceFromDatabaseReceipt({
      id: `db_${kind}_001`,
      kind,
      observed_at: "2026-08-24T22:15:00Z",
      producer_name: "postgres-audit-observer",
      finding_fingerprint: "fp_example_001",
      detail: `Database-owned observer saw ${kind}.`,
    });

    assert.equal(record.kind, kind);
    assert.equal(record.trust, "authoritative");
  }
});

test("requires an explicit static assessment target", () => {
  assert.throws(
    () =>
      runtimeEvidenceFromDatabaseReceipt({
        id: "db_missing_target",
        kind: "transaction_commit",
        observed_at: "2026-08-24T22:15:00Z",
        producer_name: "postgres-commit-observer",
        detail: "A commit occurred, but it is not explicitly linked to an AuditSpec target.",
      }),
    /explicit boundary_fingerprint or finding_fingerprint/,
  );
});

test("allows trust to be lowered when the receipt is not database-authoritative", () => {
  const record = runtimeEvidenceFromDatabaseReceipt({
    id: "db_attributed_001",
    kind: "audit_persist",
    observed_at: "2026-08-24T22:15:00Z",
    producer_name: "application-db-proxy",
    boundary_fingerprint: "bfp_refund_update_001",
    detail: "An application-side proxy attributed a persistence observation.",
    trust: "attributed",
  });

  assert.equal(record.trust, "attributed");
});
