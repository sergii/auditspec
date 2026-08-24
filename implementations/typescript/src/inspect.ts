import { createHash } from "node:crypto";
import { existsSync, type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type {
  AssessmentBoundary,
  AssessmentFinding,
  AssessmentReport,
  SourceLocation,
} from "./assessment-types.js";
import { inspectFrappeRepository } from "./frappe-inspect.js";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "log",
  "node_modules",
  "public/assets",
  "tmp",
  "vendor",
]);

const MUTATION_RE = /\.\s*(save!|update!|update|destroy!|destroy|create!|create|delete|delete_all|destroy_all|update_all|insert_all|upsert_all)(?=\s|\(|$)/;
const AUDIT_RE = /\bAuditSpec\.(?:emit!?|record!?)\b/;
const TRANSACTION_RE = /(?:ApplicationRecord|ActiveRecord::Base)\.transaction\b|\btransaction\s+do\b/;
const AUTHORIZATION_RE = /\bauthorize(?:\s|\()|\bpolicy_scope\b|\bPundit\b|\ballowed_to\?\b|\bcan\?\b/;
const PRIVILEGED_RE = /\b(delete|destroy|refund|approve|role|permission|impersonat\w*|grant|revoke|cancel)\b/i;

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function repoPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/") || ".";
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function collectRubyFiles(root: string, directory = root, output: string[] = []): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    const relativeName = repoPath(root, absolute);

    if (entry.isDirectory()) {
      const firstSegment = relativeName.split("/")[0] ?? relativeName;
      if (SKIP_DIRECTORIES.has(relativeName) || SKIP_DIRECTORIES.has(firstSegment)) continue;
      await collectRubyFiles(root, absolute, output);
      continue;
    }

    if (entry.isFile() && (entry.name.endsWith(".rb") || entry.name.endsWith(".rake"))) {
      output.push(absolute);
    }
  }

  return output;
}

async function detectRails(root: string): Promise<{ detected: boolean; evidence: string[] }> {
  const evidence: string[] = [];
  const gemfile = await readText(resolve(root, "Gemfile"));

  if (gemfile && /\bgem\s+["']rails["']/.test(gemfile)) evidence.push("Gemfile declares the rails gem");
  if (existsSync(resolve(root, "config/application.rb"))) evidence.push("config/application.rb exists");

  return { detected: evidence.length > 0, evidence };
}

function finding(
  ruleId: string,
  title: string,
  confidence: AssessmentFinding["confidence"],
  message: string,
  location: SourceLocation,
  boundaryId: string,
  sourceIdentity: string,
  evidenceDetail: string,
  remediation: string,
): AssessmentFinding {
  return {
    id: stableId("finding", `${ruleId}:${location.path}:${location.line ?? 0}:${boundaryId}`),
    fingerprint: stableId("fp", `${ruleId}:${sourceIdentity}`),
    rule_id: ruleId,
    title,
    severity: "warning",
    confidence,
    status: "open",
    message,
    location,
    boundary_id: boundaryId,
    evidence: [{ kind: "source_match", detail: evidenceDetail, location }],
    remediation: { summary: remediation },
  };
}

async function inspectRails(root: string): Promise<{ boundaries: AssessmentBoundary[]; findings: AssessmentFinding[] }> {
  const boundaries: AssessmentBoundary[] = [];
  const findings: AssessmentFinding[] = [];
  const files = await collectRubyFiles(root);

  for (const absolutePath of files) {
    const content = await readText(absolutePath);
    if (content === null || content.length > 1_000_000) continue;

    const path = repoPath(root, absolutePath);
    const hasAudit = AUDIT_RE.test(content);
    const hasTransaction = TRANSACTION_RE.test(content);
    const hasAuthorization = AUTHORIZATION_RE.test(content);
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === undefined) continue;
      const match = line.match(MUTATION_RE);
      const operation = match?.[1];
      if (!operation) continue;

      const location: SourceLocation = { path, line: index + 1 };
      const boundaryId = stableId("boundary", `${path}:${index + 1}:${operation}`);
      const sourceIdentity = `${path}:${operation}:${line.trim()}`;
      const auditStatus: AssessmentBoundary["audit_status"] = !hasAudit
        ? "uncovered"
        : hasTransaction
          ? "covered"
          : "partial";

      boundaries.push({
        id: boundaryId,
        kind: "mutation",
        framework: "rails",
        operation,
        location,
        audit_status: auditStatus,
        confidence: "medium",
        evidence: [
          {
            kind: "source_match",
            detail: `Detected Rails mutation method .${operation}`,
            location,
          },
        ],
      });

      if (!hasAudit) {
        findings.push(
          finding(
            "AS-AUDIT-001",
            "Unaudited mutation boundary",
            "medium",
            `Detected Rails mutation .${operation} without a visible AuditSpec emission marker in the same source file.`,
            location,
            boundaryId,
            sourceIdentity,
            `No AuditSpec.emit!/record! marker found in ${path}`,
            "Emit a semantic AuditSpec event at the service/domain boundary that owns this mutation.",
          ),
        );
      } else if (!hasTransaction) {
        findings.push(
          finding(
            "AS-ATOMIC-001",
            "Mutation and audit are not visibly atomic",
            "low",
            "This file contains both a Rails mutation and an AuditSpec emission marker, but no visible Active Record transaction boundary.",
            location,
            boundaryId,
            sourceIdentity,
            `Audit marker found but no ApplicationRecord/ActiveRecord transaction marker found in ${path}`,
            "Couple the mutation and durable audit write in one transaction, or use a transactional outbox when they cannot share a store.",
          ),
        );
      }

      if (PRIVILEGED_RE.test(`${path} ${line}`) && !hasAuthorization) {
        findings.push(
          finding(
            "AS-AUTH-001",
            "Privileged mutation without visible authorization evidence",
            "low",
            "This mutation looks privileged, but no common Rails authorization marker is visible in the same source file.",
            location,
            boundaryId,
            sourceIdentity,
            `Privileged keyword detected near .${operation}; no authorize/policy marker found in ${path}`,
            "Make the authorization boundary explicit and audit the authorization decision when it is relevant to accountability or security.",
          ),
        );
      }
    }
  }

  return { boundaries, findings };
}

export async function inspectRepository(inputPath: string): Promise<AssessmentReport> {
  const root = resolve(inputPath);
  const [rails, frappe] = await Promise.all([detectRails(root), inspectFrappeRepository(root)]);

  const frameworks: AssessmentReport["frameworks"] = [];
  const adapters: string[] = [];
  const boundaries: AssessmentBoundary[] = [];
  const findings: AssessmentFinding[] = [];

  if (rails.detected) {
    frameworks.push({ name: "rails", confidence: "high", evidence: rails.evidence });
    adapters.push("rails-heuristic-v0.1");
    const railsResult = await inspectRails(root);
    boundaries.push(...railsResult.boundaries);
    findings.push(...railsResult.findings);
  }

  if (frappe.detected) {
    frameworks.push({ name: "frappe", confidence: "high", evidence: frappe.frameworkEvidence });
    adapters.push("frappe-heuristic-v0.1");
    boundaries.push(...frappe.boundaries);
    findings.push(...frappe.findings);
  }

  const covered = boundaries.filter((boundary) => boundary.audit_status === "covered").length;
  const partial = boundaries.filter((boundary) => boundary.audit_status === "partial").length;
  const uncovered = boundaries.filter((boundary) => boundary.audit_status === "uncovered").length;
  const unknown = boundaries.filter((boundary) => boundary.audit_status === "unknown").length;

  return {
    report_version: "0.1",
    generated_at: new Date().toISOString(),
    subject: { kind: "repository", path: root },
    inspector: {
      name: "auditspec-reference-inspector",
      version: "0.1.0-draft",
      adapters,
    },
    frameworks,
    boundaries,
    findings,
    coverage: {
      detected_boundaries: boundaries.length,
      covered_boundaries: covered,
      partial_boundaries: partial,
      uncovered_boundaries: uncovered,
      unknown_boundaries: unknown,
      audit_coverage: boundaries.length === 0 ? 0 : covered / boundaries.length,
    },
    metadata: {
      assessment_kind: "static_source_heuristic",
      non_blocking_recommended: true,
    },
  };
}
