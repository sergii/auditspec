import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { exportOscalAssessmentResults } from "../src/oscal.js";
import { assertAssessmentReport, assertOscalExportRequest } from "../src/validate.js";

const report = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../schema/examples/assessment-report.json"), "utf8"),
) as unknown;
assertAssessmentReport(report);

test("exports an OSCAL 1.2.3 assessment-results projection", () => {
  const request = { assessment_plan_href: "./assessment-plan.json" };
  assertOscalExportRequest(request);
  const document = exportOscalAssessmentResults(report, request);
  const root = document["assessment-results"] as Record<string, unknown>;
  const metadata = root.metadata as Record<string, unknown>;
  const results = root.results as Array<Record<string, unknown>>;
  assert.equal(metadata["oscal-version"], "1.2.3");
  assert.deepEqual(root["import-ap"], { href: "./assessment-plan.json" });
  assert.equal((results[0]?.observations as unknown[]).length, report.findings.length);
  assert.equal((results[0]?.findings as unknown[]).length, report.findings.length);
});

test("requires an Assessment Plan reference", () => {
  assert.throws(() => exportOscalAssessmentResults(report, { assessment_plan_href: "" }));
});
