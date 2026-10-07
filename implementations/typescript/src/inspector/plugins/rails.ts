import { createHash } from "node:crypto";
import { existsSync, type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type {
  AssessmentBoundary,
  AssessmentFinding,
  SourceLocation,
} from "../../assessment-types.js";
import { findAstCalls, type AstCallCandidate } from "../../ast-calls.js";
import type { InspectorFrameworkPlugin } from "../plugin.js";

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

const MUTATION_METHODS = new Set([
  "save!",
  "update!",
  "update",
  "destroy!",
  "destroy",
  "create!",
  "create",
  "delete",
  "delete_all",
  "destroy_all",
  "update_all",
  "insert_all",
  "upsert_all",
]);
const AUDIT_RE = /\bAuditSpec\.(?:emit!?|record!?)\b/;
const TRANSACTION_RE = /(?:ApplicationRecord|ActiveRecord::Base)\.transaction\b|\btransaction\b/;
const AUTHORIZATION_METHODS = new Set(["authorize", "policy_scope", "allowed_to?", "can?"]);
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

    if (entry.isFile() && (entry.name.endsWith(".rb") || entry.name.endsWith(".rake"))) output.push(absolute);
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
    evidence: [{ kind: "ast_analysis", detail: evidenceDetail, location }],
    remediation: { summary: remediation },
  };
}

function uniqueMutationCalls(calls: AstCallCandidate[]): AstCallCandidate[] {
  const seen = new Set<string>();
  return calls.filter((call) => {
    if (!MUTATION_METHODS.has(call.method)) return false;
    const key = `${call.line}:${call.column}:${call.method}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function callsInSameScope(call: AstCallCandidate, calls: AstCallCandidate[]): AstCallCandidate[] {
  if (!call.scope) return calls.filter((candidate) => !candidate.scope);
  return calls.filter((candidate) => candidate.scope?.id === call.scope?.id);
}

async function inspectRails(root: string): Promise<{ boundaries: AssessmentBoundary[]; findings: AssessmentFinding[]; astFailures: number }> {
  const boundaries: AssessmentBoundary[] = [];
  const findings: AssessmentFinding[] = [];
  const files = await collectRubyFiles(root);
  let astFailures = 0;

  for (const absolutePath of files) {
    const content = await readText(absolutePath);
    if (content === null || content.length > 1_000_000) continue;

    const path = repoPath(root, absolutePath);
    const scan = findAstCalls(content, "ruby");
    if (!scan.parsed) {
      astFailures += 1;
      continue;
    }

    for (const call of uniqueMutationCalls(scan.calls)) {
      const scopedCalls = callsInSameScope(call, scan.calls);
      const hasAudit = scopedCalls.some((candidate) => AUDIT_RE.test(candidate.callee) || AUDIT_RE.test(candidate.text));
      const hasTransaction = scopedCalls.some((candidate) => candidate.method === "transaction" && TRANSACTION_RE.test(candidate.callee));
      const hasAuthorization = scopedCalls.some((candidate) => AUTHORIZATION_METHODS.has(candidate.method) || /\bPundit\b/.test(candidate.callee));
      const operation = call.method;
      const location: SourceLocation = { path, line: call.line, column: call.column };
      const boundaryId = stableId("boundary", `${path}:${call.line}:${call.column}:${operation}`);
      const sourceIdentity = `${path}:${operation}:${call.text.replace(/\s+/g, " ").trim()}`;
      const auditStatus: AssessmentBoundary["audit_status"] = !hasAudit
        ? "uncovered"
        : hasTransaction
          ? "covered"
          : "partial";

      boundaries.push({
        id: boundaryId,
        fingerprint: stableId("bfp", sourceIdentity),
        kind: "mutation",
        framework: "rails",
        operation,
        location,
        audit_status: auditStatus,
        confidence: "high",
        reachability: { status: "unknown", confidence: "low" },
        evidence: [
          {
            kind: "ast_call",
            detail: `Tree-sitter AST detected Rails mutation call .${operation}`,
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
            `Detected Rails mutation .${operation} without a visible AuditSpec emission call in the owning method/function scope.`,
            location,
            boundaryId,
            sourceIdentity,
            `AST confirms .${operation} call; no AuditSpec.emit!/record! call found in the same scope in ${path}`,
            "Emit a semantic AuditSpec event at the service/domain boundary that owns this mutation.",
          ),
        );
      } else if (!hasTransaction) {
        findings.push(
          finding(
            "AS-ATOMIC-001",
            "Mutation and audit are not visibly atomic",
            "low",
            "AST analysis found both a Rails mutation and AuditSpec emission in the owning scope, but no visible Active Record transaction call.",
            location,
            boundaryId,
            sourceIdentity,
            `AST found audit and mutation calls but no ApplicationRecord/ActiveRecord transaction call in the same scope in ${path}`,
            "Couple the mutation and durable audit write in one transaction, or use a transactional outbox when they cannot share a store.",
          ),
        );
      }

      if (PRIVILEGED_RE.test(`${path} ${call.text}`) && !hasAuthorization) {
        findings.push(
          finding(
            "AS-AUTH-001",
            "Privileged mutation without visible authorization evidence",
            "low",
            "This AST-confirmed mutation looks privileged, but no common Rails authorization call is visible in the owning scope.",
            location,
            boundaryId,
            sourceIdentity,
            `Privileged keyword detected around .${operation}; no authorize/policy call found in the same scope in ${path}`,
            "Make the authorization boundary explicit and audit the authorization decision when it is relevant to accountability or security.",
          ),
        );
      }
    }
  }

  return { boundaries, findings, astFailures };
}

export const railsInspectorPlugin: InspectorFrameworkPlugin = {
  id: "rails-ast-assisted-v0.1",
  framework: "rails",
  confidence: "high",
  async inspect(root) {
    const detection = await detectRails(root);
    if (!detection.detected) {
      return {
        detected: false,
        evidence: detection.evidence,
        boundaries: [],
        findings: [],
        ast_failures: 0,
      };
    }

    const result = await inspectRails(root);
    return {
      detected: true,
      evidence: detection.evidence,
      boundaries: result.boundaries,
      findings: result.findings,
      ast_failures: result.astFailures,
    };
  },
  assurance: {
    auditStatus(_boundary, path) {
      const hasAudit = path.roles.includes("audit");
      const hasTransaction = path.roles.includes("transaction");
      return hasAudit ? (hasTransaction ? "covered" : "partial") : "uncovered";
    },
    entrypointKind(qualifiedName) {
      if (qualifiedName.startsWith("rails.rails_route:")) return "rails_route";
      if (/Controller#/.test(qualifiedName)) return "rails_controller";
      if (/#perform$/.test(qualifiedName)) return "rails_job";
      return null;
    },
    reportAtomicityGapWhenAuditWithoutTransaction: true,
  },
};
