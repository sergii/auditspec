import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAssurancePathSet } from "../src/assurance-evaluation.js";
import { findAssurancePaths, type AssurancePathSet } from "../src/assurance-paths.js";
import type {
  AssuranceGraph,
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssurancePathEvidence,
  AssuranceRole,
} from "../src/assurance-graph.js";

class DeterministicRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }

  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  bool(): boolean {
    return this.next() < 0.5;
  }
}

const assuranceRoles: AssuranceRole[] = ["audit", "transaction", "authorization"];
const confidences: AssurancePathEvidence["confidence"][] = ["high", "medium", "low"];

function generatedPath(random: DeterministicRandom, index: number): AssurancePathEvidence {
  const roles: AssuranceRole[] = ["entrypoint"];
  for (const role of assuranceRoles) {
    if (random.bool()) roles.push(role);
  }

  return {
    node_ids: [`entry_${index}`, "mutation"],
    qualified_names: [`Entry${index}#call`, "MutationService#call"],
    roles: [...new Set(roles)].sort() as AssuranceRole[],
    confidence: confidences[random.int(confidences.length)] ?? "low",
  };
}

function oracle(pathSet: AssurancePathSet, framework: string | undefined) {
  const reachable = pathSet.paths.filter((path) => path.roles.includes("entrypoint"));
  if (reachable.length === 0 && !pathSet.truncated) return null;

  const count = (role: AssuranceRole) => reachable.filter((path) => path.roles.includes(role)).length;
  const audit = count("audit");
  const transaction = count("transaction");
  const authorization = count("authorization");
  const all = (value: number) => reachable.length > 0 && value === reachable.length;
  const mixed = (value: number) => value > 0 && value < reachable.length;

  let auditStatus: "covered" | "partial" | "uncovered" | "unknown" | null = null;
  if (pathSet.truncated) {
    auditStatus = "unknown";
  } else if (framework === "rails") {
    auditStatus = audit === 0 ? "uncovered" : all(audit) && all(transaction) ? "covered" : "partial";
  } else if (framework === "frappe") {
    auditStatus = audit === 0 ? "uncovered" : "partial";
  }

  const confidence = pathSet.truncated
    ? "low"
    : reachable.some((path) => path.confidence === "low")
      ? "low"
      : reachable.some((path) => path.confidence === "medium")
        ? "medium"
        : "high";

  return {
    reachable_paths: reachable.length,
    counts: { audit, transaction, authorization },
    all: {
      audit: all(audit),
      transaction: all(transaction),
      authorization: all(authorization),
    },
    mixed: {
      audit: mixed(audit),
      transaction: mixed(transaction),
      authorization: mixed(authorization),
    },
    audit_status: auditStatus,
    confidence,
  };
}

test("randomized path-set evaluation matches an independent oracle", () => {
  for (let seed = 1; seed <= 2_000; seed += 1) {
    const random = new DeterministicRandom(seed);
    const pathCount = random.int(9);
    const paths = Array.from({ length: pathCount }, (_, index) => generatedPath(random, index));
    const truncated = random.next() < 0.08;
    const framework = ["rails", "frappe", undefined][random.int(3)];
    const pathSet: AssurancePathSet = { paths, truncated, max_paths: 64 };

    const actual = evaluateAssurancePathSet(pathSet, framework);
    const expected = oracle(pathSet, framework);

    if (expected === null) {
      assert.equal(actual, null, `seed ${seed}`);
      continue;
    }

    assert.ok(actual, `seed ${seed}: expected an evaluation`);
    assert.equal(actual.reachable_paths, expected.reachable_paths, `seed ${seed}: reachable paths`);
    assert.deepEqual(actual.counts, expected.counts, `seed ${seed}: role counts`);
    assert.deepEqual(actual.all, expected.all, `seed ${seed}: all-role flags`);
    assert.deepEqual(actual.mixed, expected.mixed, `seed ${seed}: mixed-role flags`);
    assert.equal(actual.audit_status, expected.audit_status, `seed ${seed}: audit status`);
    assert.equal(actual.confidence, expected.confidence, `seed ${seed}: confidence`);
  }
});

test("randomized path-set evaluation is invariant to path ordering", () => {
  for (let seed = 2_001; seed <= 2_500; seed += 1) {
    const random = new DeterministicRandom(seed);
    const paths = Array.from({ length: 1 + random.int(8) }, (_, index) => generatedPath(random, index));
    const pathSet: AssurancePathSet = { paths, truncated: false, max_paths: 64 };
    const forward = evaluateAssurancePathSet(pathSet, "rails");
    const reversed = evaluateAssurancePathSet({ ...pathSet, paths: [...paths].reverse() }, "rails");

    assert.ok(forward && reversed, `seed ${seed}`);
    assert.deepEqual(forward.counts, reversed.counts, `seed ${seed}: counts`);
    assert.deepEqual(forward.all, reversed.all, `seed ${seed}: all flags`);
    assert.deepEqual(forward.mixed, reversed.mixed, `seed ${seed}: mixed flags`);
    assert.equal(forward.audit_status, reversed.audit_status, `seed ${seed}: status`);
    assert.equal(forward.confidence, reversed.confidence, `seed ${seed}: confidence`);
  }
});

function graphNode(id: string, entrypoint: boolean): AssuranceGraphNode {
  return {
    id,
    kind: "scope",
    language: "ruby",
    name: id,
    qualified_name: `Generated#${id}`,
    location: { path: "generated.rb", line: Number(id.slice(1)) + 1, column: 1 },
    range: { start_line: Number(id.slice(1)) + 1, end_line: Number(id.slice(1)) + 1 },
    roles: entrypoint ? ["entrypoint"] : id === "n0" ? ["mutation"] : [],
    confidence: "high",
  };
}

function randomGraph(seed: number): AssuranceGraph {
  const random = new DeterministicRandom(seed);
  const nodeCount = 4 + random.int(9);
  const nodes = Array.from({ length: nodeCount }, (_, index) => graphNode(`n${index}`, index > 0 && random.next() < 0.25));
  const edges: AssuranceGraphEdge[] = [];

  for (let from = 0; from < nodeCount; from += 1) {
    for (let to = 0; to < nodeCount; to += 1) {
      if (from === to || random.next() >= 0.14) continue;
      edges.push({
        from: `n${from}`,
        to: `n${to}`,
        kind: "call",
        confidence: random.bool() ? "high" : "medium",
        call: {
          callee: `Generated.n${to}`,
          location: { path: "generated.rb", line: from + 1, column: 1 },
        },
      });
    }
  }

  return {
    graph_version: "0.1",
    generated_at: "2026-08-24T20:00:00Z",
    subject: { kind: "repository", path: "/generated" },
    nodes,
    edges,
    unresolved_calls: [],
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      entrypoints: nodes.filter((node) => node.roles.includes("entrypoint")).length,
      mutation_nodes: 1,
      audit_nodes: 0,
      unresolved_calls: 0,
      surface_nodes: 0,
      framework_edges: 0,
    },
  };
}

test("randomized graph traversal stays bounded, unique, and cycle-safe", () => {
  const location = { path: "generated.rb", line: 1, column: 1 };

  for (let seed = 3_001; seed <= 3_500; seed += 1) {
    const graph = randomGraph(seed);
    const result = findAssurancePaths(graph, location, 8, 32);

    assert.ok(result.paths.length <= 32, `seed ${seed}: path bound`);
    const identities = result.paths.map((path) => path.node_ids.join("->"));
    assert.equal(new Set(identities).size, identities.length, `seed ${seed}: duplicate paths`);

    for (const path of result.paths) {
      assert.equal(new Set(path.node_ids).size, path.node_ids.length, `seed ${seed}: repeated node in path`);
      assert.ok(path.node_ids.length <= 9, `seed ${seed}: depth bound`);
      assert.equal(path.node_ids.at(-1), "n0", `seed ${seed}: target must remain last`);
    }
  }
});
