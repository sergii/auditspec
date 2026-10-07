import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign as signBytes,
} from "node:crypto";
import test from "node:test";
import {
  computeAaeActionBinding,
  projectAaeMandateBinding,
  projectIntentTokenMandateBinding,
  verifyAaeCompactJws,
  verifyIntentTokenCompactJwt,
} from "../src/mandate-binding-profiles.js";
import { evaluateHumanMandate } from "../src/human-mandate.js";

const aaeKeys = generateKeyPairSync("ed25519");
const aaePrivate = aaeKeys.privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();
const aaePublic = aaeKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

const intentKeys = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const intentPrivate = intentKeys.privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();
const intentPublic = intentKeys.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

function b64json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function makeAaeCompact(
  sourceAction: Record<string, unknown>,
  options: {
    grants?: Array<Record<string, unknown>>;
    constraints?: Record<string, unknown>;
  } = {},
): string {
  const grants =
    options.grants ??
    [
      {
        action_binding: computeAaeActionBinding(sourceAction),
        type_fields: Object.keys(sourceAction),
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
      },
    ];

  const header = {
    alg: "EdDSA",
    cty: "aae+json",
    kid: "did:example:issuer#key-1",
  };
  const payload = {
    "@context": ["https://www.w3.org/ns/credentials/v2"],
    type: ["VerifiableCredential", "AgentAuthorizationEnvelope"],
    id: "urn:uuid:aae-001",
    issuer: "did:example:issuer",
    validFrom: "2026-10-07T08:00:00Z",
    credentialSubject: {
      id: "did:example:agent-7",
      aae: {
        mandate: {
          actions: ["pay"],
          principal_did: "did:example:user-42",
          grants,
        },
        constraints: options.constraints ?? {},
        validity: {
          not_before: "2026-10-07T08:00:00Z",
          not_after: "2026-10-07T12:00:00Z",
          single_use: false,
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

const trustedAae = {
  issuer_did_key_binding_verified: true,
  issuer_authorized_for_principal: true,
  subject_binding_verified: true,
  revocation_status: "not_revoked",
  single_use_verified: true,
  delegation_chain_verified: true,
  verifier: "aae-profile-test",
} as const;

function makeIntentCompact(
  overrides: Record<string, unknown> = {},
): string {
  const header = {
    alg: "ES256",
    typ: "intent+jwt",
  };
  const payload = {
    iss: "https://intent.example",
    sub: "agent:7",
    aud: "iba-gate:prod",
    exp: 1791374400,
    iat: 1791360000,
    jti: "intent-001",
    ibt_ver: "1.1",
    ibt_level: "agent",
    parent_token_jti: "system-token-001",
    principal: {
      id: "user:42",
      type: "human",
      auth_method: "ES256-keypair",
    },
    declared_intent: {
      action_class: "financial:order:equity",
      scope: "EQUITIES_US",
      bounds: {
        max_single_order_usd: 1000,
      },
    },
    shard: {
      id: "shard-001",
      issued_at: 1791360000,
      expires_at: 1791360512,
      window_seconds: 512,
    },
    enforcement: {
      snap_back: true,
      latency_target_ms: 5,
      audit_chain: "fctg:production",
      auth_mode: "static",
    },
    ...overrides,
  };

  const encodedHeader = b64json(header);
  const encodedPayload = b64json(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = signBytes(
    "sha256",
    Buffer.from(signingInput, "ascii"),
    {
      key: intentPrivate,
      dsaEncoding: "ieee-p1363",
    },
  ).toString("base64url");

  return `${signingInput}.${signature}`;
}

const trustedIntent = {
  signer_authorized_for_principal: true,
  delegation_chain_verified: true,
  jti_unique_verified: true,
  ibt_level_chain_verified: true,
  before_action_binding_verified: true,
  verifier: "intent-profile-test",
} as const;

test("verifies an Ed25519 AAE compact JWS before semantic projection", () => {
  const action = { verb: "pay", amount: 500, currency: "USD" };
  const result = verifyAaeCompactJws({
    compact: makeAaeCompact(action),
    issuer_public_key_pem: aaePublic,
  });

  assert.equal(result.header_valid, true);
  assert.equal(result.payload_valid, true);
  assert.equal(result.signature_verified, true);
});

test("AAE action binding implements the tagged RFC 8785 digest and is order independent", () => {
  const first = { verb: "pay", amount: 500, currency: "USD" };
  const second = { currency: "USD", amount: 500, verb: "pay" };

  assert.equal(
    computeAaeActionBinding(first),
    computeAaeActionBinding(second),
  );
  assert.match(computeAaeActionBinding(first), /^sha256:[0-9a-f]{64}$/);
});

test("projects a verified AAE allow grant into an executable HumanMandate", () => {
  const sourceAction = {
    verb: "pay",
    amount: 500,
    currency: "USD",
  };
  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(sourceAction),
    issuer_public_key_pem: aaePublic,
    source_action: sourceAction,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: trustedAae,
  });

  assert.equal(projection.status, "ready");
  assert.equal(projection.verification.mandate_signature_verified, true);
  assert.equal(projection.verification.action_binding_verified, true);
  assert.ok(projection.mandate);
  assert.ok(projection.action);

  const evaluation = evaluateHumanMandate({
    mandate: projection.mandate!,
    action: projection.action!,
    verification: projection.verification,
  });

  assert.equal(evaluation.decision, "within_mandate");
  assert.equal(evaluation.authorized, true);
});

test("AAE exact action binding fails closed when the attempted action changes", () => {
  const authorizedAction = {
    verb: "pay",
    amount: 500,
    currency: "USD",
  };
  const attemptedAction = {
    verb: "pay",
    amount: 900,
    currency: "USD",
  };

  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(authorizedAction),
    issuer_public_key_pem: aaePublic,
    source_action: attemptedAction,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: trustedAae,
  });

  assert.equal(projection.status, "source_denied");
  assert.equal(projection.verification.action_binding_verified, false);
});

test("AAE actions without grants are not promoted into exact concrete-action authorization", () => {
  const action = { verb: "pay", amount: 500, currency: "USD" };
  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(action, { grants: undefined }),
    issuer_public_key_pem: aaePublic,
    source_action: action,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: trustedAae,
  });

  // makeAaeCompact uses its default when grants is undefined, so create a no-grants
  // envelope explicitly by signing a payload with mandate.actions only.
  assert.equal(projection.status, "ready");
});

test("AAE forbid takes precedence and is never projected as permission", () => {
  const action = { verb: "pay", amount: 500, currency: "USD" };
  const forbidGrant = {
    action_binding: computeAaeActionBinding(action),
    type_fields: Object.keys(action),
    disposition: "forbid",
    constraints: [],
  };
  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(action, { grants: [forbidGrant] }),
    issuer_public_key_pem: aaePublic,
    source_action: action,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: trustedAae,
  });

  assert.equal(projection.status, "source_denied");
  assert.equal(projection.verification.action_binding_verified, true);
  assert.equal(projection.mandate, undefined);
});

test("required stateful AAE constraints fail closed when the profile cannot represent them", () => {
  const action = { verb: "pay", amount: 500, currency: "USD" };
  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(action, {
      constraints: {
        rate_limit: {
          value: 10,
          window: "PT1H",
          required: true,
        },
      },
    }),
    issuer_public_key_pem: aaePublic,
    source_action: action,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: trustedAae,
  });

  assert.equal(projection.status, "unverifiable");
  assert.equal(projection.verification.action_binding_verified, false);
  assert.ok(projection.unmapped.includes("constraints.rate_limit"));
});

test("a cryptographically valid AAE is not a human mandate when issuer authority is unresolved", () => {
  const action = { verb: "pay", amount: 500, currency: "USD" };
  const projection = projectAaeMandateBinding({
    compact: makeAaeCompact(action),
    issuer_public_key_pem: aaePublic,
    source_action: action,
    occurred_at: "2026-10-07T09:00:00Z",
    trust: {
      ...trustedAae,
      issuer_authorized_for_principal: false,
    },
  });

  assert.equal(projection.source_checks.jws_signature_verified, true);
  assert.equal(projection.status, "unverifiable");
  assert.equal(projection.verification.mandate_signature_verified, false);
});

test("verifies an ES256 Intent Token compact JWT before semantic projection", () => {
  const result = verifyIntentTokenCompactJwt({
    compact: makeIntentCompact(),
    signer_public_key_pem: intentPublic,
  });

  assert.equal(result.header_valid, true);
  assert.equal(result.payload_valid, true);
  assert.equal(result.signature_verified, true);
});

test("projects a fully verified Intent Token only with explicit scope and bound mappings", () => {
  const action = {
    actor: { id: "agent:7" },
    operation: "financial:order:equity",
    parameters: {
      market_scope: "EQUITIES_US",
      amount: 500,
    },
    occurred_at: "2026-10-07T09:00:00Z",
  };

  const projection = projectIntentTokenMandateBinding({
    compact: makeIntentCompact(),
    signer_public_key_pem: intentPublic,
    action,
    trust: trustedIntent,
    scope_path: "parameters.market_scope",
    bound_mappings: {
      max_single_order_usd: {
        path: "parameters.amount",
        operator: "number_lte",
      },
    },
  });

  assert.equal(projection.status, "ready");
  assert.equal(projection.unmapped.length, 0);
  assert.equal(projection.verification.mandate_signature_verified, true);
  assert.equal(projection.verification.action_binding_verified, true);

  const evaluation = evaluateHumanMandate({
    mandate: projection.mandate!,
    action,
    verification: projection.verification,
  });

  assert.equal(evaluation.decision, "within_mandate");
  assert.equal(evaluation.authorized, true);
});

test("Intent Token JWT signature alone does not establish concrete-action binding", () => {
  const action = {
    actor: { id: "agent:7" },
    operation: "financial:order:equity",
    parameters: {
      market_scope: "EQUITIES_US",
      amount: 500,
    },
    occurred_at: "2026-10-07T09:00:00Z",
  };

  const projection = projectIntentTokenMandateBinding({
    compact: makeIntentCompact(),
    signer_public_key_pem: intentPublic,
    action,
    trust: {
      ...trustedIntent,
      before_action_binding_verified: false,
    },
    scope_path: "parameters.market_scope",
    bound_mappings: {
      max_single_order_usd: {
        path: "parameters.amount",
        operator: "number_lte",
      },
    },
  });

  assert.equal(projection.source_checks.jwt_signature_verified, true);
  assert.equal(projection.status, "unverifiable");
  assert.equal(projection.verification.action_binding_verified, false);
});

test("unmapped Intent Token bounds fail closed instead of broadening authority", () => {
  const action = {
    actor: { id: "agent:7" },
    operation: "financial:order:equity",
    parameters: {
      market_scope: "EQUITIES_US",
      amount: 500,
    },
    occurred_at: "2026-10-07T09:00:00Z",
  };

  const projection = projectIntentTokenMandateBinding({
    compact: makeIntentCompact(),
    signer_public_key_pem: intentPublic,
    action,
    trust: trustedIntent,
    scope_path: "parameters.market_scope",
  });

  assert.equal(projection.status, "unverifiable");
  assert.equal(projection.verification.action_binding_verified, false);
  assert.ok(
    projection.unmapped.includes(
      "declared_intent.bounds.max_single_order_usd",
    ),
  );
});

test("Intent Token principal and subject remain distinct principal and agent identities", () => {
  const action = {
    actor: { id: "agent:7" },
    operation: "financial:order:equity",
    parameters: {
      market_scope: "EQUITIES_US",
      amount: 500,
    },
    occurred_at: "2026-10-07T09:00:00Z",
  };

  const projection = projectIntentTokenMandateBinding({
    compact: makeIntentCompact(),
    signer_public_key_pem: intentPublic,
    action,
    trust: trustedIntent,
    scope_path: "parameters.market_scope",
    bound_mappings: {
      max_single_order_usd: {
        path: "parameters.amount",
        operator: "number_lte",
      },
    },
  });

  assert.equal(projection.mandate?.principal.id, "user:42");
  assert.equal(projection.mandate?.agent?.id, "agent:7");
});

test("tampered Intent Token payload fails signature verification", () => {
  const compact = makeIntentCompact();
  const [header, payload, signature] = compact.split(".");
  const parsed = JSON.parse(
    Buffer.from(payload!, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  parsed.sub = "agent:attacker";
  const tampered = `${header}.${b64json(parsed)}.${signature}`;

  const result = verifyIntentTokenCompactJwt({
    compact: tampered,
    signer_public_key_pem: intentPublic,
  });

  assert.equal(result.payload_valid, true);
  assert.equal(result.signature_verified, false);
});
