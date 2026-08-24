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

test("assessment diff ignores line movement when finding fingerprint is stable", () => {
  const base = example();
  const head = example();
  head.findings[0]!.location.line = 40;

  const diff = diffAssessments(base, head);

  assert.equal(diff.new_findings.length, 0);
  assert.equal(diff.resolved_findings.length, 0);
  assert.equal(diff.unchanged_findings, 1);
});

test("assessment diff reports a stable mutation that becomes newly reachable", () => {
  const base = example();
  const head = example();
  const baseBoundary = base.boundaries[0]!;
  const headBoundary = head.boundaries[0]!;

  baseBoundary.fingerprint = "bfp_invoice_approve";
  baseBoundary.reachability = { status: "unknown", confidence: "low" };
  base.reachability = { reachable_boundaries: 0, unknown_boundaries: 1 };

  headBoundary.fingerprint = "bfp_invoice_approve";
  headBoundary.location.line = 80;
  headBoundary.reachability = {
    status: "reachable",
    confidence: "medium",
    entrypoint: {
      kind: "rails_route",
      qualified_name: "rails.rails_route:POST /invoices/:id/approve -> invoices#approve",
      framework: "rails",
    },
    path: [
      "rails.rails_route:POST /invoices/:id/approve -> invoices#approve",
      "InvoicesController#approve",
      "ApproveInvoice#call",
    ],
  };
  head.reachability = { reachable_boundaries: 1, unknown_boundaries: 0 };

  const diff = diffAssessments(base, head);

  assert.equal(validateAssessmentDiff(diff).valid, true);
  assert.equal(diff.reachability.base_reachable, 0);
  assert.equal(diff.reachability.head_reachable, 1);
  assert.equal(diff.reachability.delta, 1);
  assert.equal(diff.reachability.newly_reachable.length, 1);
  assert.equal(diff.reachability.newly_reachable[0]?.fingerprint, "bfp_invoice_approve");
  assert.equal(diff.reachability.newly_reachable[0]?.location.line, 80);
  assert.equal(diff.reachability.newly_reachable[0]?.reachability.entrypoint?.kind, "rails_route");
  assert.equal(diff.reachability.no_longer_statically_reachable.length, 0);
});

test("assessment diff reports when a known boundary is no longer statically reachable", () => {
  const base = example();
  const head = example();
  const baseBoundary = base.boundaries[0]!;
  const headBoundary = head.boundaries[0]!;

  baseBoundary.fingerprint = "bfp_invoice_approve";
  baseBoundary.reachability = {
    status: "reachable",
    confidence: "medium",
    entrypoint: {
      kind: "rails_route",
      qualified_name: "rails.rails_route:POST /invoices/:id/approve -> invoices#approve",
      framework: "rails",
    },
  };
  base.reachability = { reachable_boundaries: 1, unknown_boundaries: 0 };

  headBoundary.fingerprint = "bfp_invoice_approve";
  headBoundary.reachability = { status: "unknown", confidence: "low" };
  head.reachability = { reachable_boundaries: 0, unknown_boundaries: 1 };

  const diff = diffAssessments(base, head);

  assert.equal(validateAssessmentDiff(diff).valid, true);
  assert.equal(diff.reachability.newly_reachable.length, 0);
  assert.equal(diff.reachability.no_longer_statically_reachable.length, 1);
  assert.equal(diff.reachability.delta, -1);
});
