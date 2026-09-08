import type {
  AssessmentConfidence,
  AuditCoverageStatus,
} from "./assessment-types.js";
import type { AssurancePathSet } from "./assurance-paths.js";
import type {
  AssurancePathEvidence,
  AssuranceRole,
} from "./assurance-graph.js";

export interface AssuranceRoleCounts {
  audit: number;
  transaction: number;
  authorization: number;
}

export interface AssuranceRoleFlags {
  audit: boolean;
  transaction: boolean;
  authorization: boolean;
}

export interface AssurancePathEvaluation {
  reachable: AssurancePathEvidence[];
  reachable_paths: number;
  counts: AssuranceRoleCounts;
  all: AssuranceRoleFlags;
  mixed: AssuranceRoleFlags;
  truncated: boolean;
  audit_status: AuditCoverageStatus | null;
  confidence: AssessmentConfidence;
}

function weakestConfidence(paths: AssurancePathEvidence[]): AssessmentConfidence {
  if (paths.some((path) => path.confidence === "low")) return "low";
  if (paths.some((path) => path.confidence === "medium")) return "medium";
  return "high";
}

function countRole(paths: AssurancePathEvidence[], role: AssuranceRole): number {
  return paths.filter((path) => path.roles.includes(role)).length;
}

function allRole(count: number, total: number): boolean {
  return total > 0 && count === total;
}

function mixedRole(count: number, total: number): boolean {
  return count > 0 && count < total;
}

function statusFor(
  framework: string | undefined,
  counts: AssuranceRoleCounts,
  all: AssuranceRoleFlags,
  truncated: boolean,
): AuditCoverageStatus | null {
  if (truncated) return "unknown";

  if (framework === "rails") {
    if (counts.audit === 0) return "uncovered";
    return all.audit && all.transaction ? "covered" : "partial";
  }

  if (framework === "frappe") {
    return counts.audit === 0 ? "uncovered" : "partial";
  }

  return null;
}

export function evaluateAssurancePathSet(
  pathSet: AssurancePathSet,
  framework?: string,
): AssurancePathEvaluation | null {
  const reachable = pathSet.paths.filter((path) => path.roles.includes("entrypoint"));

  if (reachable.length === 0 && !pathSet.truncated) return null;

  const counts: AssuranceRoleCounts = {
    audit: countRole(reachable, "audit"),
    transaction: countRole(reachable, "transaction"),
    authorization: countRole(reachable, "authorization"),
  };
  const all: AssuranceRoleFlags = {
    audit: allRole(counts.audit, reachable.length),
    transaction: allRole(counts.transaction, reachable.length),
    authorization: allRole(counts.authorization, reachable.length),
  };
  const mixed: AssuranceRoleFlags = {
    audit: mixedRole(counts.audit, reachable.length),
    transaction: mixedRole(counts.transaction, reachable.length),
    authorization: mixedRole(counts.authorization, reachable.length),
  };

  return {
    reachable,
    reachable_paths: reachable.length,
    counts,
    all,
    mixed,
    truncated: pathSet.truncated,
    audit_status: statusFor(framework, counts, all, pathSet.truncated),
    confidence: pathSet.truncated ? "low" : weakestConfidence(reachable),
  };
}
