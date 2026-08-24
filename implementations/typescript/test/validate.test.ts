import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  validateAgentProfile,
  validateAssessmentDiff,
  validateAssessmentReport,
  validateAssuranceGraph,
  validateAssuranceGraphDiff,
  validateAuditEvent,
  validateControlMappingProfile,
  validateControlMappingResult,
  validateCorroborationDiff,
  validateCorroborationReport,
  validateEvidenceQueryResult,
  validateOscalExportRequest,
  validateRemediationPlan,
  validateRuntimeEvidenceRecord,
  validateVerificationResult,
  type ValidationResult,
} from "../src/validate.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function json(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8")) as unknown;
}

function fixtures(path: string): string[] {
  return readdirSync(resolve(root, path))
    .filter((name) => name.endsWith(".json"))
    .sort();
}

type Validator = (input: unknown) => ValidationResult;

const canonicalValidators: Record<string, Validator> = {
  "agent-action.json": validateAuditEvent,
  "user-action.json": validateAuditEvent,
  "denied-action.json": validateAuditEvent,
  "assessment-report.json": validateAssessmentReport,
  "assessment-diff.json": validateAssessmentDiff,
  "assurance-graph.json": validateAssuranceGraph,
  "assurance-graph-diff.json": validateAssuranceGraphDiff,
  "remediation-plan.json": validateRemediationPlan,
  "verification-result.json": validateVerificationResult,
  "control-mapping-result.json": validateControlMappingResult,
  "evidence-query-result.json": validateEvidenceQueryResult,
  "oscal-export-request.json": validateOscalExportRequest,
  "runtime-evidence-record.json": validateRuntimeEvidenceRecord,
  "corroboration-report.json": validateCorroborationReport,
  "corroboration-diff.json": validateCorroborationDiff,
};

const invalidContractValidators: Record<string, Validator> = {
  "assessment-report": validateAssessmentReport,
  "assessment-diff": validateAssessmentDiff,
  "assurance-graph": validateAssuranceGraph,
  "assurance-graph-diff": validateAssuranceGraphDiff,
  "remediation-plan": validateRemediationPlan,
  "verification-result": validateVerificationResult,
  "control-mapping-profile": validateControlMappingProfile,
  "control-mapping-result": validateControlMappingResult,
  "evidence-query-result": validateEvidenceQueryResult,
  "oscal-export-request": validateOscalExportRequest,
  "runtime-evidence-record": validateRuntimeEvidenceRecord,
  "corroboration-report": validateCorroborationReport,
  "corroboration-diff": validateCorroborationDiff,
  "agent-profile": validateAgentProfile,
};

for (const name of fixtures("conformance/valid")) {
  test(`accepts valid fixture ${name}`, () => {
    const result = validateAuditEvent(json(`conformance/valid/${name}`));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
}

for (const name of fixtures("conformance/invalid")) {
  test(`rejects invalid fixture ${name}`, () => {
    const result = validateAuditEvent(json(`conformance/invalid/${name}`));
    assert.equal(result.valid, false, `${name} unexpectedly validated`);
  });
}

for (const [directory, validator] of Object.entries(invalidContractValidators)) {
  for (const name of fixtures(`conformance/invalid/${directory}`)) {
    test(`rejects invalid ${directory} fixture ${name}`, () => {
      const result = validator(json(`conformance/invalid/${directory}/${name}`));
      assert.equal(result.valid, false, `${directory}/${name} unexpectedly validated`);
    });
  }
}

for (const name of fixtures("schema/examples")) {
  test(`accepts canonical example ${name}`, () => {
    const validator = canonicalValidators[name];
    assert.ok(validator, `No canonical validator registered for ${name}`);
    const result = validator(json(`schema/examples/${name}`));
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
}

test("accepts the canonical Agent Profile example", () => {
  const result = validateAgentProfile(json("profiles/agent/examples/tool-call.json"));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test("accepts the canonical NIST control mapping profile", () => {
  const result = validateControlMappingProfile(json("mappings/controls/nist-sp800-53-r5.2.0.json"));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
