# Signed human mandate proof

This mapping defines the first AuditSpec `prove` artifact for the human-mandate research model.

It is intentionally narrow.

It does not define a new authorization protocol. It signs an AuditSpec evaluation statement that is cryptographically bound to one exact mandate document and one exact concrete action.

## Pipeline

```text
ASK
proposed concrete action
        |
        v
APPROVE
human mandate
        |
        v
ACT
concrete action
        |
        v
EVALUATE
within / outside / escalate / unverifiable
        |
        v
PROVE
RFC 8785 canonical statement
+ SHA-256 content bindings
+ Ed25519 signature
```

The TypeScript reference is:

`implementations/typescript/src/mandate-proof.ts`

## Canonical binding

AuditSpec uses RFC 8785 JSON Canonicalization Scheme (JCS) before hashing or signing.

The reference implementation uses the `canonicalize` package listed by RFC 8785 Appendix G and pins it in the TypeScript reference package.

The proof statement contains:

- a SHA-256 digest of the complete mandate object;
- a SHA-256 digest of the complete concrete action object;
- the complete deterministic human-mandate evaluation;
- proof issuer and key identifier;
- the canonicalization, digest, and signature algorithm identifiers;
- proof identifier and issuance time.

The complete proof statement is canonicalized with RFC 8785 and signed using Ed25519.

Changing object property insertion order does not change the binding.

Changing a semantic value in the mandate or action does change the binding.

## JCS input hardening

Before canonicalization, the TypeScript reference rejects values that are unsafe or outside the intended JSON signing surface, including:

- non-finite numbers;
- negative zero;
- `undefined`;
- functions, symbols, bigint, or other non-JSON values;
- cyclic object graphs;
- non-JSON object prototypes;
- lone Unicode surrogates.

The object API cannot detect duplicate JSON property names that existed in raw JSON text before parsing. A raw JSON verifier must reject duplicate keys before projecting text into an object. The canonicalized representation, not an unvalidated original text buffer, is the signed semantic artifact.

## What independent verification checks

`verifyHumanMandateProof(...)` verifies:

1. the statement uses the supported AuditSpec proof version and algorithms;
2. the Ed25519 signature is valid under the supplied public key;
3. the signed issuer and key id match the verifier's expected issuer identity;
4. the mandate id matches;
5. RFC 8785 + SHA-256 of the supplied mandate matches the signed mandate digest;
6. RFC 8785 + SHA-256 of the supplied action matches the signed action digest;
7. recomputing the deterministic mandate evaluation from the supplied mandate/action and the signed verification context produces the same evaluation.

Only if all checks pass is the proof artifact `valid`.

`authorized` is true only when the proof is valid and the signed/recomputed evaluation itself has `authorized: true`.

A valid proof of `outside_mandate`, `requires_fresh_authorization`, or `unverifiable` is still a valid cryptographic proof artifact, but it never grants authority.

## What the proof does not establish

A valid proof does not magically make every assertion inside it globally authoritative.

In particular:

- public-key-to-issuer trust remains an external key distribution, PKI, registry, or trust-policy responsibility;
- the proof signs the verifier's `mandate_signature_verified` and `action_binding_verified` outcomes, but this layer does not independently redo the underlying T0 mandate signature or T0-to-T1 binding cryptography;
- signing an evaluation does not prove the business action actually executed;
- an execution receipt does not retroactively prove the human mandate was authentic;
- proof-issuer authority is fact-scoped and must not be broadened by signature validity alone.

This distinction is intentional:

```text
signature valid
      !=
issuer trusted for every fact
      !=
mandate cryptography independently reverified
      !=
business execution happened
```

## Schema

The structural artifact contract is:

`schema/human-mandate-proof.schema.json`

The schema enforces, among other properties, that only `within_mandate` can carry `authorized: true`.

Schema validity is not cryptographic validity. The structural example under `schema/examples/` contains illustrative signature bytes and is only a schema vector.

## Current REQ-4 interpretation

The previous human-mandate slice marked independently verifiable evidence as not represented.

This slice closes part of that gap:

- a third party can independently verify who signed the AuditSpec proof statement;
- it can independently verify the exact mandate/action content bindings;
- it can independently recompute the deterministic evaluation and compare it to the signed result.

The remaining gap is deeper: independent re-verification of the original human mandate signature and the original T0-to-T1 action-binding mechanism still depends on whatever mandate protocol ultimately supplies those cryptographic artifacts.

AuditSpec should not pretend that a signed attestation about those verification outcomes is equivalent to independently replaying the underlying cryptographic protocol.
