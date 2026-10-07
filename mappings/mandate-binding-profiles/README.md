# Mandate binding profiles

This directory documents the AuditSpec v0.2 research adapters that project external agent-authorization artifacts into the existing human-mandate evaluation model.

The executable reference is:

`implementations/typescript/src/mandate-binding-profiles.ts`

The profiles currently cover:

- Agent Authorization Envelope (AAE), `draft-kroehl-agentic-trust-aae-02`;
- Intent Token, `draft-williams-intent-token-02`.

Both are active individual Internet-Drafts. AuditSpec treats them as prior art and research inputs, not as stable IETF standards.

## Goal

The previous AuditSpec slices established:

```text
HumanMandate
      +
MandatedAction
      ↓
deterministic evaluation
      ↓
SignedHumanMandateProof
```

The missing question was how a real external authorization artifact becomes the verified mandate input without silently discarding source-protocol restrictions.

These profiles add that boundary:

```text
AAE / Intent Token
      ↓
cryptographic artifact verification
      ↓
protocol-specific fail-closed checks
      ↓
loss-aware projection
      ↓
HumanMandate + MandatedAction
      ↓
evaluateHumanMandate()
      ↓
SignedHumanMandateProof
```

## AAE profile

The reference implementation can verify the compact JWS signature of an AAE with an externally supplied Ed25519 public key.

It checks the protected header for:

- `alg=EdDSA`;
- `cty=aae+json`;
- a non-empty `kid`.

It also requires the expected Verifiable Credential structure containing:

- VC id and issuer;
- `credentialSubject.id`;
- `credentialSubject.aae.mandate`;
- `credentialSubject.aae.constraints`;
- `credentialSubject.aae.validity`.

Public-key resolution from the DID document remains external. The profile therefore keeps JWS signature validity separate from the statement that the supplied key is actually the issuer's authorized DID verification method.

### Exact action binding

For AAE grants the profile implements the draft's action-binding digest exactly:

```text
"sha256:" ||
LOWERHEX(
  SHA-256(
    "aae:enforce-action:v1" || 0x00 || JCS(action)
  )
)
```

The profile uses the same RFC 8785 canonicalization surface already used by AuditSpec mandate proofs.

A matching digest is not enough by itself. The profile also requires the grant's `type_fields` set to equal the attempted action's member-name set.

### Grant disposition

The source protocol is preserved rather than flattened:

```text
forbid
  -> source_denied

hold
  -> source_pending

allow with satisfied representable constraints
  -> candidate HumanMandate

no exact matching grant
  -> source_denied
```

A `hold` is not rewritten as AuditSpec permission or as generic "human escalation". It remains a source-protocol pending state because the AAE ratification mechanism has its own semantics.

### Constraints

The profile maps the closed grant constraint types:

- `exact`;
- `enum`;
- `range`.

The source AAE action must contain a string `verb`. AuditSpec maps:

```text
verb
  -> MandatedAction.operation

other action members
  -> MandatedAction.parameters.<member>
```

AAE `mandate.actions` becomes an operation allowlist.

For the extensible top-level CONSTRAINTS block, the reference profile currently maps only cases that have deterministic AuditSpec semantics:

- `max_transaction_value` when the action exposes numeric `amount` and string `currency`;
- `allowed_domains` when the action exposes string `domain`.

A required constraint that cannot be represented causes `unverifiable`. For example, required `rate_limit` cannot be represented by the stateless HumanMandate evaluator because it requires shared history/state. The profile must not discard it and thereby widen authority.

Optional unsupported constraints remain explicitly listed as unmapped and generate warnings.

### External AAE trust checks

The profile accepts explicit outcomes for facts that cannot safely be inferred from the JWS bytes alone:

- issuer DID key binding;
- issuer authority for the named principal;
- subject possession/binding;
- revocation state;
- single-use enforcement;
- delegation-chain validation.

A cryptographically valid JWS does not automatically prove that the issuer was authorized by the human principal.

For projection into `MandateVerificationContext`, `mandate_signature_verified` is true only when the signed artifact and these required source-trust checks collectively establish that the AAE is an accepted mandate source.

## Intent Token profile

The reference implementation verifies a compact Intent Token JWT using ES256 and an externally supplied P-256 public key.

It requires the -02 structure used by the draft, including:

- `typ=intent+jwt`;
- `ibt_ver=1.1`;
- standard JWT identity/time claims;
- `principal.id`;
- `declared_intent.action_class` and `scope`;
- shard id/timestamps/window;
- `enforcement.snap_back=true`;
- audit-chain and authorization-mode values;
- `parent_token_jti` for agent/cluster level tokens.

The token's principal and subject stay distinct:

```text
principal.id
  -> HumanMandate.principal

sub
  -> HumanMandate.agent
```

The tighter of token expiry and shard expiry becomes the HumanMandate expiry.

### Scope and bounds are not guessed

The Intent Token draft uses deployment/domain-specific scope and bounds. AuditSpec therefore requires explicit mappings instead of guessing field semantics.

For example:

```text
declared_intent.scope
  -> parameters.market_scope

max_single_order_usd
  -> parameters.amount <= value
```

If a scope or bound remains unmapped, the adapter fails closed to `unverifiable`.

This prevents a profile from silently converting:

```text
"max_single_order_usd": 1000
```

into a broader mandate that only preserves the action class.

### Before-action binding

A valid JWT signature is not treated as proof that one concrete action was bound before execution.

The profile keeps these checks separate:

- signer authorized for the principal;
- delegation chain verified;
- `jti` uniqueness/replay check;
- authorization-level chain verified;
- before-action binding verified.

Only when the artifact signature and signer authority are accepted does `mandate_signature_verified` become true.

Only when the concrete before-action binding and the other source-chain checks are positive, and no source restriction was dropped, does `action_binding_verified` become true.

This is deliberate because the draft describes pre-action validation and FCTG binding, but AuditSpec does not pretend that possession of the JWT bytes alone replays the complete enforcement process.

## Shared invariant

Both profiles preserve the same rule:

```text
cryptographically valid authorization artifact
        !=
lossless concrete-action mandate
```

A profile may verify a signature and still return `unverifiable`.

Examples:

- unresolved issuer-to-principal authority;
- required AAE stateful constraint not representable;
- AAE actions list without an exact grant;
- Intent Token scope/bounds lacking deployment mappings;
- missing replay/delegation checks;
- missing before-action binding evidence.

The correct result is uncertainty or source denial, never widened permission.

## Status values

Profiles return one of:

```text
ready
source_denied
source_pending
unverifiable
```

`ready` means the adapter produced a loss-aware HumanMandate projection suitable for deterministic AuditSpec evaluation. It does not mean the business action has executed.

`source_denied` and `source_pending` preserve explicit source-protocol outcomes.

`unverifiable` means AuditSpec cannot safely produce a positive concrete-action mandate from the available artifact and trust inputs.

## Security boundary

These adapters intentionally do not perform network key discovery, DID resolution, revocation HTTP calls, distributed single-use state, delegation retrieval, or FCTG storage.

Those operations belong to source-protocol implementations or dedicated evidence producers. AuditSpec consumes their explicit results and keeps provenance/trust boundaries visible.
