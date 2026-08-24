#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toCloudEvent } from "./cloudevents.js";
import { inspectRepository } from "./inspect.js";
import { normalizeAuditEvent } from "./normalize.js";
import { redactAuditEvent } from "./redact.js";
import {
  assertAssessmentReport,
  assertAuditEvent,
  validateAgentProfile,
  validateAuditEvent,
} from "./validate.js";
import type { AssessmentReport } from "./assessment-types.js";
import type { AuditEvent } from "./types.js";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printAssessment(report: AssessmentReport): void {
  const percent = report.coverage.detected_boundaries === 0
    ? "n/a"
    : `${Math.round(report.coverage.audit_coverage * 100)}%`;

  process.stdout.write(
    [
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
      ...report.findings.map((finding) =>
        `[${finding.severity}] ${finding.rule_id} ${finding.location.path}:${finding.location.line ?? 1} - ${finding.title} (${finding.confidence})`,
      ),
      "",
    ].join("\n"),
  );
}

function usage(): never {
  process.stderr.write(
    [
      "Usage:",
      "  auditspec validate <event.json>",
      "  auditspec validate-agent <profile.json>",
      "  auditspec normalize <event.json>",
      "  auditspec redact <event.json>",
      "  auditspec to-cloudevent <event.json>",
      "  auditspec inspect [path] [--json]",
      "",
    ].join("\n"),
  );
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
