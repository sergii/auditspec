import { createHash } from "node:crypto";
import type { AssessmentBoundary, AssessmentFinding, AssessmentReport } from "./assessment-types.js";
import { findAssurancePaths, type AssurancePathSet } from "./assurance-paths.js";
import type { AssuranceGraph, AssurancePathEvidence, AssuranceRole } from "./assurance-graph.js";

const PRIVILEGED_RE = /\b(delete|destroy|refund|approve|role|permission|impersonat\w*|grant|revoke|cancel|truncate)\b/i;

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function weakestConfidence(paths: AssurancePathEvidence[]): AssessmentFinding["confidence"] {
  if (paths.some((path) => path.confidence === "low")) return "low";
  if (paths.some((path) => path.confidence === "medium")) return "medium";
  return "high";
}

function isPrivileged(boundary: AssessmentBoundary): boolean {
  const tokens = `${boundary.location.path} ${boundary.operation}`.replace(/[_/.:!?=-]+/g, " ");
  if (PRIVILEGED_RE.test(tokens)) return true;
  if (boundary.framework === "frappe") {
    return /^frappe\.db\./.test(boundary.operation)
      || /^db_(?:set|insert|update)$/.test(boundary.operation)
      || boundary.operation === "frappe.delete_doc";
  }
  return false;
}

function missingPath(paths: AssurancePathEvidence[], role: AssuranceRole): AssurancePathEvidence | undefined {
  return paths.find((path) => !path.roles.includes(role));
}

function pathSetDetail(pathSet: AssurancePathSet, reachable: AssurancePathEvidence[]): string {
  const counts = (role: AssuranceRole) => reachable.filter((path) => path.roles.includes(role)).length;
  return [
    `Evaluated ${reachable.length} statically reachable assurance path(s)`,
    `audit ${counts("audit")}/${reachable.length}`,
    `transaction ${counts("transaction")}/${reachable.length}`,
    `authorization ${counts("authorization")}/${reachable.length}`,
    pathSet.truncated ? `enumeration truncated at ${pathSet.max_paths} paths` : "enumeration not truncated",
  ].join("; ");
}

function alternatePathFinding(
  ruleId: "AS-AUDIT-002" | "AS-ATOMIC-002" | "AS-AUTH-002",
  boundary: AssessmentBoundary,
  title: string,
  message: string,
  remediation: string,
  missing: AssurancePathEvidence,
  confidence: AssessmentFinding["confidence"],
): AssessmentFinding {
  const sourceIdentity = `${ruleId}:${boundary.fingerprint}`;
  return {
    id: stableId("finding", `${sourceIdentity}:${boundary.id}`),
    fingerprint: stableId("fp", sourceIdentity),
    rule_id: ruleId,
    title,
    severity: "warning",
    confidence,
    status: "open",
    message,
    location: boundary.location,
    boundary_id: boundary.id,
    evidence: [
      {
        kind: "assurance_path_set",
        detail: `Alternate reachable path lacks required assurance role: ${missing.qualified_names.join(" -> ")} [roles: ${missing.roles.join(", ") || "none"}; confidence: ${missing.confidence}]`,
        location: boundary.location,
      },
    ],
    remediation: { summary: remediation },
  };
}

function mixedRole(paths: AssurancePathEvidence[], role: AssuranceRole): boolean {
  const count = paths.filter((path) => path.roles.includes(role)).length;
  return count > 0 && count < paths.length;
}

function removeSuperseded(
  findings: AssessmentFinding[],
  boundaryId: string,
  ruleId: "AS-AUDIT-001" | "AS-ATOMIC-001" | "AS-AUTH-001",
): AssessmentFinding[] {
  return findings.filter((finding) => !(finding.boundary_id === boundaryId && finding.rule_id === ruleId));
}

export function hardenAssessmentAcrossPaths(
  report: AssessmentReport,
  graph: AssuranceGraph,
): AssessmentReport {
  let findings = [...report.findings];
  let pathSetsEvaluated = 0;
  let truncatedPathSets = 0;
  let alternatePathFindings = 0;

  for (const boundary of report.boundaries) {
    const pathSet = findAssurancePaths(graph, boundary.location);
    const reachable = pathSet.paths.filter((path) => path.roles.includes("entrypoint"));
    if (reachable.length === 0) continue;

    pathSetsEvaluated += 1;
    if (pathSet.truncated) truncatedPathSets += 1;

    const auditCount = reachable.filter((path) => path.roles.includes("audit")).length;
    const transactionCount = reachable.filter((path) => path.roles.includes("transaction")).length;
    const authorizationCount = reachable.filter((path) => path.roles.includes("authorization")).length;
    const allAudit = auditCount === reachable.length;
    const allTransaction = transactionCount === reachable.length;

    if (pathSet.truncated) {
      boundary.audit_status = "unknown";
      boundary.confidence = "low";
    } else if (boundary.framework === "rails") {
      boundary.audit_status = auditCount === 0
        ? "uncovered"
        : allAudit && allTransaction
          ? "covered"
          : "partial";
    } else if (boundary.framework === "frappe") {
      boundary.audit_status = auditCount === 0 ? "uncovered" : "partial";
    }

    boundary.evidence = [
      ...(boundary.evidence ?? []),
      {
        kind: "assurance_path_set",
        detail: pathSetDetail(pathSet, reachable),
        location: boundary.location,
      },
    ];

    const confidence = pathSet.truncated ? "low" : weakestConfidence(reachable);

    if (mixedRole(reachable, "audit")) {
      findings = removeSuperseded(findings, boundary.id, "AS-AUDIT-001");
      const missing = missingPath(reachable, "audit")!;
      findings.push(alternatePathFinding(
        "AS-AUDIT-002",
        boundary,
        "Alternate reachable path lacks audit evidence",
        "At least one statically reachable path to this mutation has semantic audit evidence while another resolved entrypoint path does not.",
        "Move semantic audit emission to a boundary shared by every reachable mutation path, or audit each alternate path explicitly and verify them independently.",
        missing,
        confidence,
      ));
      alternatePathFindings += 1;
    }

    if (boundary.framework === "rails" && allAudit && mixedRole(reachable, "transaction")) {
      findings = removeSuperseded(findings, boundary.id, "AS-ATOMIC-001");
      const missing = missingPath(reachable, "transaction")!;
      findings.push(alternatePathFinding(
        "AS-ATOMIC-002",
        boundary,
        "Alternate audited path lacks transaction evidence",
        "Semantic audit evidence is present on every resolved entrypoint path, but transaction evidence is inconsistent across those paths.",
        "Move mutation and durable audit write behind a shared reliable commit boundary, or use a transactional outbox on every path that cannot share a transaction.",
        missing,
        confidence,
      ));
      alternatePathFindings += 1;
    }

    if (isPrivileged(boundary) && mixedRole(reachable, "authorization")) {
      findings = removeSuperseded(findings, boundary.id, "AS-AUTH-001");
      const missing = missingPath(reachable, "authorization")!;
      findings.push(alternatePathFinding(
        "AS-AUTH-002",
        boundary,
        "Alternate reachable path bypasses visible authorization",
        "This privileged mutation is reachable through multiple resolved entrypoints. Authorization evidence exists on at least one path but is absent from another.",
        "Put authorization at a shared boundary that dominates every privileged mutation path, or explicitly authorize and test each alternate entrypoint.",
        missing,
        confidence,
      ));
      alternatePathFindings += 1;
    }

    if (pathSet.truncated) {
      const affected = findings.filter((finding) => finding.boundary_id === boundary.id);
      for (const finding of affected) finding.confidence = "low";
    }

    if (authorizationCount === reachable.length) {
      findings = findings.filter(
        (finding) => !(finding.boundary_id === boundary.id && finding.rule_id === "AS-AUTH-001"),
      );
    }
  }

  const covered = report.boundaries.filter((boundary) => boundary.audit_status === "covered").length;
  const partial = report.boundaries.filter((boundary) => boundary.audit_status === "partial").length;
  const uncovered = report.boundaries.filter((boundary) => boundary.audit_status === "uncovered").length;
  const unknown = report.boundaries.filter((boundary) => boundary.audit_status === "unknown").length;

  report.findings = findings.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
  report.coverage = {
    detected_boundaries: report.boundaries.length,
    covered_boundaries: covered,
    partial_boundaries: partial,
    uncovered_boundaries: uncovered,
    unknown_boundaries: unknown,
    audit_coverage: report.boundaries.length === 0 ? 0 : covered / report.boundaries.length,
  };
  report.inspector.adapters = [...new Set([...report.inspector.adapters, "assurance-all-path-v0.1"])];
  report.metadata = {
    ...(report.metadata ?? {}),
    all_path_assurance: {
      path_sets_evaluated: pathSetsEvaluated,
      truncated_path_sets: truncatedPathSets,
      alternate_path_findings: alternatePathFindings,
      max_paths_per_boundary: 64,
      max_depth: 8,
    },
  };

  return report;
}
