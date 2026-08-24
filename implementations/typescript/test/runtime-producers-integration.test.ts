import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runtimeEvidenceFromDatabaseReceipt } from "../src/database-runtime.js";
import { runtimeEvidenceFromDeliveryReceipt } from "../src/delivery-runtime.js";
import { runtimeEvidenceFromOpenTelemetry } from "../src/opentelemetry-runtime.js";
import { corroborateAssessment } from "../src/runtime-corroboration.js";
import { assertAssessmentReport, assertCorroborationReport } from "../src/validate.js";

const assessment = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../schema/examples/assessment-report.json"), "utf8"),
) as unknown;
assertAssessmentReport(assessment);

test("all reference runtime producers flow through the same corroboration contract", () => {
  const evidence = [
    runtimeEvidenceFromOpenTelemetry({
      signal: "span",
      observed_at: "2026-08-24T22:25:00Z",
      name: "RefundService.call",
      trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
      span_id: "00f067aa0ba902b7",
      attributes: {
        "auditspec.boundary.fingerprint": "bfp_refund_update_001",
      },
    }),
    runtimeEvidenceFromDatabaseReceipt({
      id: "db_integration_001",
      kind: "transaction_commit",
      observed_at: "2026-08-24T22:25:01Z",
      producer_name: "postgres-commit-observer",
      boundary_fingerprint: "bfp_refund_update_001",
      detail: "The targeted transaction committed.",
    }),
    runtimeEvidenceFromDeliveryReceipt({
      id: "delivery_integration_001",
      observed_at: "2026-08-24T22:25:02Z",
      producer_name: "audit-receiver",
      boundary_fingerprint: "bfp_refund_update_001",
      detail: "The receiver acknowledged the targeted event delivery.",
      trust: "authoritative",
    }),
  ];

  const staticCoverageBefore = JSON.parse(JSON.stringify(assessment.coverage)) as unknown;
  const report = corroborateAssessment(assessment, evidence, "2026-08-24T22:25:03Z");
  assertCorroborationReport(report);

  assert.equal(report.summary.evidence_records, 3);
  assert.equal(report.summary.matched, 3);
  assert.equal(report.summary.supports, 3);
  assert.equal(report.summary.contradicts, 0);
  assert.equal(report.summary.inconclusive, 0);
  assert.deepEqual(assessment.coverage, staticCoverageBefore);

  assert.deepEqual(
    report.matches.map((match) => match.trust),
    ["attributed", "authoritative", "authoritative"],
  );
});
