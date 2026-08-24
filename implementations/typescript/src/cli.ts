#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { diffAssessments } from "./assessment-diff.js";
import { buildAssuranceGraph, findAssurancePath } from "./assurance-graph.js";
import { toCloudEvent } from "./cloudevents.js";
import { mapAssessmentToControls } from "./control-mapping.js";
import { queryEvidence, type EvidenceQueryFilters } from "./evidence-query.js";
import { inspectRepository } from "./inspect.js";
import { normalizeAuditEvent } from "./normalize.js";
import { exportOscalAssessmentResults, type OscalExportRequest } from "./oscal.js";
import { redactAuditEvent } from "./redact.js";
import { planRemediation, verifyRemediation } from "./remediation.js";
import {
  assertAssessmentDiff,
  assertAssessmentReport,
  assertAssuranceGraph,
  assertAuditEvent,
  assertControlMappingProfile,
  assertControlMappingResult,
  assertEvidenceQueryResult,
  assertOscalExportRequest,
  assertRemediationPlan,
  assertVerificationResult,
  validateAgentProfile,
  validateAuditEvent,
} from "./validate.js";
import type { AssessmentConfidence, AssessmentReport } from "./assessment-types.js";
import type { AuditEvent } from "./types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function optionValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function positiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return parsed;
}

function printAssessment(report: AssessmentReport): void {
  const percent = report.coverage.detected_boundaries === 0
    ? "n/a"
    : `${Math.round(report.coverage.audit_coverage * 100)}%`;
  process.stdout.write([
    "AuditSpec assessment",
    `Subject: ${report.subject.path}`,
    `Frameworks: ${report.frameworks.map((framework) => framework.name).join(", ") || "none detected"}`,
    `Boundaries: ${report.coverage.detected_boundaries}`,
    `Covered: ${report.coverage.covered_boundaries}`,
    `Partial: ${report.coverage.partial_boundaries}`,
    `Uncovered: ${report.coverage.uncovered_boundaries}`,
    `Audit coverage: ${percent}`,
    `Findings: ${report.findings.length}`,
    "",
    ...report.findings.map((finding) => `[${finding.severity}] ${finding.rule_id} ${finding.location.path}:${finding.location.line ?? 1} - ${finding.title} (${finding.confidence})`),
    "",
  ].join("\n"));
}

function usage(): never {
  process.stderr.write([
    "Usage:",
    "  auditspec validate <event.json>",
    "  auditspec validate-agent <profile.json>",
    "  auditspec normalize <event.json>",
    "  auditspec redact <event.json>",
    "  auditspec to-cloudevent <event.json>",
    "  auditspec inspect [path] [--json]",
    "  auditspec graph [path]",
    "  auditspec assurance-path <repository-path> <source-path> <line> [column]",
    "  auditspec diff-assessments <base.json> <head.json>",
    "  auditspec plan-remediation <assessment.json> [fingerprint ...]",
    "  auditspec verify-remediation <base.json> <head.json> [fingerprint ...]",
    "  auditspec map-controls <assessment.json> <mapping-profile.json>",
    "  auditspec query-evidence <assessment.json> [--kind K] [--rule R] [--path P] [--confidence C] [--source boundary|finding]",
    "  auditspec export-oscal <assessment.json> <assessment-plan-href> [--title T] [--version V]",
    "",
  ].join("\n"));
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command) usage();

  if (command === "inspect") {
    const pathArg = args.find((arg, index) => index > 0 && !arg.startsWith("--")) ?? ".";
    const report = await inspectRepository(resolve(pathArg));
    assertAssessmentReport(report);
    if (args.includes("--json")) print(report);
    else printAssessment(report);
    return;
  }

  if (command === "graph") {
    const pathArg = args[1] ?? ".";
    const graph = await buildAssuranceGraph(resolve(pathArg));
    assertAssuranceGraph(graph);
    print(graph);
    return;
  }

  if (command === "assurance-path") {
    const repositoryPath = args[1];
    const sourcePath = args[2];
    const lineValue = args[3];
    if (!repositoryPath || !sourcePath || !lineValue) usage();
    const line = positiveInteger(lineValue, "line");
    const column = args[4] ? positiveInteger(args[4], "column") : 1;
    const graph = await buildAssuranceGraph(resolve(repositoryPath));
    assertAssuranceGraph(graph);
    const path = findAssurancePath(graph, { path: sourcePath, line, column });
    print({
      subject: graph.subject,
      location: { path: sourcePath, line, column },
      found: path !== null,
      path,
    });
    process.exitCode = path ? 0 : 1;
    return;
  }

  if (command === "diff-assessments") {
    const basePath = args[1];
    const headPath = args[2];
    if (!basePath || !headPath) usage();
    const base = readJson(basePath);
    const head = readJson(headPath);
    assertAssessmentReport(base);
    assertAssessmentReport(head);
    const diff = diffAssessments(base, head);
    assertAssessmentDiff(diff);
    print(diff);
    return;
  }

  if (command === "plan-remediation") {
    const assessmentPath = args[1];
    if (!assessmentPath) usage();
    const assessment = readJson(assessmentPath);
    assertAssessmentReport(assessment);
    const fingerprints = args.slice(2);
    const plan = planRemediation(assessment, fingerprints.length > 0 ? fingerprints : undefined);
    assertRemediationPlan(plan);
    print(plan);
    return;
  }

  if (command === "verify-remediation") {
    const basePath = args[1];
    const headPath = args[2];
    if (!basePath || !headPath) usage();
    const base = readJson(basePath);
    const head = readJson(headPath);
    assertAssessmentReport(base);
    assertAssessmentReport(head);
    const fingerprints = args.slice(3);
    const result = verifyRemediation(base, head, fingerprints.length > 0 ? fingerprints : undefined);
    assertVerificationResult(result);
    print(result);
    return;
  }

  if (command === "map-controls") {
    const assessmentPath = args[1];
    const profilePath = args[2];
    if (!assessmentPath || !profilePath) usage();
    const assessment = readJson(assessmentPath);
    const profile = readJson(profilePath);
    assertAssessmentReport(assessment);
    assertControlMappingProfile(profile);
    const result = mapAssessmentToControls(assessment, profile);
    assertControlMappingResult(result);
    print(result);
    return;
  }

  if (command === "query-evidence") {
    const assessmentPath = args[1];
    if (!assessmentPath) usage();
    const assessment = readJson(assessmentPath);
    assertAssessmentReport(assessment);
    const confidence = optionValue(args, "--confidence") as AssessmentConfidence | undefined;
    const source = optionValue(args, "--source") as EvidenceQueryFilters["source"];
    const filters: EvidenceQueryFilters = {
      ...(optionValue(args, "--kind") ? { kind: optionValue(args, "--kind") } : {}),
      ...(optionValue(args, "--rule") ? { rule_id: optionValue(args, "--rule") } : {}),
      ...(optionValue(args, "--path") ? { path: optionValue(args, "--path") } : {}),
      ...(confidence ? { confidence } : {}),
      ...(source ? { source } : {}),
    };
    const result = queryEvidence(assessment, filters);
    assertEvidenceQueryResult(result);
    print(result);
    return;
  }

  if (command === "export-oscal") {
    const assessmentPath = args[1];
    const assessmentPlanHref = args[2];
    if (!assessmentPath || !assessmentPlanHref) usage();
    const assessment = readJson(assessmentPath);
    assertAssessmentReport(assessment);
    const request: OscalExportRequest = {
      assessment_plan_href: assessmentPlanHref,
      ...(optionValue(args, "--title") ? { title: optionValue(args, "--title") } : {}),
      ...(optionValue(args, "--version") ? { version: optionValue(args, "--version") } : {}),
    };
    assertOscalExportRequest(request);
    print(exportOscalAssessmentResults(assessment, request));
    return;
  }

  const path = args[1];
  if (!path) usage();
  const input = readJson(path);

  switch (command) {
    case "validate": {
      const result = validateAuditEvent(input);
      print(result);
      process.exitCode = result.valid ? 0 : 1;
      break;
    }
    case "validate-agent": {
      const result = validateAgentProfile(input);
      print(result);
      process.exitCode = result.valid ? 0 : 1;
      break;
    }
    case "normalize": {
      assertAuditEvent(input);
      print(normalizeAuditEvent(input));
      break;
    }
    case "redact": {
      assertAuditEvent(input);
      print(redactAuditEvent(input));
      break;
    }
    case "to-cloudevent": {
      assertAuditEvent(input);
      print(toCloudEvent(input as AuditEvent));
      break;
    }
    default:
      usage();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
