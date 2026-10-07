import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateHumanMandate,
  type HumanMandate,
  type MandatedAction,
} from "../src/human-mandate.js";

const mandate: HumanMandate = {
  mandate_version: "0.1",
  id: "mandate-1",
  principal: { id: "user:42" },
  agent: { id: "agent:7" },
  issued_at: "2026-10-07T08:00:00Z",
  valid_from: "2026-10-07T08:00:00Z",
  expires_at: "2026-10-07T12:00:00Z",
  constraints: [
    {
      id: "operation",
      class: "hard",
      path: "operation",
      operator: "equals",
      value: "invoice.pay",
    },
    {
      id: "counterparty",
      class: "hard",
      path: "parameters.counterparty",
      operator: "one_of",
      values: ["vendor:a", "vendor:b"],
    },
    {
      id: "absolute-value-ceiling",
      class: "hard",
      path: "parameters.amount",
      operator: "number_lte",
      value: 5000,
    },
    {
      id: "fresh-human-review-threshold",
      class: "escalating",
      path: "parameters.amount",
      operator: "number_lte",
      value: 1000,
    },
  ],
};

const verified = {
  mandate_signature_verified: true,
  action_binding_verified: true,
  verifier: "mandate-verifier",
  mandate_digest: "sha256:mandate",
  action_digest: "sha256:action",
} as const;

function action(overrides: Partial<MandatedAction> = {}): MandatedAction {
  return {
    actor: { id: "agent:7" },
    operation: "invoice.pay",
    parameters: {
      counterparty: "vendor:a",
      amount: 500,
    },
    occurred_at: "2026-10-07T09:00:00Z",
    ...overrides,
  };
}

test("allows only a positively verified action within all mandate constraints", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: verified,
  });

  assert.equal(result.decision, "within_mandate");
  assert.equal(result.authorized, true);
  assert.ok(result.constraint_results.every((item) => item.status === "satisfied"));
});

test("hard constraint violation fails closed outside the mandate", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({
      parameters: { counterparty: "vendor:blocked", amount: 500 },
    }),
    verification: verified,
  });

  assert.equal(result.decision, "outside_mandate");
  assert.equal(result.authorized, false);
  assert.ok(
    result.constraint_results.some(
      (item) => item.id === "counterparty" && item.status === "violated",
    ),
  );
});

test("escalating constraint violation requires fresh human authorization", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({
      parameters: { counterparty: "vendor:a", amount: 1500 },
    }),
    verification: verified,
  });

  assert.equal(result.decision, "requires_fresh_authorization");
  assert.equal(result.authorized, false);
});

test("hard violation takes precedence over escalation", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({
      parameters: { counterparty: "vendor:a", amount: 7000 },
    }),
    verification: verified,
  });

  assert.equal(result.decision, "outside_mandate");
  assert.equal(result.authorized, false);
});

test("a different executing agent is outside a mandate bound to a named agent", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({ actor: { id: "agent:other" } }),
    verification: verified,
  });

  assert.equal(result.decision, "outside_mandate");
  assert.equal(result.authorized, false);
  assert.ok(
    result.constraint_results.some(
      (item) => item.id === "mandate.agent" && item.status === "violated",
    ),
  );
});

test("missing action parameter is unverifiable and never permission", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({
      parameters: { counterparty: "vendor:a" },
    }),
    verification: verified,
  });

  assert.equal(result.decision, "unverifiable");
  assert.equal(result.authorized, false);
  assert.ok(
    result.constraint_results.some(
      (item) => item.id === "absolute-value-ceiling" && item.status === "unverifiable",
    ),
  );
});

test("unverified mandate signature is never permission even when constraints pass", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: {
      ...verified,
      mandate_signature_verified: false,
    },
  });

  assert.equal(result.decision, "unverifiable");
  assert.equal(result.authorized, false);
});

test("unverified action-to-mandate binding is never permission", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: {
      ...verified,
      action_binding_verified: false,
    },
  });

  assert.equal(result.decision, "unverifiable");
  assert.equal(result.authorized, false);
});

test("action before mandate validity is outside the mandate", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({ occurred_at: "2026-10-07T07:59:59Z" }),
    verification: verified,
  });

  assert.equal(result.decision, "outside_mandate");
  assert.equal(result.authorized, false);
});

test("action after mandate expiry is outside the mandate", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action({ occurred_at: "2026-10-07T12:00:01Z" }),
    verification: verified,
  });

  assert.equal(result.decision, "outside_mandate");
  assert.equal(result.authorized, false);
});

test("malformed timestamps fail closed to unverifiable", () => {
  const result = evaluateHumanMandate({
    mandate: {
      ...mandate,
      expires_at: "not-a-time",
    },
    action: action(),
    verification: verified,
  });

  assert.equal(result.decision, "unverifiable");
  assert.equal(result.authorized, false);
});

test("same mandate and action produce the same semantic verdict", () => {
  const first = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: verified,
  });
  const second = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: verified,
  });

  assert.deepEqual(first, second);
});

test("raw signatures and tokens are outside the evaluator input and output", () => {
  const result = evaluateHumanMandate({
    mandate,
    action: action(),
    verification: verified,
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("signature_bytes"), false);
  assert.equal(serialized.includes("access_token"), false);
  assert.equal(serialized.includes("session_token"), false);
});
