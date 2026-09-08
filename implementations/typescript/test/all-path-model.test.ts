import assert from "node:assert/strict";
import test from "node:test";
import { hardenAssessmentAcrossPaths } from "../src/all-path-assurance.js";
import type {
  AssuranceGraph,
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "../src/assurance-graph.js";
import type { AssessmentReport, AuditCoverageStatus } from "../src/assessment-types.js";

interface PathProfile {
  audit: boolean;
  transaction: boolean;
  authorization: boolean;
}

const mutationLocation = { path: "app/services/refund_service.rb", line: 10, column: 5 };

const profiles: PathProfile[] = Array.from({ length: 8 }, (_, mask) => ({
  audit: Boolean(mask & 1),
  transaction: Boolean(mask & 2),
  authorization: Boolean(mask & 4),
}));

function roleList(profile: PathProfile): AssuranceRole[] {
  const roles: AssuranceRole[] = ["entrypoint"];
  if (profile.audit) roles.push("audit");
  if (profile.transaction) roles.push("transaction");
  if (profile.authorization) roles.push("authorization");
  return roles;
}

function entrypoint(index: number, profile: PathProfile): AssuranceGraphNode {
  return {
    id: `entry_${index}`,
    kind: "scope",
    language: "ruby",
    name: "refund",
    qualified_name: `RefundsController${index}#refund`,
    location: { path: `app/controllers/refunds_${index}_controller.rb`, line: 1, column: 1 },
    range: { start_line: 1, end_line: 5 },
    roles: roleList(profile),
    confidence: "high",
  };
}

function mutationNode(): AssuranceGraphNode {
  return {
    id: "mutation",
    kind: "scope",
    language: "ruby",
    name: "call",
    qualified_name: "RefundService#call",
    location: { path: mutationLocation.path, line: 1, column: 1 },
    range: { start_line: 1, end_line: 30 },
    roles: ["mutation"],
    confidence: "high",
  };
}

function edge(from: string): AssuranceGraphEdge {
  return { from, to: "mutation", kind: "call", confidence: "high" };
}

function graphFor(pathProfiles: PathProfile[]): AssuranceGraph {
  const entries = pathProfiles.map((profile, index) => entrypoint(index, profile));
  const mutation = mutationNode();
  const edges = entries.map((item) => edge(item.id));
  const nodes = [...entries, mutation];

  return {
    graph_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/repo" },
    nodes,
    edges,
    unresolved_calls: [],
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      entrypoints: entries.length,
      mutation_nodes: 1,
      audit_nodes: entries.filter((item) => item.roles.includes("audit")).length,
      unresolved_calls: 0,
      surface_nodes: 0,
      framework_edges: 0,
    },
  };
}

function assessment(): AssessmentReport {
  return {
    report_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/repo" },
    inspector: { name: "auditspec", version: "0.1.0-draft", adapters: ["model-test"] },
    frameworks: [{ name: "rails", confidence: "high" }],
    boundaries: [
      {
        id: "boundary_refund",
        fingerprint: "bfp_refund",
        kind: "mutation",
        framework: "rails",
        operation: "update!",
        location: mutationLocation,
        audit_status: "unknown",
        confidence: "high",
        reachability: { status: "unknown", confidence: "low" },
        evidence: [],
      },
    ],
    findings: [],
    coverage: {
      detected_boundaries: 1,
      covered_boundaries: 0,
      partial_boundaries: 0,
      uncovered_boundaries: 0,
      unknown_boundaries: 1,
      audit_coverage: 0,
    },
    reachability: { reachable_boundaries: 0, unknown_boundaries: 1 },
  };
}

function combinations(length: number, prefix: PathProfile[] = []): PathProfile[][] {
  if (prefix.length === length) return [prefix];
  return profiles.flatMap((profile) => combinations(length, [...prefix, profile]));
}

function expectedStatus(pathProfiles: PathProfile[]): AuditCoverageStatus {
  const auditCount = pathProfiles.filter((profile) => profile.audit).length;
  const transactionCount = pathProfiles.filter((profile) => profile.transaction).length;
  if (auditCount === 0) return "uncovered";
  if (auditCount === pathProfiles.length && transactionCount === pathProfiles.length) return "covered";
  return "partial";
}

function mixed(pathProfiles: PathProfile[], key: keyof PathProfile): boolean {
  const count = pathProfiles.filter((profile) => profile[key]).length;
  return count > 0 && count < pathProfiles.length;
}

test("all-path Rails classification matches an exhaustive small-state oracle", () => {
  let evaluated = 0;

  for (const pathCount of [1, 2, 3]) {
    for (const pathProfiles of combinations(pathCount)) {
      const report = hardenAssessmentAcrossPaths(assessment(), graphFor(pathProfiles));
      const rules = new Set(report.findings.map((finding) => finding.rule_id));
      const expected = expectedStatus(pathProfiles);
      const allAudit = pathProfiles.every((profile) => profile.audit);

      assert.equal(
        report.boundaries[0]?.audit_status,
        expected,
        `unexpected status for ${JSON.stringify(pathProfiles)}`,
      );
      assert.equal(
        report.coverage.audit_coverage,
        expected === "covered" ? 1 : 0,
        `unexpected coverage for ${JSON.stringify(pathProfiles)}`,
      );
      assert.equal(
        rules.has("AS-AUDIT-002"),
        mixed(pathProfiles, "audit"),
        `unexpected AS-AUDIT-002 for ${JSON.stringify(pathProfiles)}`,
      );
      assert.equal(
        rules.has("AS-ATOMIC-002"),
        allAudit && mixed(pathProfiles, "transaction"),
        `unexpected AS-ATOMIC-002 for ${JSON.stringify(pathProfiles)}`,
      );
      assert.equal(
        rules.has("AS-AUTH-002"),
        mixed(pathProfiles, "authorization"),
        `unexpected AS-AUTH-002 for ${JSON.stringify(pathProfiles)}`,
      );

      evaluated += 1;
    }
  }

  assert.equal(evaluated, 584);
});
