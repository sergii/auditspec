import assert from "node:assert/strict";
import test from "node:test";
import type { AssessmentReport } from "../src/assessment-types.js";
import { planRemediation, verifyRemediation } from "../src/remediation.js";
import { validateRemediationPlan, validateVerificationResult } from "../src/validate.js";

function report(fingerprints: string[], coverage: number, revision: string): AssessmentReport {
  return {
    report_version: "0.1",
    generated_at: "2026-08-24T17:00:00Z",
    subject: { kind: "repository", path: "/tmp/example", revision },
    inspector: {
      name: "auditspec-reference-inspector",
      version: "0.1.0-draft",
      adapters: ["rails-heuristic-v0.1"],
    },
    frameworks: [{ name: "rails", confidence: "high" }],
    boundaries: fingerprints.map((fingerprint, index) => ({
      id: `boundary_${index}`,
      kind: "mutation",
      framework: "rails",
      operation: "update!",
      location: { path: `app/services/example_${index}.rb`, line: 10 },
      audit_status: "uncovered",
      confidence: "medium",
    })),
    findings: fingerprints.map((fingerprint, index) => ({
      id: `finding_${index}`,
      fingerprint,
      rule_id: index === 0 ? "AS-AUDIT-001" : "AS-AUTH-001",
      title: index === 0 ? "Unaudited mutation boundary" : "Privileged mutation without visible authorization evidence",
      severity: "warning",
      confidence: "medium",
      status: "open",
      message: "Example finding",
      location: { path: `app/services/example_${index}.rb`, line: 10 },
      boundary_id: `boundary_${index}`,
      evidence: [{ kind: "source_match", detail: "Example evidence" }],
      remediation: { summary: "Fix the finding" },
    })),
    coverage: {
      detected_boundaries: fingerprints.length,
      covered_boundaries: coverage === 1 ? fingerprints.length : 0,
      partial_boundaries: 0,
      uncovered_boundaries: coverage === 1 ? 0 : fingerprints.length,
      unknown_boundaries: 0,
      audit_coverage: coverage,
    },
  };
}

test("creates a schema-valid remediation plan", () => {
  const assessment = report(["fp_audit"], 0, "git:base");
  const plan = planRemediation(assessment);

  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0]?.finding_fingerprint, "fp_audit");
  assert.equal(plan.items[0]?.actions[0]?.kind, "code_change");
  assert.equal(plan.metadata?.automatic_code_write, false);
  assert.deepEqual(validateRemediationPlan(plan), { valid: true, errors: [] });
});

test("verification is verified when all requested fingerprints disappear", () => {
  const base = report(["fp_audit"], 0, "git:base");
  const head = report([], 1, "git:head");
  const result = verifyRemediation(base, head, ["fp_audit"]);

  assert.equal(result.status, "verified");
  assert.deepEqual(result.resolved_fingerprints, ["fp_audit"]);
  assert.deepEqual(result.still_open_fingerprints, []);
  assert.deepEqual(validateVerificationResult(result), { valid: true, errors: [] });
});

test("verification is partial when some requested fingerprints remain", () => {
  const base = report(["fp_audit", "fp_auth"], 0, "git:base");
  const head = report(["fp_auth"], 0.5, "git:head");
  const result = verifyRemediation(base, head, ["fp_audit", "fp_auth"]);

  assert.equal(result.status, "partial");
  assert.deepEqual(result.resolved_fingerprints, ["fp_audit"]);
  assert.deepEqual(result.still_open_fingerprints, ["fp_auth"]);
});
