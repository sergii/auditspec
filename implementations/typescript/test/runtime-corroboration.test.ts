import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  corroborateAssessment,
  type RuntimeEvidenceRecord,
} from "../src/runtime-corroboration.js";
import {
  assertAssessmentReport,
  assertCorroborationReport,
  assertRuntimeEvidenceRecord,
  validateCorroborationReport,
  validateRuntimeEvidenceRecord,
} from "../src/validate.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8")) as unknown;
}

const assessment = readJson("../../schema/examples/assessment-report.json");
assertAssessmentReport(assessment);

const canonicalEvidence = readJson("../../schema/examples/runtime-evidence-record.json");
assertRuntimeEvidenceRecord(canonicalEvidence);

test("canonical runtime contracts validate", () => {
  assert.equal(validateRuntimeEvidenceRecord(canonicalEvidence).valid, true);
  const report = readJson("../../schema/examples/corroboration-report.json");
  assert.equal(validateCorroborationReport(report).valid, true);
});

test("observed runtime evidence supports without mutating static assessment", () => {
  const before = JSON.parse(JSON.stringify(assessment)) as typeof assessment;
  const report = corroborateAssessment(
    assessment,
    [canonicalEvidence],
    "2026-08-24T21:41:00Z",
  );

  assertCorroborationReport(report);
  assert.equal(report.summary.supports, 1);
  assert.equal(report.summary.contradicts, 0);
  assert.equal(report.matches[0]?.relation, "supports");
  assert.deepEqual(assessment, before);
});

test("non-observation under sampled or window evidence is inconclusive", () => {
  for (const coverage of ["sampled", "window"] as const) {
    const evidence: RuntimeEvidenceRecord = {
      ...canonicalEvidence,
      id: `rte_non_observed_${coverage}`,
      observation: {
        state: "not_observed",
        coverage,
        detail: "The targeted fact was not seen in the bounded observation scope.",
      },
    };

    const report = corroborateAssessment(assessment, [evidence]);
    assert.equal(report.matches[0]?.relation, "inconclusive");
    assert.equal(report.summary.inconclusive, 1);
    assert.equal(report.summary.contradicts, 0);
  }
});

test("non-observation under explicitly exhaustive evidence contradicts", () => {
  const evidence: RuntimeEvidenceRecord = {
    ...canonicalEvidence,
    id: "rte_non_observed_exhaustive",
    observation: {
      state: "not_observed",
      coverage: "exhaustive",
      detail: "The targeted fact was absent from the complete declared observation scope.",
    },
  };

  const report = corroborateAssessment(assessment, [evidence]);
  assert.equal(report.matches[0]?.relation, "contradicts");
  assert.equal(report.summary.contradicts, 1);
});

test("explicit contradiction contradicts regardless of coverage", () => {
  const evidence: RuntimeEvidenceRecord = {
    ...canonicalEvidence,
    id: "rte_explicit_contradiction",
    observation: {
      state: "contradicted",
      coverage: "point",
      detail: "The runtime producer directly observed a conflicting fact.",
    },
  };

  const report = corroborateAssessment(assessment, [evidence]);
  assert.equal(report.matches[0]?.relation, "contradicts");
});

test("finding-target relation is explicit and can contradict an observed finding", () => {
  const finding = assessment.findings[0];
  assert.ok(finding);
  const evidence: RuntimeEvidenceRecord = {
    record_version: "0.1",
    id: "rte_finding_contradiction",
    kind: "authorization_decision",
    producer: { name: "policy-engine", type: "application" },
    trust: "authoritative",
    observed_at: "2026-08-24T21:42:00Z",
    targets: { finding_fingerprint: finding.fingerprint },
    assessment_relation: "contradicts",
    observation: {
      state: "observed",
      coverage: "point",
      detail: "An authoritative authorization decision was observed for the targeted finding.",
    },
  };

  assert.equal(validateRuntimeEvidenceRecord(evidence).valid, true);
  const report = corroborateAssessment(assessment, [evidence]);
  assert.equal(report.matches[0]?.relation, "contradicts");
  assert.equal(report.summary.contradicts, 1);
});

test("finding-target record without assessment relation is invalid", () => {
  const finding = assessment.findings[0];
  assert.ok(finding);
  const evidence = {
    record_version: "0.1",
    id: "rte_finding_missing_relation",
    kind: "authorization_decision",
    producer: { name: "policy-engine", type: "application" },
    trust: "authoritative",
    observed_at: "2026-08-24T21:42:00Z",
    targets: { finding_fingerprint: finding.fingerprint },
    observation: {
      state: "observed",
      coverage: "point",
      detail: "This record deliberately omits the required finding relation.",
    },
  };

  assert.equal(validateRuntimeEvidenceRecord(evidence).valid, false);
});

test("evidence for unknown fingerprints remains unmatched", () => {
  const evidence: RuntimeEvidenceRecord = {
    ...canonicalEvidence,
    id: "rte_unknown_target",
    targets: { boundary_fingerprint: "bfp_does_not_exist" },
  };

  const report = corroborateAssessment(assessment, [evidence]);
  assert.deepEqual(report.matches, []);
  assert.deepEqual(report.unmatched_evidence_ids, ["rte_unknown_target"]);
  assert.equal(report.summary.unmatched, 1);
});
