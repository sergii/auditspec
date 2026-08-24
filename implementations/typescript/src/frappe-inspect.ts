import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import type {
  AssessmentBoundary,
  AssessmentFinding,
  SourceLocation,
} from "./assessment-types.js";

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

const AUDIT_RE = /\b(?:AuditSpec|auditspec)\.(?:emit|record)\s*\(|\bemit_audit\s*\(/;
const AUTHORIZATION_RE = /\bfrappe\.has_permission\s*\(|\bfrappe\.only_for\s*\(|\.check_permission\s*\(|\bfrappe\.get_roles\s*\(|\bPermissionError\b/;
const FRAPPE_CONTEXT_RE = /\bimport\s+frappe\b|\bfrom\s+frappe\b|\bfrappe\.get_doc\s*\(|\bDocument\b/;
const DIRECT_DB_RE = /\bfrappe\.db\.(set_value|update)\s*\(|\bfrappe\.delete_doc\s*\(|\.db_(set|insert|update)\s*\(/;
const DOC_MUTATION_RE = /\.\s*(save|insert|submit|cancel|delete)\s*\(/;
const BYPASS_RE = /ignore_permissions\s*=\s*True|\.db_(insert|update)\s*\(|\bfrappe\.db\.(set_value|update)\s*\(/;

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

export interface FrappeInspectionResult {
  detected: boolean;
  frameworkEvidence: string[];
  boundaries: AssessmentBoundary[];
  findings: AssessmentFinding[];
}

export async function inspectFrappeRepository(root: string): Promise<FrappeInspectionResult> {
  const files = await collectPythonFiles(root);
  const frameworkEvidence: string[] = [];
  const boundaries: AssessmentBoundary[] = [];
  const findings: AssessmentFinding[] = [];

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

    const hasAudit = AUDIT_RE.test(content);
    const hasAuthorization = AUTHORIZATION_RE.test(content);
    const lines = content.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (line === undefined) continue;

      const directMatch = line.match(DIRECT_DB_RE);
      const docMatch = line.match(DOC_MUTATION_RE);
      const operation = directMatch?.[1] ?? docMatch?.[1];
      if (!operation) continue;

      const isDirectDb = directMatch !== null;
      const location: SourceLocation = { path, line: index + 1 };
      const boundaryId = stableId("boundary", `${path}:${index + 1}:frappe:${operation}`);
      const sourceIdentity = `${path}:frappe:${operation}:${line.trim()}`;
      const auditStatus: AssessmentBoundary["audit_status"] = hasAudit ? "partial" : "uncovered";
      const confidence: AssessmentBoundary["confidence"] = isDirectDb ? "high" : "medium";

      boundaries.push({
        id: boundaryId,
        kind: "mutation",
        framework: "frappe",
        operation,
        location,
        audit_status: auditStatus,
        confidence,
        evidence: [
          {
            kind: "source_match",
            detail: isDirectDb
              ? `Detected direct Frappe database mutation near ${operation}`
              : `Detected Frappe document mutation .${operation}()`,
            location,
          },
        ],
      });

      if (!hasAudit) {
        findings.push(
          finding(
            "AS-AUDIT-001",
            "Unaudited mutation boundary",
            confidence,
            `Detected Frappe mutation ${operation} without a visible AuditSpec emission marker in the same source file.`,
            location,
            boundaryId,
            sourceIdentity,
            `No AuditSpec/auditspec emission marker found in ${path}`,
            "Emit a semantic AuditSpec event at the Frappe service/controller boundary that owns this mutation while preserving native Version and Access Log behavior.",
          ),
        );
      }

      if (BYPASS_RE.test(line) && !hasAuthorization) {
        findings.push(
          finding(
            "AS-AUTH-001",
            "Permission-bypassing mutation without visible authorization evidence",
            "medium",
            "This Frappe mutation uses a path that can bypass normal ORM hooks or permission checks, but no explicit authorization evidence is visible in the same source file.",
            location,
            boundaryId,
            sourceIdentity,
            `Bypass/direct database marker found near ${operation}; no has_permission/only_for/check_permission marker found in ${path}`,
            "Make the authorization decision explicit and audit it when the operation is privileged. Avoid ignore_permissions or direct DB mutation unless the boundary is intentionally controlled.",
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
  };
}
