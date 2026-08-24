import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import type { AssessmentDiff } from "./assessment-diff.js";
import type { AssessmentReport } from "./assessment-types.js";
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
const agentProfileSchema = loadSchema("../../../profiles/agent/agent-profile.schema.json");
const validateEvent = ajv.compile<AuditEvent>(auditEventSchema);
const validateAssessment = ajv.compile<AssessmentReport>(assessmentReportSchema);
const validateDiff = ajv.compile<AssessmentDiff>(assessmentDiffSchema);
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
  if (!result.valid) {
    throw new TypeError(`Invalid AuditSpec event: ${JSON.stringify(result.errors)}`);
  }
}

export function validateAssessmentReport(input: unknown): ValidationResult {
  if (validateAssessment(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateAssessment.errors) };
}

export function assertAssessmentReport(input: unknown): asserts input is AssessmentReport {
  const result = validateAssessmentReport(input);
  if (!result.valid) {
    throw new TypeError(`Invalid AuditSpec assessment report: ${JSON.stringify(result.errors)}`);
  }
}

export function validateAssessmentDiff(input: unknown): ValidationResult {
  if (validateDiff(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateDiff.errors) };
}

export function assertAssessmentDiff(input: unknown): asserts input is AssessmentDiff {
  const result = validateAssessmentDiff(input);
  if (!result.valid) {
    throw new TypeError(`Invalid AuditSpec assessment diff: ${JSON.stringify(result.errors)}`);
  }
}

export function validateAgentProfile(input: unknown): ValidationResult {
  if (validateProfile(input)) return { valid: true, errors: [] };
  return { valid: false, errors: issues(validateProfile.errors) };
}
