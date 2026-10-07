# HTTP request evidence mapping

This document defines non-normative AuditSpec mapping guidance for request-authenticity evidence derived from HTTP Message Signatures (RFC 9421) and OAuth DPoP (RFC 9449).

AuditSpec keeps this layer separate from actor/delegation semantics.

## Layer boundary

RFC 9421 and DPoP answer questions about the request and the key material used with it.

They do not, by themselves, establish:

- the semantic AuditSpec actor;
- the represented principal;
- a delegation chain;
- a business authorization decision;
- human intent or consent;
- downstream business execution.

Those facts require separate evidence.

## RFC 9421

The TypeScript reference accepts a verifier result instead of raw HTTP signature bytes.

The projection preserves:

- whether the cryptographic signature verified;
- whether application-specific signature requirements were satisfied;
- the names of covered HTTP components;
- signature label;
- key identifier and algorithm when provided;
- creation/expiration metadata;
- whether a nonce was present;
- application tag.

The projection deliberately does not copy signed HTTP component values.

For AuditSpec request-attribution use, covering request control data such as `@method` and `@target-uri` is materially stronger than signing unrelated fields alone. A cryptographically valid signature over insufficient components remains cryptographically valid, but the projection warns that request control data is not fully covered.

RFC 9421 itself requires applications to define which covered components, algorithms, key-resolution rules, time boundaries, and other parameters are acceptable. Therefore AuditSpec keeps `signature_verified` separate from `application_profile_satisfied`.

## RFC 9449 DPoP

The TypeScript reference consumes the result of DPoP verification rather than parsing or verifying the proof JWT itself.

It preserves narrow facts such as:

- DPoP proof signature verification;
- HTTP method binding;
- target URI binding;
- freshness validation;
- proof identifier for replay tracking;
- server nonce verification when required;
- `ath` access-token hash verification for protected-resource use;
- verification that the access token is bound to the same proof key;
- public-key thumbprint when supplied by the verifier.

The projection does not accept or persist the raw access token.

A valid DPoP proof demonstrates possession of the proof key in the protocol context. RFC 9449 explicitly does not make the proof itself an authentication or access-control mechanism.

## Executable reference

The v0.2 TypeScript implementation is:

`implementations/typescript/src/http-request-evidence.ts`

The tests are:

`implementations/typescript/test/http-request-evidence.test.ts`

The functions are pure semantic adapters:

`mapRfc9421Verification(...)`

`mapDpopVerification(...)`

Cryptographic verification, HTTP parsing, key discovery, JOSE processing, replay storage, and OAuth server behavior remain outside this mapping layer.

## Relationship to RFC 8693

The intended layering is:

```text
RFC 9421 / RFC 9449
    request/key evidence
            |
            v
RFC 8693
    actor/delegation context
            |
            v
AuditSpec
    action + authorization + result + evidence
```

A consumer may correlate these layers, but it must not collapse them into a single trust assertion.
