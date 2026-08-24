import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type {
  AssessmentBoundary,
  AssessmentFinding,
  SourceLocation,
} from "./assessment-types.js";
import { findAstCalls, type AstCallCandidate } from "./ast-calls.js";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "env",
  "node_modules",
  "sites/assets",
  "venv",
]);

const AUDIT_RE = /\b(?:AuditSpec|auditspec)\.(?:emit|record)\b|\bemit_audit\b/;
const AUTHORIZATION_METHODS = new Set(["has_permission", "only_for", "check_permission", "get_roles"]);
const FRAPPE_CONTEXT_RE = /\bimport\s+frappe\b|\bfrom\s+frappe\b|\bfrappe\.get_doc\s*\(|\bDocument\b/;
const DOCUMENT_MUTATIONS = new Set(["save", "insert", "submit", "cancel", "delete"]);

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

async function collectPythonFiles(root: string, directory = root, output: string[] = []): Promise<string[]> {
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
      await collectPythonFiles(root, absolute, output);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".py")) output.push(absolute);
  }

  return output;
}

function detectMutation(call: AstCallCandidate): { operation: string; direct: boolean; irreversible: boolean } | null {
  if (/^frappe\.db\.(set_value|update|bulk_update|delete|truncate)$/.test(call.callee)) {
    return {
      operation: call.callee,
      direct: true,
      irreversible: call.callee === "frappe.db.truncate",
    };
  }

  if (call.callee === "frappe.delete_doc") {
    return { operation: "frappe.delete_doc", direct: true, irreversible: false };
  }

  if (["db_set", "db_insert", "db_update"].includes(call.method)) {
    return { operation: call.method, direct: true, irreversible: false };
  }

  if (DOCUMENT_MUTATIONS.has(call.method)) {
    return { operation: call.method, direct: false, irreversible: false };
  }

  return null;
}

function callsInSameScope(call: AstCallCandidate, calls: AstCallCandidate[]): AstCallCandidate[] {
  if (!call.scope) return calls.filter((candidate) => !candidate.scope);
  return calls.filter((candidate) => candidate.scope?.id === call.scope?.id);
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

export interface FrappeInspectionResult {
  detected: boolean;
  frameworkEvidence: string[];
  boundaries: AssessmentBoundary[];
  findings: AssessmentFinding[];
  astFailures: number;
}

export async function inspectFrappeRepository(root: string): Promise<FrappeInspectionResult> {
  const files = await collectPythonFiles(root);
  const frameworkEvidence: string[] = [];
  const boundaries: AssessmentBoundary[] = [];
  const findings: AssessmentFinding[] = [];
  let astFailures = 0;

  for (const absolutePath of files) {
    const content = await readText(absolutePath);
    if (content === null || content.length > 1_000_000) continue;

    const path = repoPath(root, absolutePath);
    const frappeContext = FRAPPE_CONTEXT_RE.test(content);

    if (path.endsWith("hooks.py") && /\bapp_name\s*=/.test(content)) {
      frameworkEvidence.push(`${path} declares a Frappe app`);
    }
    if (/\bimport\s+frappe\b|\bfrom\s+frappe\b/.test(content) && frameworkEvidence.length < 5) {
      frameworkEvidence.push(`${path} imports frappe`);
    }

    if (!frappeContext) continue;

    const scan = findAstCalls(content, "python");
    if (!scan.parsed) {
      astFailures += 1;
      continue;
    }

    const seen = new Set<string>();

    for (const call of scan.calls) {
      const mutation = detectMutation(call);
      if (!mutation) continue;

      const scopedCalls = callsInSameScope(call, scan.calls);
      const hasAudit = scopedCalls.some((candidate) => AUDIT_RE.test(candidate.callee));
      const hasAuthorization = scopedCalls.some((candidate) => AUTHORIZATION_METHODS.has(candidate.method));
      const { operation, direct, irreversible } = mutation;
      const dedupeKey = `${call.line}:${call.column}:${operation}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const location: SourceLocation = { path, line: call.line, column: call.column };
      const boundaryId = stableId("boundary", `${path}:${call.line}:${call.column}:frappe:${operation}`);
      const sourceIdentity = `${path}:frappe:${operation}:${call.text.replace(/\s+/g, " ").trim()}`;
      const auditStatus: AssessmentBoundary["audit_status"] = hasAudit ? "partial" : "uncovered";
      const confidence: AssessmentBoundary["confidence"] = "high";

      boundaries.push({
        id: boundaryId,
        fingerprint: stableId("bfp", sourceIdentity),
        kind: "mutation",
        framework: "frappe",
        operation,
        location,
        audit_status: auditStatus,
        confidence,
        evidence: [
          {
            kind: "ast_call",
            detail: direct
              ? `Tree-sitter AST detected direct Frappe database mutation ${operation}`
              : `Tree-sitter AST detected Frappe document mutation .${operation}()`,
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
            `Detected Frappe mutation ${operation} without a visible AuditSpec emission call in the owning function scope.`,
            location,
            boundaryId,
            sourceIdentity,
            `AST confirms ${operation}; no AuditSpec/auditspec emission call found in the same scope in ${path}`,
            "Emit a semantic AuditSpec event at the Frappe service/controller boundary that owns this mutation while preserving native Version and Access Log behavior.",
          ),
        );
      }

      const bypass = direct || /ignore_permissions\s*=\s*True/.test(call.text);
      if (bypass && !hasAuthorization) {
        findings.push(
          finding(
            "AS-AUTH-001",
            "Permission-bypassing mutation without visible authorization evidence",
            "medium",
            "This AST-confirmed Frappe mutation uses a direct or permission-bypassing path, but no explicit authorization call is visible in the owning function scope.",
            location,
            boundaryId,
            sourceIdentity,
            `Direct/bypass mutation ${operation}; no has_permission/only_for/check_permission call found in the same scope in ${path}`,
            "Make the authorization decision explicit and audit it when the operation is privileged. Avoid permission bypass or direct DB mutation unless the boundary is intentionally controlled.",
          ),
        );
      }

      if (irreversible) {
        findings.push(
          finding(
            "AS-ATOMIC-001",
            "Mutation cannot share normal rollback semantics",
            "certain",
            "Frappe database truncate commits before executing the DDL operation and cannot be rolled back, so a normal same-transaction audit guarantee cannot cover this mutation.",
            location,
            boundaryId,
            sourceIdentity,
            `AST detected irreversible ${operation} boundary`,
            "Treat this as a special audit boundary. Record intent before execution and durable completion/failure evidence after execution; do not claim normal transaction atomicity.",
          ),
        );
      }
    }
  }

  const uniqueEvidence = [...new Set(frameworkEvidence)].slice(0, 8);
  return {
    detected: uniqueEvidence.length > 0,
    frameworkEvidence: uniqueEvidence,
    boundaries,
    findings,
    astFailures,
  };
}
