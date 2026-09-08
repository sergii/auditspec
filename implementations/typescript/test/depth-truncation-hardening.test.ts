import assert from "node:assert/strict";
import test from "node:test";
import { hardenAssessmentAcrossPaths } from "../src/all-path-assurance.js";
import type {
  AssuranceGraph,
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "../src/assurance-graph.js";
import type { AssessmentReport } from "../src/assessment-types.js";

const mutationLocation = { path: "app/services/refund_service.rb", line: 10, column: 5 };

function scope(id: string, roles: AssuranceRole[]): AssuranceGraphNode {
  return {
    id,
    kind: "scope",
    language: "ruby",
    name: id,
    qualified_name: id,
    location: {
      path: id === "mutation" ? mutationLocation.path : `app/services/${id}.rb`,
      line: 1,
      column: 1,
    },
    range: { start_line: 1, end_line: id === "mutation" ? 30 : 5 },
    roles,
    confidence: "high",
  };
}

function assessment(): AssessmentReport {
  return {
    report_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/repo" },
    inspector: { name: "auditspec", version: "0.1.0-draft", adapters: ["test"] },
    frameworks: [{ name: "rails", confidence: "high" }],
    boundaries: [
      {
        id: "boundary_refund",
        fingerprint: "bfp_refund",
        kind: "mutation",
        framework: "rails",
        operation: "update!",
        location: mutationLocation,
        audit_status: "covered",
        confidence: "high",
        reachability: { status: "unknown", confidence: "low" },
        evidence: [],
      },
    ],
    findings: [],
    coverage: {
      detected_boundaries: 1,
      covered_boundaries: 1,
      partial_boundaries: 0,
      uncovered_boundaries: 0,
      unknown_boundaries: 0,
      audit_coverage: 1,
    },
    reachability: { reachable_boundaries: 0, unknown_boundaries: 1 },
  };
}

test("canonical hardening downgrades optimistic coverage when depth truncates before an entrypoint", () => {
  const entrypoint = scope("entrypoint", ["entrypoint", "audit", "transaction"]);
  const intermediates = Array.from({ length: 8 }, (_, index) => scope(`layer_${index}`, []));
  const mutation = scope("mutation", ["mutation"]);
  const chain = [entrypoint, ...intermediates, mutation];
  const edges: AssuranceGraphEdge[] = chain.slice(0, -1).map((item, index) => ({
    from: item.id,
    to: chain[index + 1]!.id,
    kind: "call",
    confidence: "high",
  }));
  const graph: AssuranceGraph = {
    graph_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/repo" },
    nodes: chain,
    edges,
    unresolved_calls: [],
    summary: {
      nodes: chain.length,
      edges: edges.length,
      entrypoints: 1,
      mutation_nodes: 1,
      audit_nodes: 1,
      unresolved_calls: 0,
      surface_nodes: 0,
      framework_edges: 0,
    },
  };

  const report = hardenAssessmentAcrossPaths(assessment(), graph);

  assert.equal(report.boundaries[0]?.audit_status, "unknown");
  assert.equal(report.boundaries[0]?.confidence, "low");
  assert.equal(report.coverage.covered_boundaries, 0);
  assert.equal(report.coverage.unknown_boundaries, 1);
  assert.equal(report.coverage.audit_coverage, 0);
  assert.equal(
    (report.metadata?.all_path_assurance as { truncated_path_sets?: number } | undefined)?.truncated_path_sets,
    1,
  );
});
