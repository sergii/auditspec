import assert from "node:assert/strict";
import test from "node:test";
import {
  diffCorroborationReports,
  type RuntimeCorroborationDiff,
} from "../src/corroboration-diff.js";
import type { RuntimeObservationScope } from "../src/observation-scope.js";
import type { RuntimeCorroborationReport } from "../src/runtime-corroboration.js";
import { validateCorroborationDiff } from "../src/validate.js";

function report(
  revision: string,
  matches: RuntimeCorroborationReport["matches"],
  generatedAt: string,
  observationScope: RuntimeObservationScope = { scope_version: "0.1", basis: "unknown" },
): RuntimeCorroborationReport {
  return {
    report_version: "0.1",
    assessment_subject: {
      kind: "repository",
      path: "/workspace/example-app",
      revision,
    },
    generated_at: generatedAt,
    observation_scope: observationScope,
    matches,
    unmatched_evidence_ids: [],
    summary: {
      evidence_records: matches.length,
      matched: matches.length,
      supports: matches.filter((match) => match.relation === "supports").length,
      contradicts: matches.filter((match) => match.relation === "contradicts").length,
      inconclusive: matches.filter((match) => match.relation === "inconclusive").length,
      unmatched: 0,
    },
    limitations: ["Synthetic test report."],
  };
}

const base = report(
  "git:base",
  [
    {
      evidence_id: "evidence-base-a",
      evidence_kind: "trace_span",
      producer: { name: "collector-base", type: "collector" },
      observed_at: "2026-08-24T22:39:00Z",
      boundary_fingerprint: "bfp-a",
      relation: "contradicts",
      trust: "attributed",
      coverage: "window",
      rationale: "Base contradiction A.",
    },
  ],
  "2026-08-24T22:40:00Z",
);

const head = report(
  "git:head",
  [
    {
      evidence_id: "evidence-head-a",
      evidence_kind: "database_observation",
      producer: { name: "database-head", type: "database" },
      observed_at: "2026-08-24T22:43:00Z",
      boundary_fingerprint: "bfp-a",
      relation: "contradicts",
      trust: "authoritative",
      coverage: "point",
      rationale: "Head contradiction A from different evidence.",
    },
    {
      evidence_id: "evidence-head-b",
      evidence_kind: "authorization_decision",
      producer: { name: "authz-head", type: "application" },
      observed_at: "2026-08-24T22:43:30Z",
      finding_fingerprint: "ffp-b",
      relation: "contradicts",
      trust: "authoritative",
      coverage: "point",
      rationale: "New finding contradiction B.",
    },
  ],
  "2026-08-24T22:44:00Z",
);

test("diffs contradictions by target identity rather than evidence id", () => {
  const diff = diffCorroborationReports(base, head, "2026-08-24T22:45:00Z");
  assert.equal(validateCorroborationDiff(diff).valid, true);
  assert.equal(diff.comparability.status, "unknown");
  assert.equal(diff.summary.base_contradicted_targets, 1);
  assert.equal(diff.summary.head_contradicted_targets, 2);
  assert.equal(diff.summary.newly_reported, 1);
  assert.equal(diff.summary.persisting, 1);
  assert.equal(diff.summary.no_longer_reported, 0);
  assert.equal(diff.persisting_contradictions[0]?.target.fingerprint, "bfp-a");
  assert.deepEqual(diff.persisting_contradictions[0]?.evidence_ids, ["evidence-head-a"]);
  assert.equal(diff.newly_reported_contradictions[0]?.target.fingerprint, "ffp-b");
});

test("reports comparable scopes when collection protocol and duration match", () => {
  const baseScope: RuntimeObservationScope = {
    scope_version: "0.1",
    basis: "declared",
    environment: "staging",
    window: { start: "2026-08-24T20:00:00Z", end: "2026-08-24T21:00:00Z" },
    collection_policy: { id: "hourly-v1", version: "1", mode: "continuous" },
    producers: [{ name: "runtime-observer", type: "collector", version: "1" }],
  };
  const headScope: RuntimeObservationScope = {
    ...baseScope,
    window: { start: "2026-08-24T21:00:00Z", end: "2026-08-24T22:00:00Z" },
  };
  const diff = diffCorroborationReports(
    report("git:base", base.matches, base.generated_at, baseScope),
    report("git:head", head.matches, head.generated_at, headScope),
  );
  assert.equal(diff.comparability.status, "comparable");
});

test("no-longer-reported is not represented as resolved", () => {
  const emptyHead = report("git:head-empty", [], "2026-08-24T22:44:00Z");
  const diff = diffCorroation(base, emptyHead);
  assert.equal(diff.summary.no_longer_reported, 1);
  assert.equal(diff.no_longer_reported_contradictions[0]?.target.fingerprint, "bfp-a");
  assert.ok(diff.limitations.some((item) => item.includes("not automatically resolved")));
});

function diffCorroation(
  left: RuntimeCorroborationReport,
  right: RuntimeCorroborationReport,
): RuntimeCorroborationDiff {
  return diffCorroborationReports(left, right, "2026-08-24T22:45:00Z");
}

test("rejects reports for different assessment subjects", () => {
  const other = {
    ...head,
    assessment_subject: {
      ...head.assessment_subject,
      path: "/workspace/other-app",
    },
  };
  assert.throws(
    () => diffCorroborationReports(base, other),
    /same assessment subject kind and path/,
  );
});
