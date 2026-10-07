import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  analyzeAgentChainFixture,
  type AgentChainFixture,
} from "../src/agent-chain-fixtures.js";

const base = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = resolve(base, "../../../mappings/agent-chain/fixtures");

function load(name: string): AgentChainFixture {
  return JSON.parse(
    readFileSync(resolve(fixtureRoot, name), "utf8"),
  ) as AgentChainFixture;
}

test("OAuth Identity Chaining fixture reports explicit information loss", () => {
  const report = analyzeAgentChainFixture(
    load("oauth-identity-chaining-v17.json"),
  );

  assert.deepEqual(report.summary, {
    source_facts: 6,
    preserved: 1,
    partial: 4,
    not_represented: 1,
    unknown: 0,
  });
  assert.deepEqual(report.invariant_violations, []);
});

test("Transaction Tokens fixture reports explicit information loss", () => {
  const report = analyzeAgentChainFixture(
    load("transaction-tokens-v11.json"),
  );

  assert.deepEqual(report.summary, {
    source_facts: 9,
    preserved: 1,
    partial: 7,
    not_represented: 1,
    unknown: 0,
  });
  assert.deepEqual(report.invariant_violations, []);
});

test("Transaction Tokens For Agents fixture proves monotonic attenuation", () => {
  const report = analyzeAgentChainFixture(
    load("transaction-tokens-for-agents-v02.json"),
  );

  assert.deepEqual(report.summary, {
    source_facts: 9,
    preserved: 3,
    partial: 5,
    not_represented: 1,
    unknown: 0,
  });
  assert.deepEqual(report.invariant_violations, []);
  assert.equal(report.assurance?.matches_expectation, true);

  assert.deepEqual(report.assurance?.actual_effective_strengths, {
    authorization: "self_reported",
    "database-commit": "authoritative",
    execution: "self_reported",
    "external-originator": "self_reported",
    "internal-agent": "self_reported",
  });
});

test("every source fact has one explicit mapping disposition", () => {
  for (const name of [
    "oauth-identity-chaining-v17.json",
    "transaction-tokens-v11.json",
    "transaction-tokens-for-agents-v02.json",
  ]) {
    const fixture = load(name);
    const report = analyzeAgentChainFixture(fixture);

    assert.equal(report.summary.source_facts, fixture.facts.length);
    assert.equal(
      report.summary.preserved +
        report.summary.partial +
        report.summary.not_represented +
        report.summary.unknown,
      fixture.facts.length,
    );
  }
});

test("partial, unknown, and not-represented facts require reasons", () => {
  const fixture = load("oauth-identity-chaining-v17.json");
  fixture.facts.push({
    id: "bad-partial",
    source_path: "example",
    meaning: "example",
    disposition: "partial",
    auditspec_targets: ["example"],
  });

  const report = analyzeAgentChainFixture(fixture);

  assert.ok(
    report.invariant_violations.some((violation) =>
      violation.includes("bad-partial: partial facts require an explicit reason"),
    ),
  );
});

test("preserved facts require explicit AuditSpec targets", () => {
  const fixture = load("transaction-tokens-v11.json");
  fixture.facts.push({
    id: "bad-preserved",
    source_path: "example",
    meaning: "example",
    disposition: "preserved",
  });

  const report = analyzeAgentChainFixture(fixture);

  assert.ok(
    report.invariant_violations.some((violation) =>
      violation.includes("bad-preserved: preserved facts require at least one explicit AuditSpec target"),
    ),
  );
});

test("not-represented facts cannot claim a fake AuditSpec target", () => {
  const fixture = load("transaction-tokens-v11.json");
  fixture.facts.push({
    id: "bad-loss",
    source_path: "example",
    meaning: "example",
    disposition: "not_represented",
    auditspec_targets: ["invented"],
    reason: "not implemented",
  });

  const report = analyzeAgentChainFixture(fixture);

  assert.ok(
    report.invariant_violations.some((violation) =>
      violation.includes("bad-loss: not_represented facts cannot claim AuditSpec targets"),
    ),
  );
});

test("fixture assurance mismatches become invariant violations", () => {
  const fixture = load("transaction-tokens-for-agents-v02.json");
  assert.ok(fixture.assurance_scenario);
  fixture.assurance_scenario.expected_effective_strengths.execution =
    "authoritative";

  const report = analyzeAgentChainFixture(fixture);

  assert.equal(report.assurance?.matches_expectation, false);
  assert.ok(
    report.invariant_violations.includes(
      "assurance_scenario: effective strengths do not match fixture expectations",
    ),
  );
});
