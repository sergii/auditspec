import assert from "node:assert/strict";
import test from "node:test";
import type { AssessmentReport } from "../src/assessment-types.js";
import type { ControlMappingProfile } from "../src/control-mapping.js";
import { mapAssessmentToControls } from "../src/control-mapping.js";
import { validateControlMappingResult } from "../src/validate.js";

const assessment: AssessmentReport = {
  report_version: "0.1",
  generated_at: "2026-08-24T17:00:00Z",
  subject: { kind: "repository", path: "/tmp/example", revision: "git:base" },
  inspector: {
    name: "auditspec-reference-inspector",
    version: "0.1.0-draft",
    adapters: ["rails-heuristic-v0.1"],
  },
  frameworks: [{ name: "rails", confidence: "high" }],
  boundaries: [],
  findings: [
    {
      id: "finding_1",
      fingerprint: "fp_audit",
      rule_id: "AS-AUDIT-001",
      title: "Unaudited mutation boundary",
      severity: "warning",
      confidence: "medium",
      status: "open",
      message: "Missing audit",
      location: { path: "app/services/example.rb", line: 10 },
      evidence: [{ kind: "source_match", detail: "No audit marker" }],
    },
  ],
  coverage: {
    detected_boundaries: 1,
    covered_boundaries: 0,
    partial_boundaries: 0,
    uncovered_boundaries: 1,
    unknown_boundaries: 0,
    audit_coverage: 0,
  },
};

const profile: ControlMappingProfile = {
  mapping_version: "0.1",
  framework: { id: "example-controls", version: "1" },
  rules: [
    {
      rule_id: "AS-AUDIT-001",
      controls: [
        {
          id: "CTRL-1",
          relation: "potential_gap",
          rationale: "Missing audit evidence is relevant to this control.",
        },
      ],
    },
  ],
  caveat: "Mapping is relevance only.",
};

test("maps finding fingerprints to control relevance", () => {
  const result = mapAssessmentToControls(assessment, profile);

  assert.equal(result.controls.length, 1);
  assert.equal(result.controls[0]?.control_id, "CTRL-1");
  assert.deepEqual(result.controls[0]?.relations[0]?.finding_fingerprints, ["fp_audit"]);
  assert.deepEqual(validateControlMappingResult(result), { valid: true, errors: [] });
});
