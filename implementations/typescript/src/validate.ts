import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import type { AssessmentDiff } from "./assessment-diff.js";
import type { AssessmentReport } from "./assessment-types.js";
import type { AssuranceGraphDiff } from "./assurance-graph-diff.js";
import type { AssuranceGraph } from "./assurance-graph.js";
import type { ControlMappingProfile, ControlMappingResult } from "./control-mapping.js";
import type { EvidenceQueryResult } from "./evidence-query.js";
import type { OscalExportRequest } from "./oscal.js";
import type { RemediationPlan, RemediationVerificationResult } from "./remediation.js";
import type { RuntimeCorroborationReport, RuntimeEvidenceRecord } from "./runtime-corroboration.js";
import type { AuditEvent } from "./types.js";

export interface ValidationIssue {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message?: string;
  params: Record<string, unknown>;
}

export type ValidationResult =
  | { valid: true; errors: [] }
  | { valid: false; errors: ValidationIssue[] };

function loadSchema(relativePath: string): object {
  const base = dirname(fileURLToPath(import.meta.url));
  const parsed = JSON.parse(readFileSync(resolve(base, relativePath), "utf8")) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new TypeError(`Schema at ${relativePath} is not a JSON object`);
  }
  return parsed;
}

function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: true });
  addFormats(ajv);
  return ajv;
}

const ajv = createAjv();
const auditEventSchema = loadSchema("../../../schema/audit-event.schema.json");
const assessmentReportSchema = loadSchema("../../../schema/assessment-report.schema.json");
const assessmentDiffSchema = loadSchema("../../../schema/assessment-diff.schema.json");
const assuranceGraphSchema = loadSchema("../../../schema/assurance-graph.schema.json");
const assuranceGraphDiffSchema = loadSchema("../../../schema/assurance-graph-diff.schema.json");
const remediationPlanSchema = loadSchema("../../../schema/remediation-plan.schema.json");
const verificationResultSchema = loadSchema("../../../schema/verification-result.schema.json");
const controlMappingProfileSchema = loadSchema("../../../schema/control-mapping-profile.schema.json");
const controlMappingResultSchema = loadSchema("../../../schema/control-mapping-result.schema.json");
const evidenceQueryResultSchema = loadSchema("../../../schema/evidence-query-result.schema.json");
const oscalExportRequestSchema = loadSchema("../../../schema/oscal-export-request.schema.json");
const runtimeEvidenceRecordSchema = loadSchema("../../../schema/runtime-evidence-record.schema.json");
const corroborationReportSchema = loadSchema("../../../schema/corroboration-report.schema.json");
const agentProfileSchema = loadSchema("../../../profiles/agent/agent-profile.schema.json");

const validateEvent = ajv.compile<AuditEvent>(auditEventSchema);
const validateAssessment = ajv.compile<AssessmentReport>(assessmentReportSchema);
const validateDiff = ajv.compile<AssessmentDiff>(assessmentDiffSchema);
const validateGraph = ajv.compile<AssuranceGraph>(assuranceGraphSchema);
const validateGraphDiff = ajv.compile<AssuranceGraphDiff>(assuranceGraphDiffSchema);
const validatePlan = ajv.compile<RemediationPlan>(remediationPlanSchema);
const validateVerification = ajv.compile<RemediationVerificationResult>(verificationResultSchema);
const validateControlProfile = ajv.compile<ControlMappingProfile>(controlMappingProfileSchema);
const validateControlResult = ajv.compile<ControlMappingResult>(controlMappingResultSchema);
const validateEvidenceResult = ajv.compile<EvidenceQueryResult>(evidenceQueryResultSchema);
const validateOscalRequest = ajv.compile<OscalExportRequest>(oscalExportRequestSchema);
const validateRuntimeEvidence = ajv.compile<RuntimeEvidenceRecord>(runtimeEvidenceRecordSchema);
const validateCorroboration = ajv.compile<RuntimeCorroborationReport>(corroborationReportSchema);
const validateProfile = ajv.compile(agentProfileSchema);

function issues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message,
    params: error.params as Record<string, unknown>,
  }));
}

export function validateAuditEvent(input: unknown): ValidationResult {
  if (validateEvent(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateEvent.errors) };
}

export function assertAuditEvent(input: unknown): asserts input is AuditEvent {
  const result = validateAuditEvent(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec event: ${JSON.stringify(result.errors)}`);
}

export function validateAssessmentReport(input: unknown): ValidationResult {
  if (validateAssessment(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateAssessment.errors) };
}

export function assertAssessmentReport(input: unknown): asserts input is AssessmentReport {
  const result = validateAssessmentReport(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec assessment report: ${JSON.stringify(result.errors)}`);
}

export function validateAssessmentDiff(input: unknown): ValidationResult {
  if (validateDiff(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateDiff.errors) };
}

export function assertAssessmentDiff(input: unknown): asserts input is AssessmentDiff {
  const result = validateAssessmentDiff(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec assessment diff: ${JSON.stringify(result.errors)}`);
}

export function validateAssuranceGraph(input: unknown): ValidationResult {
  if (validateGraph(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateGraph.errors) };
}

export function assertAssuranceGraph(input: unknown): asserts input is AssuranceGraph {
  const result = validateAssuranceGraph(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec assurance graph: ${JSON.stringify(result.errors)}`);
}

export function validateAssuranceGraphDiff(input: unknown): ValidationResult {
  if (validateGraphDiff(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateGraphDiff.errors) };
}

export function assertAssuranceGraphDiff(input: unknown): asserts input is AssuranceGraphDiff {
  const result = validateAssuranceGraphDiff(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec assurance graph diff: ${JSON.stringify(result.errors)}`);
}

export function validateRemediationPlan(input: unknown): ValidationResult {
  if (validatePlan(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validatePlan.errors) };
}

export function assertRemediationPlan(input: unknown): asserts input is RemediationPlan {
  const result = validateRemediationPlan(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec remediation plan: ${JSON.stringify(result.errors)}`);
}

export function validateVerificationResult(input: unknown): ValidationResult {
  if (validateVerification(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateVerification.errors) };
}

export function assertVerificationResult(input: unknown): asserts input is RemediationVerificationResult {
  const result = validateVerificationResult(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec verification result: ${JSON.stringify(result.errors)}`);
}

export function validateControlMappingProfile(input: unknown): ValidationResult {
  if (validateControlProfile(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateControlProfile.errors) };
}

export function assertControlMappingProfile(input: unknown): asserts input is ControlMappingProfile {
  const result = validateControlMappingProfile(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec control mapping profile: ${JSON.stringify(result.errors)}`);
}

export function validateControlMappingResult(input: unknown): ValidationResult {
  if (validateControlResult(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateControlResult.errors) };
}

export function assertControlMappingResult(input: unknown): asserts input is ControlMappingResult {
  const result = validateControlMappingResult(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec control mapping result: ${JSON.stringify(result.errors)}`);
}

export function validateEvidenceQueryResult(input: unknown): ValidationResult {
  if (validateEvidenceResult(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateEvidenceResult.errors) };
}

export function assertEvidenceQueryResult(input: unknown): asserts input is EvidenceQueryResult {
  const result = validateEvidenceQueryResult(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec evidence query result: ${JSON.stringify(result.errors)}`);
}

export function validateOscalExportRequest(input: unknown): ValidationResult {
  if (validateOscalRequest(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateOscalRequest.errors) };
}

export function assertOscalExportRequest(input: unknown): asserts input is OscalExportRequest {
  const result = validateOscalExportRequest(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec OSCAL export request: ${JSON.stringify(result.errors)}`);
}

export function validateRuntimeEvidenceRecord(input: unknown): ValidationResult {
  if (validateRuntimeEvidence(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateRuntimeEvidence.errors) };
}

export function assertRuntimeEvidenceRecord(input: unknown): asserts input is RuntimeEvidenceRecord {
  const result = validateRuntimeEvidenceRecord(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec runtime evidence record: ${JSON.stringify(result.errors)}`);
}

export function validateCorroborationReport(input: unknown): ValidationResult {
  if (validateCorroboration(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateCorroboration.errors) };
}

export function assertCorroborationReport(input: unknown): asserts input is RuntimeCorroborationReport {
  const result = validateCorroborationReport(input);
  if (!result.valid) throw new TypeError(`Invalid AuditSpec corroboration report: ${JSON.stringify(result.errors)}`);
}

export function validateAgentProfile(input: unknown): ValidationResult {
  if (validateProfile(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateProfile.errors) };
}
