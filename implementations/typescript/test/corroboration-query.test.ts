import assert from "node:assert/strict";
import test from "node:test";
import { queryCorroboration } from "../src/corroboration-query.js";
import type { RuntimeCorroborationReport } from "../src/runtime-corroboration.js";
import { validateCorroborationQueryResult } from "../src/validate.js";

const report: RuntimeCorroborationReport = {
  report_version: "0.1",
  assessment_subject: {
    kind: "repository",
    path: "/workspace/example-app",
    revision: "git:head",
  },
  generated_at: "2026-08-25T00:30:00Z",
  observation_scope: {
    scope_version: "0.1",
    basis: "declared",
    environment: "staging",
    window: { start: "2026-08-24T23:30:00Z", end: "2026-08-25T00:30:00Z" },
    collection_policy: { id: "runtime-hourly-v1", mode: "continuous" },
    producers: [
      { name: "policy-enforcer", type: "application", version: "1.2.3" },
      { name: "otel-collector", type: "collector" },
    ],
  },
  matches: [
    {
      evidence_id: "authz-1",
      evidence_kind: "authorization_decision",
      producer: { name: "policy-enforcer", type: "application", version: "1.2.3" },
      observed_at: "2026-08-25T00:29:00Z",
      finding_fingerprint: "ffp-authz-1",
      relation: "contradicts",
      trust: "authoritative",
      coverage: "exhaustive",
      rationale: "Authoritative policy evidence contradicts the targeted finding.",
    },
    {
      evidence_id: "otel-1",
      evidence_kind: "trace_span",
      producer: { name: "otel-collector", type: "collector" },
      observed_at: "2026-08-25T00:29:10Z",
      boundary_fingerprint: "bfp-refund-1",
      relation: "supports",
      trust: "attributed",
      coverage: "point",
      rationale: "The trace corroborates one execution of the targeted boundary.",
    },
  ],
  unmatched_evidence_ids: [],
  summary: {
    evidence_records: 2,
    matched: 2,
    supports: 1,
    contradicts: 1,
    inconclusive: 0,
    unmatched: 0,
  },
  limitations: ["Synthetic query fixture."],
};

test("queries authoritative exhaustive contradictions by evidence and producer identity", () => {
  const result = queryCorroboration(report, {
    relation: "contradicts",
    trust: "authoritative",
    coverage: "exhaustive",
    evidence_kind: "authorization_decision",
    producer_name: "policy-enforcer",
    producer_type: "application",
    finding_fingerprint: "ffp-authz-1",
  });

  assert.equal(validateCorroborationQueryResult(result).valid, true);
  assert.equal(result.count, 1);
  assert.equal(result.matches[0]?.evidence_id, "authz-1");
  assert.equal(result.matches[0]?.producer.name, "policy-enforcer");
  assert.equal(result.source_observation_scope.basis, "declared");
});

test("returns a schema-valid empty result when filters match nothing", () => {
  const result = queryCorroboration(report, { boundary_fingerprint: "missing" });
  assert.equal(validateCorroborationQueryResult(result).valid, true);
  assert.equal(result.count, 0);
  assert.deepEqual(result.matches, []);
});
