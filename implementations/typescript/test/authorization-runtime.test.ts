import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { runtimeEvidenceFromAuthorizationDecision } from "../src/authorization-runtime.js";
import { corroborateAssessment } from "../src/runtime-corroboration.js";
import { assertAssessmentReport, validateRuntimeEvidenceRecord } from "../src/validate.js";

const assessment = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../schema/examples/assessment-report.json"), "utf8"),
) as unknown;
assertAssessmentReport(assessment);

test("maps an enforcement decision into runtime evidence", () => {
  const record = runtimeEvidenceFromAuthorizationDecision({
    id: "authz_001",
    observed_at: "2026-08-24T22:30:00Z",
    producer_name: "billing-policy",
    boundary_fingerprint: "bfp_refund_update_001",
    decision: "allowed",
    policy_id: "refund-policy",
    policy_version: "7",
    reason_code: "role_grants_scope",
    scopes: ["refund:write"],
    trust: "authoritative",
  });

  assert.equal(validateRuntimeEvidenceRecord(record).valid, true);
  assert.equal(record.kind, "authorization_decision");
  assert.equal(record.trust, "authoritative");
  assert.equal(record.metadata?.decision, "allowed");
  assert.equal(record.metadata?.policy_id, "refund-policy");
});

test("finding-target authorization decision requires explicit assessment relation", () => {
  assert.throws(
    () =>
      runtimeEvidenceFromAuthorizationDecision({
        id: "authz_missing_relation",
        observed_at: "2026-08-24T22:30:00Z",
        producer_name: "billing-policy",
        finding_fingerprint: "fp_example_001",
        decision: "allowed",
      }),
    /requires explicit assessment_relation/,
  );
});

test("authoritative runtime authorization can explicitly contradict an auth finding", () => {
  const finding = assessment.findings.find((item) => item.rule_id.startsWith("AS-AUTH-")) ?? assessment.findings[0];
  assert.ok(finding);

  const record = runtimeEvidenceFromAuthorizationDecision({
    id: "authz_finding_001",
    observed_at: "2026-08-24T22:30:00Z",
    producer_name: "billing-policy",
    finding_fingerprint: finding.fingerprint,
    assessment_relation: "contradicts",
    decision: "allowed",
    policy_id: "refund-policy",
    trust: "authoritative",
  });

  const report = corroborateAssessment(assessment, [record], "2026-08-24T22:31:00Z");
  assert.equal(report.matches[0]?.relation, "contradicts");
  assert.equal(report.summary.contradicts, 1);
});
