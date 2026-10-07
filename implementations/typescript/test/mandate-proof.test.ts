import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  canonicalizeForMandateProof,
  digestForMandateProof,
  issueHumanMandateProof,
  verifyHumanMandateProof,
  type SignedHumanMandateProof,
} from "../src/mandate-proof.js";
import type {
  HumanMandate,
  MandatedAction,
  MandateVerificationContext,
} from "../src/human-mandate.js";

const keyPair = generateKeyPairSync("ed25519");
const otherKeyPair = generateKeyPairSync("ed25519");

const privateKey = keyPair.privateKey.export({
  format: "pem",
  type: "pkcs8",
}).toString();

const publicKey = keyPair.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

const otherPublicKey = otherKeyPair.publicKey.export({
  format: "pem",
  type: "spki",
}).toString();

const mandate: HumanMandate = {
  mandate_version: "0.1",
  id: "mandate-001",
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
      id: "amount",
      class: "hard",
      path: "parameters.amount",
      operator: "number_lte",
      value: 1000,
    },
  ],
};

const action: MandatedAction = {
  actor: { id: "agent:7" },
  operation: "invoice.pay",
  parameters: {
    amount: 500,
    counterparty: "vendor:a",
  },
  occurred_at: "2026-10-07T09:00:00Z",
};

const verified: MandateVerificationContext = {
  mandate_signature_verified: true,
  action_binding_verified: true,
  verifier: "mandate-verifier",
  mandate_digest: "sha256:source-mandate",
  action_digest: "sha256:source-action",
};

function issue(
  verification: MandateVerificationContext = verified,
): SignedHumanMandateProof {
  return issueHumanMandateProof({
    proof_id: "proof-001",
    issued_at: "2026-10-07T09:00:01Z",
    issuer: {
      id: "auditspec-proof-service",
      key_id: "ed25519-2026-10",
    },
    mandate,
    action,
    verification,
    private_key_pem: privateKey,
  });
}

function verify(
  proof: SignedHumanMandateProof,
  suppliedMandate: HumanMandate = mandate,
  suppliedAction: MandatedAction = action,
) {
  return verifyHumanMandateProof({
    proof,
    mandate: suppliedMandate,
    action: suppliedAction,
    public_key_pem: publicKey,
    expected_issuer: {
      id: "auditspec-proof-service",
      key_id: "ed25519-2026-10",
    },
  });
}

test("JCS canonicalization is independent of object key insertion order", () => {
  const first = {
    z: 1,
    a: {
      y: true,
      x: "value",
    },
  };
  const second = {
    a: {
      x: "value",
      y: true,
    },
    z: 1,
  };

  assert.equal(
    canonicalizeForMandateProof(first),
    canonicalizeForMandateProof(second),
  );
  assert.equal(digestForMandateProof(first), digestForMandateProof(second));
});

test("issues and independently verifies a signed within-mandate proof", () => {
  const proof = issue();
  const result = verify(proof);

  assert.equal(proof.statement.canonicalization, "RFC8785");
  assert.equal(proof.statement.signature_algorithm, "Ed25519");
  assert.equal(proof.statement.evaluation.decision, "within_mandate");
  assert.equal(result.valid, true);
  assert.equal(result.signature_valid, true);
  assert.equal(result.mandate_digest_match, true);
  assert.equal(result.action_digest_match, true);
  assert.equal(result.evaluation_match, true);
  assert.equal(result.authorized, true);
});

test("signed proof remains valid evidence of an unverifiable decision without granting authority", () => {
  const proof = issue({
    ...verified,
    action_binding_verified: false,
  });
  const result = verify(proof);

  assert.equal(proof.statement.evaluation.decision, "unverifiable");
  assert.equal(result.valid, true);
  assert.equal(result.authorized, false);
});

test("tampering with the concrete action breaks the proof binding", () => {
  const proof = issue();
  const changedAction: MandatedAction = {
    ...action,
    parameters: {
      ...action.parameters,
      amount: 900,
    },
  };

  const result = verify(proof, mandate, changedAction);

  assert.equal(result.valid, false);
  assert.equal(result.signature_valid, true);
  assert.equal(result.action_digest_match, false);
  assert.equal(result.evaluation_match, true);
  assert.equal(result.authorized, false);
});

test("tampering with the mandate breaks the proof binding", () => {
  const proof = issue();
  const changedMandate: HumanMandate = {
    ...mandate,
    expires_at: "2026-10-07T10:00:00Z",
  };

  const result = verify(proof, changedMandate, action);

  assert.equal(result.valid, false);
  assert.equal(result.mandate_digest_match, false);
  assert.equal(result.authorized, false);
});

test("tampering with the signed evaluation breaks signature and semantic recomputation", () => {
  const proof = structuredClone(issue());
  proof.statement.evaluation.decision = "outside_mandate";
  proof.statement.evaluation.authorized = false;

  const result = verify(proof);

  assert.equal(result.valid, false);
  assert.equal(result.signature_valid, false);
  assert.equal(result.evaluation_match, false);
  assert.equal(result.authorized, false);
});

test("a different public key cannot verify the proof", () => {
  const proof = issue();
  const result = verifyHumanMandateProof({
    proof,
    mandate,
    action,
    public_key_pem: otherPublicKey,
    expected_issuer: {
      id: "auditspec-proof-service",
      key_id: "ed25519-2026-10",
    },
  });

  assert.equal(result.signature_valid, false);
  assert.equal(result.valid, false);
  assert.equal(result.authorized, false);
});

test("a valid signature does not establish an unexpected issuer identity", () => {
  const proof = issue();
  const result = verifyHumanMandateProof({
    proof,
    mandate,
    action,
    public_key_pem: publicKey,
    expected_issuer: {
      id: "different-proof-service",
    },
  });

  assert.equal(result.signature_valid, true);
  assert.equal(result.issuer_match, false);
  assert.equal(result.valid, false);
});

test("changing only JSON object key order does not break content binding", () => {
  const proof = issue();
  const reorderedAction: MandatedAction = {
    occurred_at: action.occurred_at,
    parameters: {
      counterparty: "vendor:a",
      amount: 500,
    },
    operation: action.operation,
    actor: { id: "agent:7" },
  };

  const result = verify(proof, mandate, reorderedAction);

  assert.equal(result.action_digest_match, true);
  assert.equal(result.valid, true);
});

test("negative zero is rejected before JCS signing", () => {
  assert.throws(
    () => canonicalizeForMandateProof({ amount: -0 }),
    /negative zero/,
  );
});

test("non-finite numbers are rejected before JCS signing", () => {
  assert.throws(
    () => canonicalizeForMandateProof({ amount: Number.POSITIVE_INFINITY }),
    /non-finite number/,
  );
});

test("lone Unicode surrogates are rejected before JCS signing", () => {
  assert.throws(
    () => canonicalizeForMandateProof({ value: "\ud800" }),
    /lone Unicode surrogate/,
  );
});

test("undefined values are rejected rather than silently omitted", () => {
  assert.throws(
    () => canonicalizeForMandateProof({ amount: undefined }),
    /cannot contain undefined/,
  );
});
