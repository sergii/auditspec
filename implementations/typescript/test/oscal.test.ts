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

const request = JSON.parse(
  readFileSync(resolve(process.cwd(), "../../schema/examples/oscal-export-request.json"), "utf8"),
) as unknown;
assertOscalExportRequest(request);

test("exports an OSCAL 1.2.3 assessment-results projection with explicit assessment context", () => {
  const document = exportOscalAssessmentResults(report, request);
  const root = document["assessment-results"] as Record<string, unknown>;
  const metadata = root.metadata as Record<string, unknown>;
  const results = root.results as Array<Record<string, unknown>>;
  const result = results[0]!;
  const observations = result.observations as Array<Record<string, unknown>>;
  const findings = result.findings as Array<Record<string, unknown>>;

  assert.equal(metadata["oscal-version"], "1.2.3");
  assert.deepEqual(root["import-ap"], { href: "./assessment-plan.json" });
  assert.deepEqual(result["reviewed-controls"], {
    "control-selections": [
      {
        "include-controls": [{ "control-id": "au-2" }],
      },
    ],
  });
  assert.equal(observations.length, report.findings.length);
  assert.equal(observations[0]?.collected, report.generated_at);
  assert.equal(findings.length, report.findings.length);
  assert.deepEqual(findings[0]?.target, {
    type: "statement-id",
    "target-id": "au-2_smt",
    status: {
      state: "not-satisfied",
      reason: "other",
      remarks: "Example caller-supplied assessor conclusion used for structural OSCAL conformance. AuditSpec does not infer this status.",
    },
  });
});

test("requires an Assessment Plan reference", () => {
  assert.throws(() => exportOscalAssessmentResults(report, { ...request, assessment_plan_href: "" }));
});

test("fails closed when a finding has no caller-supplied OSCAL target/status", () => {
  assert.throws(
    () => exportOscalAssessmentResults(report, { ...request, finding_targets: {} }),
    /target\/status must be supplied/,
  );
});
