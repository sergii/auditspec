import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateAssuranceAttenuation,
  type AssuranceAssertion,
} from "../src/assurance-attenuation.js";

function byId(
  assertions: AssuranceAssertion[],
): Map<string, ReturnType<typeof evaluateAssuranceAttenuation>["assertions"][number]> {
  return new Map(
    evaluateAssuranceAttenuation(assertions).assertions.map((assertion) => [
      assertion.id,
      assertion,
    ]),
  );
}

test("direct authoritative evidence remains authoritative", () => {
  const result = byId([
    {
      id: "db_commit",
      kind: "persistence",
      intrinsic_strength: "authoritative",
    },
  ]);

  assert.equal(result.get("db_commit")?.effective_strength, "authoritative");
  assert.equal(result.get("db_commit")?.weakened, false);
});

test("authoritative downstream evidence cannot upgrade self-reported actor identity", () => {
  const result = byId([
    {
      id: "external_actor",
      kind: "actor_identity",
      intrinsic_strength: "self_reported",
    },
    {
      id: "internal_request",
      kind: "request_authenticity",
      intrinsic_strength: "authoritative",
      depends_on: ["external_actor"],
    },
  ]);

  assert.equal(result.get("external_actor")?.effective_strength, "self_reported");
  assert.equal(result.get("internal_request")?.effective_strength, "self_reported");
  assert.equal(result.get("internal_request")?.weakened, true);
  assert.deepEqual(
    result.get("internal_request")?.limiting_dependencies,
    ["external_actor"],
  );
});

test("strong evidence remains strong for facts that do not depend on weak identity", () => {
  const result = byId([
    {
      id: "external_actor",
      kind: "actor_identity",
      intrinsic_strength: "self_reported",
    },
    {
      id: "db_commit",
      kind: "persistence",
      intrinsic_strength: "authoritative",
    },
  ]);

  assert.equal(result.get("external_actor")?.effective_strength, "self_reported");
  assert.equal(result.get("db_commit")?.effective_strength, "authoritative");
});

test("multi-hop chains cannot launder weak upstream identity", () => {
  const result = byId([
    {
      id: "external_actor",
      kind: "actor_identity",
      intrinsic_strength: "self_reported",
    },
    {
      id: "internal_agent",
      kind: "delegation",
      intrinsic_strength: "authoritative",
      depends_on: ["external_actor"],
    },
    {
      id: "policy_decision",
      kind: "authorization",
      intrinsic_strength: "authoritative",
      depends_on: ["internal_agent"],
    },
    {
      id: "business_execution",
      kind: "execution",
      intrinsic_strength: "authoritative",
      depends_on: ["policy_decision"],
    },
  ]);

  for (const id of [
    "internal_agent",
    "policy_decision",
    "business_execution",
  ]) {
    assert.equal(result.get(id)?.effective_strength, "self_reported");
  }
});

test("the weakest dependency limits a combined assertion", () => {
  const result = byId([
    {
      id: "actor",
      kind: "actor_identity",
      intrinsic_strength: "attributed",
    },
    {
      id: "request",
      kind: "request_authenticity",
      intrinsic_strength: "authoritative",
    },
    {
      id: "authorization",
      kind: "authorization",
      intrinsic_strength: "authoritative",
      depends_on: ["actor", "request"],
    },
  ]);

  assert.equal(result.get("authorization")?.effective_strength, "attributed");
  assert.deepEqual(result.get("authorization")?.limiting_dependencies, ["actor"]);
});

test("adding a weaker dependency cannot improve assurance", () => {
  const strongOnly = byId([
    {
      id: "request",
      kind: "request_authenticity",
      intrinsic_strength: "authoritative",
    },
    {
      id: "decision",
      kind: "authorization",
      intrinsic_strength: "authoritative",
      depends_on: ["request"],
    },
  ]);

  const withWeakIdentity = byId([
    {
      id: "request",
      kind: "request_authenticity",
      intrinsic_strength: "authoritative",
    },
    {
      id: "actor",
      kind: "actor_identity",
      intrinsic_strength: "self_reported",
    },
    {
      id: "decision",
      kind: "authorization",
      intrinsic_strength: "authoritative",
      depends_on: ["request", "actor"],
    },
  ]);

  assert.equal(strongOnly.get("decision")?.effective_strength, "authoritative");
  assert.equal(withWeakIdentity.get("decision")?.effective_strength, "self_reported");
});

test("missing dependencies fail closed to unknown", () => {
  const result = byId([
    {
      id: "decision",
      kind: "authorization",
      intrinsic_strength: "authoritative",
      depends_on: ["missing_actor"],
    },
  ]);

  assert.equal(result.get("decision")?.effective_strength, "unknown");
  assert.ok(
    result
      .get("decision")
      ?.issues.some((issue) => issue.code === "missing_dependency"),
  );
});

test("dependency cycles fail closed to unknown", () => {
  const result = byId([
    {
      id: "agent_a",
      kind: "delegation",
      intrinsic_strength: "authoritative",
      depends_on: ["agent_b"],
    },
    {
      id: "agent_b",
      kind: "delegation",
      intrinsic_strength: "authoritative",
      depends_on: ["agent_a"],
    },
  ]);

  assert.equal(result.get("agent_a")?.effective_strength, "unknown");
  assert.equal(result.get("agent_b")?.effective_strength, "unknown");
  assert.ok(
    [...result.values()].some((assertion) =>
      assertion.issues.some((issue) => issue.code === "dependency_cycle"),
    ),
  );
});

test("input order cannot change effective assurance", () => {
  const assertions: AssuranceAssertion[] = [
    {
      id: "actor",
      kind: "actor_identity",
      intrinsic_strength: "attributed",
    },
    {
      id: "request",
      kind: "request_authenticity",
      intrinsic_strength: "authoritative",
    },
    {
      id: "execution",
      kind: "execution",
      intrinsic_strength: "authoritative",
      depends_on: ["request", "actor"],
    },
  ];

  const first = evaluateAssuranceAttenuation(assertions);
  const second = evaluateAssuranceAttenuation([...assertions].reverse());

  assert.deepEqual(first, second);
});

test("duplicate assertion ids are rejected", () => {
  assert.throws(
    () =>
      evaluateAssuranceAttenuation([
        {
          id: "same",
          kind: "actor_identity",
          intrinsic_strength: "attributed",
        },
        {
          id: "same",
          kind: "execution",
          intrinsic_strength: "authoritative",
        },
      ]),
    /Duplicate assurance assertion id/,
  );
});

test("summary reports weakened and unknown assertions", () => {
  const result = evaluateAssuranceAttenuation([
    {
      id: "actor",
      kind: "actor_identity",
      intrinsic_strength: "self_reported",
    },
    {
      id: "execution",
      kind: "execution",
      intrinsic_strength: "authoritative",
      depends_on: ["actor"],
    },
    {
      id: "unknown",
      kind: "custom",
      intrinsic_strength: "authoritative",
      depends_on: ["missing"],
    },
  ]);

  assert.deepEqual(result.summary, {
    total: 3,
    weakened: 2,
    unknown: 1,
  });
});
