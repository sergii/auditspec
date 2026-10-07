import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";
import test from "node:test";
import {
  computeAaeActionBinding,
} from "../src/mandate-binding-profiles.js";
import {
  evaluateEndToEndMandateChain,
  type EndToEndMandateChainInput,
} from "../src/end-to-end-mandate-chain.js";

const aaeKeys = generateKeyPairSync("ed25519");
const aaePrivate = aaeKeys.privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();
const aaePublic = aaeKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

const proofKeys = generateKeyPairSync("ed25519");
const proofPrivate = proofKeys.privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();
const proofPublic = proofKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signAae(
  authorizedAction: Record<string, unknown>,
  options: {
    constraints?: Record<string, unknown>;
    principal?: string;
    agent?: string;
    not_after?: string;
  } = {},
): string {
  const header = {
    alg: "EdDSA",
    cty: "aae+json",
    kid: "did:example:issuer#key-1",
  };

  const grant = {
    action_binding: computeAaeActionBinding(authorizedAction),
    type_fields: Object.keys(authorizedAction),
    disposition: "allow",
    constraints: [
      {
        type: "range",
        field: "amount",
        lo: 0,
        hi: 1000,
      },
      {
        type: "exact",
        field: "currency",
        value: "USD",
      },
    ],
  };

  const payload = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "AgentAuthorizationEnvelope"],
    id: "urn:uuid:aae-e2e-001",
    issuer: "did:example:issuer",
    validFrom: "2026-10-07T08:00:00Z",
    credentialSubject: {
      id: options.agent ?? "agent:7",
      aae: {
        mandate: {
          actions: ["invoice.pay"],
          principal_did: options.principal ?? "user:42",
          grants: [grant],
        },
        constraints: options.constraints ?? {},
        validity: {
          not_before: "2026-10-07T08:00:00Z",
          not_after: options.not_after ?? "2026-10-07T12:00:00Z",
          single_use: true,
        },
      },
    },
  };

  const encodedHeader = b64json(header);
  const encodedPayload = b64json(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signBytes(
    null,
    Buffer.from(signingInput, "ascii"),
    aaePrivate,
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

const sourceAction = {
  verb: "invoice.pay",
  amount: 500,
  currency: "USD",
};

function baseline(
  overrides: Partial<EndToEndMandateChainInput> = {},
): EndToEndMandateChainInput {
  const base: EndToEndMandateChainInput = {
    request: {
      signature_verified: true,
      application_profile_satisfied: true,
      covered_components: ["@method", "@target-uri", "content-digest"],
      signature_label: "sig1",
      verifier: "http-signature-verifier",
      observed_at: "2026-10-07T09:00:00Z",
      parameters: {
        keyid: "agent-request-key",
        alg: "ed25519",
        created: 1791363600,
      },
    },
    request_action_binding_verified: true,
    delegation: {
      claims: {
        iss: "https://authorization.example",
        sub: "user:42",
        aud: "https://billing.example",
        scope: "invoice:pay",
        act: {
          sub: "agent:7",
        },
      },
      verification: {
        verified: true,
        issuer: "https://authorization.example",
        verifier: "rfc8693-verifier",
        audience: "https://billing.example",
        observed_at: "2026-10-07T09:00:00Z",
      },
    },
    authorization: {
      compact_aae: signAae(sourceAction),
      issuer_public_key_pem: aaePublic,
      source_action: sourceAction,
      occurred_at: "2026-10-07T09:00:00Z",
      trust: {
        issuer_did_key_binding_verified: true,
        issuer_authorized_for_principal: true,
        subject_binding_verified: true,
        revocation_status: "not_revoked",
        single_use_verified: true,
        delegation_chain_verified: true,
        verifier: "aae-verifier",
      },
    },
    proof: {
      proof_id: "proof-e2e-001",
      issued_at: "2026-10-07T09:00:01Z",
      issuer: {
        id: "auditspec-proof-service",
        key_id: "proof-key-1",
      },
      private_key_pem: proofPrivate,
      public_key_pem: proofPublic,
    },
    execution: {
      application_execution_observed: true,
      database_commit_observed: true,
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

function assuranceStrength(
  result: ReturnType<typeof evaluateEndToEndMandateChain>,
  id: string,
): string | undefined {
  return result.assurance.assertions.find((assertion) => assertion.id === id)
    ?.effective_strength;
}

test("happy path composes request, delegation, human mandate, proof, and execution evidence", () => {
  const result = evaluateEndToEndMandateChain(baseline());

  assert.equal(result.status, "complete");
  assert.equal(result.chain_authorized, true);

  assert.deepEqual(result.cross_layer_checks, {
    request_verified: true,
    request_control_data_covered: true,
    request_content_digest_covered: true,
    request_action_binding_verified: true,
    delegation_verified: true,
    current_actor_matches_mandate_agent: true,
    represented_subject_matches_mandate_principal: true,
    mandate_projection_ready: true,
    mandate_authorized: true,
    proof_valid: true,
    proof_authorized: true,
  });

  assert.equal(result.mandate_evaluation?.decision, "within_mandate");
  assert.equal(result.proof?.verification.valid, true);
  assert.equal(result.proof?.verification.authorized, true);

  assert.equal(
    assuranceStrength(result, "request-authorized-as-mandated-action"),
    "attributed",
  );
  assert.equal(
    assuranceStrength(result, "application-execution"),
    "attributed",
  );
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});

test("mutation: changing the amount breaks the AAE exact action binding", () => {
  const attempted = {
    ...sourceAction,
    amount: 900,
  };
  const result = evaluateEndToEndMandateChain(
    baseline({
      authorization: {
        ...baseline().authorization,
        compact_aae: signAae(sourceAction),
        source_action: attempted,
      },
    }),
  );

  assert.equal(result.status, "source_denied");
  assert.equal(result.chain_authorized, false);
  assert.equal(result.authorization.status, "source_denied");
  assert.equal(result.mandate_evaluation, undefined);
  assert.equal(result.proof, undefined);
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});

test("mutation: RFC 8693 actor mismatch cannot be repaired by a valid mandate proof", () => {
  const input = baseline();
  input.delegation.claims = {
    ...input.delegation.claims,
    act: { sub: "agent:attacker" },
  };

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.authorization.status, "ready");
  assert.equal(result.mandate_evaluation?.decision, "within_mandate");
  assert.equal(result.proof?.verification.valid, true);
  assert.equal(result.proof?.verification.authorized, true);
  assert.equal(
    result.cross_layer_checks.current_actor_matches_mandate_agent,
    false,
  );
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "unverifiable");
  assert.equal(
    assuranceStrength(result, "request-authorized-as-mandated-action"),
    "unknown",
  );
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});

test("mutation: unverified RFC 8693 delegation leaves a signed mandate independently valid but the full chain unverifiable", () => {
  const input = baseline();
  input.delegation.verification = {
    ...input.delegation.verification,
    verified: false,
  };

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.cross_layer_checks.delegation_verified, false);
  assert.equal(result.mandate_evaluation?.authorized, true);
  assert.equal(result.proof?.verification.authorized, true);
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "unverifiable");
  assert.equal(assuranceStrength(result, "delegation"), "unknown");
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});

test("mutation: a required source constraint that AuditSpec cannot represent is not dropped", () => {
  const action = { ...sourceAction };
  const input = baseline();
  input.authorization = {
    ...input.authorization,
    compact_aae: signAae(action, {
      constraints: {
        rate_limit: {
          value: 1,
          window: "PT1H",
          required: true,
        },
      },
    }),
    source_action: action,
  };

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.authorization.status, "unverifiable");
  assert.ok(result.authorization.unmapped.includes("constraints.rate_limit"));
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "unverifiable");
  assert.equal(result.mandate_evaluation, undefined);
});

test("mutation: replay failure prevents a single-use authorization artifact from becoming a positive chain", () => {
  const input = baseline();
  input.authorization.trust = {
    ...input.authorization.trust,
    single_use_verified: false,
  };

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.authorization.source_checks.single_use_verified, false);
  assert.equal(result.authorization.status, "unverifiable");
  assert.equal(
    result.authorization.verification.mandate_signature_verified,
    false,
  );
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "unverifiable");
});

test("mutation: execution after mandate expiry yields a signed proof of outside_mandate, not permission", () => {
  const input = baseline();
  input.authorization = {
    ...input.authorization,
    occurred_at: "2026-10-07T12:00:01Z",
  };

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.authorization.status, "ready");
  assert.equal(result.mandate_evaluation?.decision, "outside_mandate");
  assert.equal(result.mandate_evaluation?.authorized, false);
  assert.equal(result.proof?.verification.valid, true);
  assert.equal(result.proof?.verification.authorized, false);
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "outside_mandate");
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});

test("mutation: signed request without exact request-to-action binding cannot authorize the end-to-end chain", () => {
  const input = baseline({
    request_action_binding_verified: false,
  });

  const result = evaluateEndToEndMandateChain(input);

  assert.equal(result.request.verification.status, "verified");
  assert.equal(result.mandate_evaluation?.authorized, true);
  assert.equal(result.proof?.verification.authorized, true);
  assert.equal(result.chain_authorized, false);
  assert.equal(result.status, "unverifiable");
  assert.equal(
    assuranceStrength(result, "request-action-binding"),
    "unknown",
  );
  assert.equal(
    assuranceStrength(result, "application-execution"),
    "unknown",
  );
  assert.equal(assuranceStrength(result, "database-commit"), "authoritative");
});
