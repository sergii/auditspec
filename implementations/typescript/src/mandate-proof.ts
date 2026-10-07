import {
  createHash,
  sign as signBytes,
  verify as verifyBytes,
} from "node:crypto";
import canonicalize from "canonicalize";
import {
  evaluateHumanMandate,
  type HumanMandate,
  type HumanMandateEvaluation,
  type MandatedAction,
  type MandateVerificationContext,
} from "./human-mandate.js";

export interface HumanMandateProofStatement {
  statement_version: "0.1";
  proof_id: string;
  issued_at: string;
  issuer: {
    id: string;
    key_id: string;
  };
  canonicalization: "RFC8785";
  digest_algorithm: "SHA-256";
  signature_algorithm: "Ed25519";
  mandate: {
    id: string;
    digest: string;
  };
  action: {
    digest: string;
  };
  evaluation: HumanMandateEvaluation;
}

export interface SignedHumanMandateProof {
  statement: HumanMandateProofStatement;
  signature: string;
}

export interface HumanMandateProofVerification {
  verification_version: "0.1";
  valid: boolean;
  signature_valid: boolean;
  issuer_match: boolean;
  issued_at_valid: boolean;
  mandate_id_match: boolean;
  mandate_digest_match: boolean;
  action_digest_match: boolean;
  evaluation_match: boolean;
  decision: HumanMandateEvaluation["decision"];
  authorized: boolean;
  limitations: string[];
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) return true;
  }

  return false;
}

function assertJcsInput(
  value: unknown,
  path = "$",
  active = new Set<object>(),
): void {
  if (value === null || typeof value === "boolean") return;

  if (typeof value === "string") {
    if (hasLoneSurrogate(value)) {
      throw new TypeError(`${path}: RFC 8785 input contains a lone Unicode surrogate`);
    }
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path}: RFC 8785 input contains a non-finite number`);
    }
    if (Object.is(value, -0)) {
      throw new TypeError(`${path}: RFC 8785 input contains negative zero`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (active.has(value)) {
      throw new TypeError(`${path}: RFC 8785 input contains a cycle`);
    }
    active.add(value);
    value.forEach((item, index) =>
      assertJcsInput(item, `${path}[${index}]`, active),
    );
    active.delete(value);
    return;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path}: RFC 8785 input must contain only JSON objects`);
    }
    if (active.has(record)) {
      throw new TypeError(`${path}: RFC 8785 input contains a cycle`);
    }

    active.add(record);
    for (const [key, item] of Object.entries(record)) {
      if (hasLoneSurrogate(key)) {
        throw new TypeError(
          `${path}: RFC 8785 object key contains a lone Unicode surrogate`,
        );
      }
      if (item === undefined) {
        throw new TypeError(
          `${path}.${key}: RFC 8785 input cannot contain undefined`,
        );
      }
      assertJcsInput(item, `${path}.${key}`, active);
    }
    active.delete(record);
    return;
  }

  throw new TypeError(
    `${path}: RFC 8785 input must be JSON data, not ${typeof value}`,
  );
}

export function canonicalizeForMandateProof(value: unknown): string {
  assertJcsInput(value);
  const canonical = canonicalize(value as Parameters<typeof canonicalize>[0]);
  if (typeof canonical !== "string") {
    throw new TypeError("RFC 8785 canonicalization did not produce a JSON string");
  }
  return canonical;
}

export function digestForMandateProof(value: unknown): string {
  const canonical = canonicalizeForMandateProof(value);
  const digest = createHash("sha256").update(canonical, "utf8").digest("base64url");
  return `sha256:${digest}`;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalizeForMandateProof(left) === canonicalizeForMandateProof(right);
}

export function issueHumanMandateProof(input: {
  proof_id: string;
  issued_at: string;
  issuer: {
    id: string;
    key_id: string;
  };
  mandate: HumanMandate;
  action: MandatedAction;
  verification: MandateVerificationContext;
  private_key_pem: string;
}): SignedHumanMandateProof {
  const issuedAt = Date.parse(input.issued_at);
  if (!Number.isFinite(issuedAt)) {
    throw new TypeError("Mandate proof issued_at must be a valid date-time");
  }
  if (input.proof_id.length === 0) {
    throw new TypeError("Mandate proof proof_id must be non-empty");
  }
  if (input.issuer.id.length === 0 || input.issuer.key_id.length === 0) {
    throw new TypeError("Mandate proof issuer id and key_id must be non-empty");
  }

  const evaluation = evaluateHumanMandate({
    mandate: input.mandate,
    action: input.action,
    verification: input.verification,
  });

  const statement: HumanMandateProofStatement = {
    statement_version: "0.1",
    proof_id: input.proof_id,
    issued_at: input.issued_at,
    issuer: { ...input.issuer },
    canonicalization: "RFC8785",
    digest_algorithm: "SHA-256",
    signature_algorithm: "Ed25519",
    mandate: {
      id: input.mandate.id,
      digest: digestForMandateProof(input.mandate),
    },
    action: {
      digest: digestForMandateProof(input.action),
    },
    evaluation,
  };

  const signedBytes = Buffer.from(
    canonicalizeForMandateProof(statement),
    "utf8",
  );
  const signature = signBytes(null, signedBytes, input.private_key_pem).toString(
    "base64url",
  );

  return {
    statement,
    signature,
  };
}

export function verifyHumanMandateProof(input: {
  proof: SignedHumanMandateProof;
  mandate: HumanMandate;
  action: MandatedAction;
  public_key_pem: string;
  expected_issuer: {
    id: string;
    key_id?: string;
  };
}): HumanMandateProofVerification {
  const { proof } = input;

  const algorithmsSupported =
    proof.statement.statement_version === "0.1" &&
    proof.statement.canonicalization === "RFC8785" &&
    proof.statement.digest_algorithm === "SHA-256" &&
    proof.statement.signature_algorithm === "Ed25519";

  let signatureValid = false;
  if (algorithmsSupported) {
    try {
      signatureValid = verifyBytes(
        null,
        Buffer.from(canonicalizeForMandateProof(proof.statement), "utf8"),
        input.public_key_pem,
        Buffer.from(proof.signature, "base64url"),
      );
    } catch {
      signatureValid = false;
    }
  }

  const issuerMatch =
    proof.statement.issuer.id === input.expected_issuer.id &&
    (input.expected_issuer.key_id === undefined ||
      proof.statement.issuer.key_id === input.expected_issuer.key_id);

  const issuedAtValid = Number.isFinite(Date.parse(proof.statement.issued_at));
  const mandateIdMatch = proof.statement.mandate.id === input.mandate.id;

  let mandateDigestMatch = false;
  let actionDigestMatch = false;
  let evaluationMatch = false;

  try {
    mandateDigestMatch =
      proof.statement.mandate.digest === digestForMandateProof(input.mandate);
    actionDigestMatch =
      proof.statement.action.digest === digestForMandateProof(input.action);

    const recomputed = evaluateHumanMandate({
      mandate: input.mandate,
      action: input.action,
      verification: proof.statement.evaluation.verification,
    });
    evaluationMatch = canonicalEqual(recomputed, proof.statement.evaluation);
  } catch {
    mandateDigestMatch = false;
    actionDigestMatch = false;
    evaluationMatch = false;
  }

  const valid =
    algorithmsSupported &&
    signatureValid &&
    issuerMatch &&
    issuedAtValid &&
    mandateIdMatch &&
    mandateDigestMatch &&
    actionDigestMatch &&
    evaluationMatch;

  return {
    verification_version: "0.1",
    valid,
    signature_valid: signatureValid,
    issuer_match: issuerMatch,
    issued_at_valid: issuedAtValid,
    mandate_id_match: mandateIdMatch,
    mandate_digest_match: mandateDigestMatch,
    action_digest_match: actionDigestMatch,
    evaluation_match: evaluationMatch,
    decision: proof.statement.evaluation.decision,
    authorized: valid && proof.statement.evaluation.authorized,
    limitations: [
      "A valid proof establishes that the expected proof issuer signed this exact RFC 8785 statement and that its mandate, action, and deterministic evaluation bindings match the supplied documents.",
      "Trust that the supplied public key belongs to the expected issuer remains an external key-distribution or PKI responsibility.",
      "The signed evaluation carries mandate-signature and action-binding verification outcomes as attested facts; this verifier does not independently redo the underlying mandate signature or T0-to-T1 binding cryptography.",
      "The object API cannot detect duplicate JSON property names that may have existed in an original raw JSON text before parsing; callers verifying raw signed JSON must reject duplicates before object projection.",
    ],
  };
}
