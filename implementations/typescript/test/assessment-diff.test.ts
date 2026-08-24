import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { diffAssessments } from "../src/assessment-diff.js";
import type { AssessmentReport } from "../src/assessment-types.js";
import { validateAssessmentDiff } from "../src/validate.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const examplePath = resolve(packageRoot, "../../schema/examples/assessment-report.json");

function example(): AssessmentReport {
  return JSON.parse(readFileSync(examplePath, "utf8")) as AssessmentReport;
}

test("assessment diff reports resolved findings by fingerprint", () => {
  const base = example();
  const head = example();
  head.generated_at = "2026-08-24T16:46:00Z";
  head.findings = [];
  head.coverage.covered_boundaries = 1;
  head.coverage.uncovered_boundaries = 0;
  head.coverage.audit_coverage = 1;

  const diff = diffAssessments(base, head);

  assert.equal(validateAssessmentDiff(diff).valid, true);
  assert.equal(diff.new_findings.length, 0);
  assert.equal(diff.resolved_findings.length, 1);
  assert.equal(diff.unchanged_findings, 0);
  assert.equal(diff.coverage.delta, 1);
});

test("assessment diff ignores line movement when fingerprint is stable", () => {
  const base = example();
  const head = example();
  head.findings[0]!.location.line = 40;

  const diff = diffAssessments(base, head);

  assert.equal(diff.new_findings.length, 0);
  assert.equal(diff.resolved_findings.length, 0);
  assert.equal(diff.unchanged_findings, 1);
});
