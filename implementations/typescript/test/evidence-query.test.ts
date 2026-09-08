import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { queryEvidence } from "../src/evidence-query.js";
import { assertAssessmentReport, assertEvidenceQueryResult } from "../src/validate.js";

const report = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../schema/examples/assessment-report.json"), "utf8"),
) as unknown;

assertAssessmentReport(report);

test("queries finding evidence by rule", () => {
  const result = queryEvidence(report, { source: "finding", rule_id: "AS-AUDIT-001" });
  assertEvidenceQueryResult(result);
  assert.equal(result.count, 1);
  assert.equal(result.items[0]?.source, "finding");
  assert.equal(result.items[0]?.rule_id, "AS-AUDIT-001");
});

test("returns no evidence for a non-matching path", () => {
  const result = queryEvidence(report, { path: "does-not-exist" });
  assertEvidenceQueryResult(result);
  assert.equal(result.count, 0);
});
