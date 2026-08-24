import assert from "node:assert/strict";
import test from "node:test";
import { hardenAssessmentAcrossPaths } from "../src/all-path-assurance.js";
import { findAssurancePaths } from "../src/assurance-paths.js";
import type {
  AssuranceGraph,
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "../src/assurance-graph.js";
import type { AssessmentReport } from "../src/assessment-types.js";

const mutationLocation = { path: "app/services/refund_service.rb", line: 10, column: 5 };

function node(
  id: string,
  qualifiedName: string,
  roles: AssuranceRole[],
  line = 1,
): AssuranceGraphNode {
  return {
    id,
    kind: "scope",
    language: "ruby",
    name: qualifiedName.split("#").at(-1) ?? qualifiedName,
    qualified_name: qualifiedName,
    location: { path: id === "mutation" ? mutationLocation.path : `app/${id}.rb`, line, column: 1 },
    range: {
      start_line: id === "mutation" ? 1 : line,
      end_line: id === "mutation" ? 30 : line + 5,
    },
    roles,
    confidence: "high",
  };
}

function edge(from: string, to: string): AssuranceGraphEdge {
  return { from, to, kind: "call", confidence: "high" };
}

function graph(
  nodes: AssuranceGraphNode[],
  edges: AssuranceGraphEdge[],
  unresolved: AssuranceGraph["unresolved_calls"] = [],
): AssuranceGraph {
  return {
    graph_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/repo" },
    nodes,
    edges,
    unresolved_calls: unresolved,
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      entrypoints: nodes.filter((item) => item.roles.includes("entrypoint")).length,
      mutation_nodes: nodes.filter((item) => item.roles.includes("mutation")).length,
      audit_nodes: nodes.filter((item) => item.roles.includes("audit")).length,
      unresolved_calls: unresolved.length,
      surface_nodes: nodes.filter((item) => item.kind === "surface").length,
      framework_edges: edges.filter((item) => item.kind === "framework_dispatch").length,
    },
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

test("adding a weaker alternate path cannot improve audit assurance", () => {
  const mutation = node("mutation", "RefundService#call", ["mutation"]);
  const strong = node("strong", "RefundsController#refund", ["entrypoint", "audit", "transaction"]);

  const strongOnly = hardenAssessmentAcrossPaths(
    assessment(),
    graph([strong, mutation], [edge("strong", "mutation")]),
  );
  assert.equal(strongOnly.boundaries[0]?.audit_status, "covered");
  assert.equal(strongOnly.coverage.audit_coverage, 1);

  const weak = node("weak", "AdminRefundsController#refund", ["entrypoint"]);
  const withWeakPath = hardenAssessmentAcrossPaths(
    assessment(),
    graph([strong, weak, mutation], [edge("strong", "mutation"), edge("weak", "mutation")]),
  );

  assert.equal(withWeakPath.boundaries[0]?.audit_status, "partial");
  assert.equal(withWeakPath.coverage.audit_coverage, 0);
  assert.ok(withWeakPath.findings.some((finding) => finding.rule_id === "AS-AUDIT-002"));
});

test("an unresolved call cannot create reachability or assurance evidence", () => {
  const entrypoint = node("entry", "RefundsController#refund", ["entrypoint", "audit", "transaction"]);
  const mutation = node("mutation", "RefundService#call", ["mutation"]);
  const value = graph(
    [entrypoint, mutation],
    [],
    [
      {
        from: "entry",
        callee: "RefundService.call",
        location: { path: "app/entry.rb", line: 3, column: 5 },
        reason: "ambiguous",
        candidates: ["mutation"],
      },
    ],
  );

  const paths = findAssurancePaths(value, mutationLocation);
  assert.equal(paths.truncated, false);
  assert.equal(paths.paths.length, 1);
  assert.deepEqual(paths.paths[0]?.node_ids, ["mutation"]);
  assert.equal(paths.paths[0]?.roles.includes("entrypoint"), false);
  assert.equal(paths.paths[0]?.roles.includes("audit"), false);
});

test("cycles terminate without inventing duplicate assurance paths", () => {
  const entrypoint = node("entry", "RefundsController#refund", ["entrypoint", "authorization"]);
  const service = node("service", "RefundOrchestrator#call", []);
  const mutation = node("mutation", "RefundService#call", ["mutation", "audit", "transaction"]);
  const value = graph(
    [entrypoint, service, mutation],
    [edge("entry", "service"), edge("service", "mutation"), edge("mutation", "service")],
  );

  const paths = findAssurancePaths(value, mutationLocation, 8, 64);
  assert.equal(paths.truncated, false);
  assert.equal(paths.paths.length, 1);
  assert.deepEqual(paths.paths[0]?.node_ids, ["entry", "service", "mutation"]);
  assert.ok(paths.paths[0]?.roles.includes("entrypoint"));
  assert.ok(paths.paths[0]?.roles.includes("authorization"));
  assert.ok(paths.paths[0]?.roles.includes("audit"));
});

test("path enumeration truncation degrades assurance to unknown and low confidence", () => {
  const mutation = node("mutation", "RefundService#call", ["mutation"]);
  const entrypoints = Array.from({ length: 65 }, (_, index) =>
    node(`entry_${index}`, `RefundsController${index}#refund`, ["entrypoint", "audit", "transaction"]),
  );
  const value = graph(
    [...entrypoints, mutation],
    entrypoints.map((entrypoint) => edge(entrypoint.id, "mutation")),
  );

  const paths = findAssurancePaths(value, mutationLocation, 8, 64);
  assert.equal(paths.paths.length, 64);
  assert.equal(paths.truncated, true);

  const hardened = hardenAssessmentAcrossPaths(assessment(), value);
  assert.equal(hardened.boundaries[0]?.audit_status, "unknown");
  assert.equal(hardened.boundaries[0]?.confidence, "low");
  assert.equal(hardened.coverage.unknown_boundaries, 1);
  assert.equal(hardened.coverage.audit_coverage, 0);
  assert.equal(
    (hardened.metadata?.all_path_assurance as { truncated_path_sets?: number } | undefined)?.truncated_path_sets,
    1,
  );
});
