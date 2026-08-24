import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAssurancePathSet } from "../src/assurance-evaluation.js";
import type { AssurancePathSet } from "../src/assurance-paths.js";
import type { AssurancePathEvidence, AssuranceRole } from "../src/assurance-graph.js";

function path(id: string, roles: AssuranceRole[], confidence: AssurancePathEvidence["confidence"] = "medium"): AssurancePathEvidence {
  return {
    node_ids: [id],
    qualified_names: [id],
    roles,
    confidence,
  };
}

function pathSet(paths: AssurancePathEvidence[], truncated = false): AssurancePathSet {
  return { paths, truncated, max_paths: 64 };
}

test("returns null when no statically reachable entrypoint is resolved and search is complete", () => {
  const result = evaluateAssurancePathSet(pathSet([path("mutation", ["mutation"])]), "rails");
  assert.equal(result, null);
});

test("truncated search with no resolved entrypoint is unknown, low-confidence, and has no all-role claims", () => {
  const result = evaluateAssurancePathSet(pathSet([path("partial", ["mutation"])], true), "rails");
  assert.ok(result);
  assert.equal(result.reachable_paths, 0);
  assert.equal(result.audit_status, "unknown");
  assert.equal(result.confidence, "low");
  assert.deepEqual(result.counts, { audit: 0, transaction: 0, authorization: 0 });
  assert.deepEqual(result.all, { audit: false, transaction: false, authorization: false });
  assert.deepEqual(result.mixed, { audit: false, transaction: false, authorization: false });
});

test("Rails requires audit and transaction on every reachable path for covered status", () => {
  const covered = evaluateAssurancePathSet(
    pathSet([
      path("route-a", ["entrypoint", "audit", "transaction"]),
      path("route-b", ["entrypoint", "audit", "transaction"]),
    ]),
    "rails",
  );
  assert.ok(covered);
  assert.equal(covered.audit_status, "covered");
  assert.deepEqual(covered.counts, { audit: 2, transaction: 2, authorization: 0 });
  assert.equal(covered.all.audit, true);
  assert.equal(covered.all.transaction, true);

  const partial = evaluateAssurancePathSet(
    pathSet([
      path("route-a", ["entrypoint", "audit", "transaction"]),
      path("route-b", ["entrypoint", "audit"]),
    ]),
    "rails",
  );
  assert.ok(partial);
  assert.equal(partial.audit_status, "partial");
  assert.equal(partial.mixed.transaction, true);
});

test("mixed audit evidence is partial and explicitly marked mixed", () => {
  const result = evaluateAssurancePathSet(
    pathSet([
      path("route-a", ["entrypoint", "audit", "transaction"]),
      path("route-b", ["entrypoint"]),
    ]),
    "rails",
  );
  assert.ok(result);
  assert.equal(result.audit_status, "partial");
  assert.equal(result.mixed.audit, true);
  assert.equal(result.all.audit, false);
});

test("confidence is the weakest confidence among reachable paths", () => {
  const allHigh = evaluateAssurancePathSet(
    pathSet([
      path("a", ["entrypoint"], "high"),
      path("b", ["entrypoint"], "high"),
    ]),
    "rails",
  );
  assert.ok(allHigh);
  assert.equal(allHigh.confidence, "high");

  const includesMedium = evaluateAssurancePathSet(
    pathSet([
      path("a", ["entrypoint"], "high"),
      path("b", ["entrypoint"], "medium"),
    ]),
    "rails",
  );
  assert.ok(includesMedium);
  assert.equal(includesMedium.confidence, "medium");

  const includesLow = evaluateAssurancePathSet(
    pathSet([
      path("a", ["entrypoint"], "high"),
      path("b", ["entrypoint"], "medium"),
      path("c", ["entrypoint"], "low"),
    ]),
    "rails",
  );
  assert.ok(includesLow);
  assert.equal(includesLow.confidence, "low");
});

test("unreachable low-confidence paths do not weaken resolved-path confidence", () => {
  const result = evaluateAssurancePathSet(
    pathSet([
      path("reachable", ["entrypoint", "audit", "transaction"], "high"),
      path("unresolved-fragment", ["mutation"], "low"),
    ]),
    "rails",
  );
  assert.ok(result);
  assert.equal(result.reachable_paths, 1);
  assert.equal(result.confidence, "high");
  assert.equal(result.audit_status, "covered");
});

test("Frappe remains partial when audit evidence exists because v0.1 does not prove transaction atomicity", () => {
  const audited = evaluateAssurancePathSet(
    pathSet([path("handler", ["entrypoint", "audit", "transaction"])]),
    "frappe",
  );
  assert.ok(audited);
  assert.equal(audited.audit_status, "partial");

  const unaudited = evaluateAssurancePathSet(
    pathSet([path("handler", ["entrypoint"])]),
    "frappe",
  );
  assert.ok(unaudited);
  assert.equal(unaudited.audit_status, "uncovered");
});

test("unknown frameworks preserve evidence counts without inventing a coverage classification", () => {
  const result = evaluateAssurancePathSet(
    pathSet([path("entry", ["entrypoint", "audit"])]),
    "custom",
  );
  assert.ok(result);
  assert.equal(result.audit_status, null);
  assert.equal(result.counts.audit, 1);
  assert.equal(result.reachable_paths, 1);
});
