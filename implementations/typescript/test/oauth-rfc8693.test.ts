import assert from "node:assert/strict";
import test from "node:test";
import { mapRfc8693Claims } from "../src/oauth-rfc8693.js";

const verified = {
  verified: true,
  issuer: "https://issuer.example",
  verifier: "test-suite",
} as const;

test("maps current actor separately from represented subject", () => {
  const projection = mapRfc8693Claims({
    claims: {
      iss: "https://issuer.example",
      sub: "user:42",
      act: { sub: "agent:7" },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor?.subject, "agent:7");
  assert.equal(projection.represented_subject?.subject, "user:42");
  assert.deepEqual(
    projection.delegation.map((step) => [step.relationship, step.principal.subject]),
    [["on_behalf_of", "user:42"]],
  );
});

test("preserves nested actor history in nearest-first AuditSpec delegation order", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      act: {
        sub: "service:16",
        act: {
          sub: "service:77",
          act: { sub: "agent:origin" },
        },
      },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor?.subject, "service:16");
  assert.deepEqual(
    projection.prior_actors.map((actor) => actor.subject),
    ["service:77", "agent:origin"],
  );
  assert.deepEqual(
    projection.delegation.map((step) => [step.relationship, step.principal.subject]),
    [
      ["delegated_by", "service:77"],
      ["delegated_by", "agent:origin"],
      ["on_behalf_of", "user:42"],
    ],
  );
});

test("does not turn may_act into an observed actor or delegation step", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      may_act: { sub: "agent:eligible" },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor, undefined);
  assert.equal(projection.authorization_context.authorized_actor?.subject, "agent:eligible");
  assert.deepEqual(projection.delegation, []);
});

test("maps scope only as authorization context and makes no allow decision", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      scope: "invoice:read invoice:approve invoice:read",
    },
    verification: verified,
  });

  assert.deepEqual(projection.authorization_context.scopes, [
    "invoice:read",
    "invoice:approve",
  ]);
  assert.equal("decision" in projection.authorization_context, false);
});

test("maps audience as an authority boundary and does not invent AuditSpec targets", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      aud: ["https://api-a.example", "https://api-b.example"],
    },
    verification: verified,
  });

  assert.deepEqual(projection.authorization_context.audiences, [
    "https://api-a.example",
    "https://api-b.example",
  ]);
  assert.equal("targets" in projection, false);
});

test("keeps client_id as token context and never infers it as actor", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      client_id: "oauth-client-123",
    },
    verification: verified,
  });

  assert.equal(projection.token_context.client_id, "oauth-client-123");
  assert.equal(projection.current_actor, undefined);
});

test("marks unverified claims without upgrading them to trusted evidence", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      act: { sub: "agent:7" },
    },
    verification: { verified: false },
  });

  assert.equal(projection.verification.status, "unverified");
  assert.ok(projection.warnings.some((warning) => warning.code === "unverified_claims"));
  assert.equal("trust" in projection.verification, false);
});

test("preserves only names of unknown claims to avoid silently dropping semantics or copying payload values", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      email: "sensitive@example.com",
      custom_context: { secret: "do-not-copy" },
    },
    verification: verified,
  });

  assert.deepEqual(projection.unmapped_claims, ["custom_context", "email"]);
  assert.equal(JSON.stringify(projection).includes("sensitive@example.com"), false);
  assert.equal(JSON.stringify(projection).includes("do-not-copy"), false);
});

test("does not guess actor identity when act has no usable sub", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      act: { iss: "https://actor-idp.example", email: "agent@example.com" },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor, undefined);
  assert.deepEqual(projection.delegation, []);
  assert.ok(
    projection.warnings.some((warning) => warning.code === "unsupported_actor_identity"),
  );
  assert.deepEqual(projection.unmapped_actor_claims, ["act.email"]);
});

test("flags non-identity claims nested inside act instead of treating them as actor validity", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      act: {
        sub: "agent:7",
        exp: 9999999999,
        aud: "https://api.example",
      },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor?.subject, "agent:7");
  assert.deepEqual(
    projection.warnings
      .filter((warning) => warning.code === "non_identity_claim_in_act")
      .map((warning) => warning.path)
      .sort(),
    ["act.aud", "act.exp"],
  );
});

test("keeps issuer mismatch explicit rather than silently accepting conflicting provenance", () => {
  const projection = mapRfc8693Claims({
    claims: {
      iss: "https://different-issuer.example",
      sub: "user:42",
    },
    verification: verified,
  });

  assert.ok(projection.warnings.some((warning) => warning.code === "issuer_mismatch"));
});


test("does not promote a prior actor when the current act identity is unresolved", () => {
  const projection = mapRfc8693Claims({
    claims: {
      sub: "user:42",
      act: {
        iss: "https://actor-idp.example",
        act: { sub: "service:prior" },
      },
    },
    verification: verified,
  });

  assert.equal(projection.current_actor, undefined);
  assert.deepEqual(projection.prior_actors.map((actor) => actor.subject), ["service:prior"]);
  assert.deepEqual(projection.delegation, []);
});
