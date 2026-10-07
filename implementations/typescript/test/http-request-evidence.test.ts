import assert from "node:assert/strict";
import test from "node:test";
import {
  mapDpopVerification,
  mapRfc9421Verification,
} from "../src/http-request-evidence.js";

test("RFC 9421 requires both cryptographic verification and application profile satisfaction", () => {
  const projection = mapRfc9421Verification({
    signature_verified: true,
    application_profile_satisfied: false,
    covered_components: ["@method", "@target-uri"],
    parameters: { keyid: "key-1", alg: "ed25519", created: 1700000000 },
  });

  assert.equal(projection.verification.status, "unverified");
  assert.equal(projection.verification.cryptographic_signature_verified, true);
  assert.ok(
    projection.warnings.some(
      (warning) => warning.code === "application_profile_not_satisfied",
    ),
  );
});

test("RFC 9421 preserves covered component names but not signed component values", () => {
  const projection = mapRfc9421Verification({
    signature_verified: true,
    application_profile_satisfied: true,
    covered_components: ["@method", "@target-uri", "content-digest"],
    signature_label: "sig1",
    parameters: {
      keyid: "agent-key-1",
      alg: "ed25519",
      nonce: "opaque-nonce-value",
      tag: "agent-request",
    },
  });

  assert.equal(projection.verification.status, "verified");
  assert.deepEqual(projection.signature_context?.covered_components, [
    "@method",
    "@target-uri",
    "content-digest",
  ]);
  assert.equal(projection.request_binding.method_covered, true);
  assert.equal(projection.request_binding.target_covered, true);
  assert.equal(projection.request_binding.content_digest_covered, true);
  assert.equal(JSON.stringify(projection).includes("opaque-nonce-value"), false);
});

test("RFC 9421 keyid and algorithm do not become actor identity or delegation", () => {
  const projection = mapRfc9421Verification({
    signature_verified: true,
    application_profile_satisfied: true,
    covered_components: ["@method", "@target-uri"],
    parameters: { keyid: "agent-key-1", alg: "ed25519" },
  });

  assert.equal(projection.key_context.key_id, "agent-key-1");
  assert.equal(projection.key_context.algorithm, "ed25519");
  assert.ok(projection.does_not_prove.includes("actor_identity"));
  assert.ok(projection.does_not_prove.includes("delegation"));
  assert.equal("actor" in projection, false);
  assert.equal("delegation" in projection, false);
});

test("RFC 9421 warns when request control data is not fully covered", () => {
  const projection = mapRfc9421Verification({
    signature_verified: true,
    application_profile_satisfied: true,
    covered_components: ["content-digest"],
  });

  assert.equal(projection.verification.status, "verified");
  assert.equal(projection.request_binding.method_covered, false);
  assert.equal(projection.request_binding.target_covered, false);
  assert.ok(
    projection.warnings.some(
      (warning) => warning.code === "request_control_data_not_fully_covered",
    ),
  );
});

test("valid DPoP proof records key possession and request binding without inferring actor", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: true,
    target_uri_match: true,
    freshness_valid: true,
    proof_id: "proof-123",
    algorithm: "ES256",
    public_key_thumbprint: "thumbprint-123",
  });

  assert.equal(projection.verification.status, "verified");
  assert.equal(projection.request_binding.method_verified, true);
  assert.equal(projection.request_binding.target_uri_verified, true);
  assert.equal(projection.replay_context.freshness_verified, true);
  assert.equal(projection.replay_context.proof_id, "proof-123");
  assert.ok(projection.does_not_prove.includes("actor_identity"));
  assert.ok(projection.does_not_prove.includes("authorization_decision"));
  assert.equal("actor" in projection, false);
});

test("DPoP method mismatch fails closed", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: false,
    target_uri_match: true,
    freshness_valid: true,
  });

  assert.equal(projection.verification.status, "unverified");
  assert.ok(
    projection.warnings.some(
      (warning) => warning.code === "inconsistent_verifier_result",
    ),
  );
});

test("DPoP protected-resource use requires ath and access-token key binding", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: true,
    target_uri_match: true,
    freshness_valid: true,
    access_token_present: true,
    access_token_hash_verified: false,
    token_key_binding_verified: true,
  });

  assert.equal(projection.verification.status, "unverified");
  assert.equal(projection.request_binding.access_token_hash_verified, false);
  assert.equal(projection.request_binding.token_key_binding_verified, true);
  assert.ok(
    projection.warnings.some(
      (warning) => warning.code === "access_token_hash_not_verified",
    ),
  );
});

test("DPoP server nonce requirement fails closed when nonce was not verified", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: true,
    target_uri_match: true,
    freshness_valid: true,
    nonce_required: true,
    nonce_verified: false,
  });

  assert.equal(projection.verification.status, "unverified");
  assert.equal(projection.replay_context.nonce_required, true);
  assert.equal(projection.replay_context.nonce_verified, false);
  assert.ok(
    projection.warnings.some((warning) => warning.code === "nonce_not_verified"),
  );
});

test("DPoP access token values are never accepted or copied by the projection API", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: true,
    target_uri_match: true,
    freshness_valid: true,
    access_token_present: true,
    access_token_hash_verified: true,
    token_key_binding_verified: true,
  });

  assert.equal(projection.verification.status, "verified");
  assert.equal("access_token" in projection, false);
  assert.equal("token" in projection, false);
});

test("request evidence never claims principal, delegation, consent, authorization, or execution", () => {
  const projection = mapDpopVerification({
    verifier_accepted: true,
    signature_verified: true,
    method_match: true,
    target_uri_match: true,
    freshness_valid: true,
  });

  assert.deepEqual(projection.does_not_prove, [
    "actor_identity",
    "represented_principal",
    "delegation",
    "authorization_decision",
    "human_intent_or_consent",
    "business_execution",
  ]);
});
