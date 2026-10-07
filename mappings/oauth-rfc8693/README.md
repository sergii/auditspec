# OAuth 2.0 Token Exchange (RFC 8693) mapping

This document records non-normative mapping guidance between AuditSpec and OAuth 2.0 Token Exchange, RFC 8693.

RFC 8693 defines an OAuth token-exchange protocol for impersonation and delegation and introduces JWT/introspection claims that are especially relevant to AuditSpec:

- `act` identifies the current actor to whom authority has been delegated.
- nested `act` values represent prior actors in the delegation history.
- `may_act` identifies a party authorized to become the actor and act on behalf of the token subject.
- `scope`, `aud`, and resource parameters constrain the authority/applicability of issued tokens.

Reference: https://www.rfc-editor.org/rfc/rfc8693.html

## Why it matters to AuditSpec

AuditSpec deliberately separates:

1. who the action is attributable to now;
2. on whose behalf or through whose authority the action occurs;
3. whether the action was authorized;
4. whether the action actually executed;
5. what evidence supports those assertions.

RFC 8693 is strong prior art for the first three questions in OAuth-based delegation systems, but it is not a replacement for AuditSpec semantics.

## Conservative field mapping

| RFC 8693 | AuditSpec | Notes |
| --- | --- | --- |
| top-level `sub` | delegation principal / represented subject | Map only when the token context establishes delegation semantics. |
| outermost `act` | `actor` | The outermost actor is the current actor. |
| nested `act` | `delegation[]` principals | Preserve nearest-first order. Relationship kind still depends on the verified exchange/context. |
| `may_act` | authorization/delegation evidence | Never turn it into an observed actor or action by itself. |
| `scope` | `authorization.scopes` candidate input | Scope describes token authority, not a concrete authorization decision or execution result. |
| `aud` / resource | authority boundary / evidence context | Do not mechanically map to AuditSpec `targets`. |
| `client_id` | related OAuth client identity | Do not mechanically map to `actor`. |

## Example

Given a verified token whose claims are conceptually:

```json
{
  "sub": "user:42",
  "scope": "invoice:approve",
  "act": {
    "sub": "service:16",
    "act": {
      "sub": "service:77"
    }
  }
}
```

RFC 8693 says `service:16` is the current actor and `service:77` is a prior actor. A conservative AuditSpec projection for a later business action could therefore start from:

```json
{
  "actor": {
    "type": "service",
    "id": "service:16"
  },
  "delegation": [
    {
      "relationship": "delegated_by",
      "principal": {
        "type": "service",
        "id": "service:77"
      }
    },
    {
      "relationship": "on_behalf_of",
      "principal": {
        "type": "user",
        "id": "user:42"
      }
    }
  ],
  "authorization": {
    "scopes": ["invoice:approve"]
  }
}
```

This projection still does **not** prove that authorization for the concrete action was allowed, that the action executed, or that the JWT is authentic. Those assertions require the appropriate authorization, execution, and verification evidence.

## `may_act` is not `act`

This distinction is especially important for AuditSpec.

`may_act` means a party is asserted to be eligible to act for the token subject. It expresses potential authority. It must not be converted into:

- an AuditSpec immediate actor;
- an observed delegation step;
- an executed action;
- an `authorization.decision: allowed` result for a concrete business operation.

If an authorization server actually performs a token exchange based on `may_act`, the exchange can be recorded separately and the issued token can later provide evidence for a business action.

## Evidence and trust

A claim set is not self-authenticating evidence. Consumers should retain enough context to establish, as applicable:

- token issuer;
- verification status and key/trust source;
- audience/resource applicability;
- relevant scope;
- token lifetime;
- exchange/request identifiers;
- whether the evidence came from an authoritative enforcement boundary or only from a caller/self-report.

AuditSpec should preserve that provenance instead of treating claim presence as proof.

## Adjacent specifications and layer boundaries

The surrounding standards solve different parts of the problem. AuditSpec should preserve those distinctions rather than flattening them into one "identity token" concept.

| Problem | Relevant work | What it proves or carries | AuditSpec implication |
| --- | --- | --- | --- |
| Was this HTTP request signed by a holder of key material? | RFC 9421 HTTP Message Signatures | Integrity/authenticity of selected HTTP components under a key | Useful execution/request evidence; signer identity still depends on key binding and verifier policy. |
| Is an automated client tied to a discoverable public identity? | Web Bot Auth draft | Automated-client identity continuity and key discovery | Potential producer of attributed actor evidence, but not delegation or consent. |
| Is an OAuth token being presented by the key holder it was bound to? | RFC 9449 DPoP | Proof of possession and sender-constrained token use | Strengthens credential-use evidence; does not identify the represented human by itself. |
| Who is the current delegated actor and who came before? | RFC 8693 | `sub`, `act`, nested actor history, `may_act` | Direct mapping input for actor/delegation semantics. |
| How does identity/authorization survive trust-domain crossings? | OAuth Identity and Authorization Chaining draft | Cross-domain identity and authorization propagation | Relevant to multi-domain delegation provenance and chain boundaries. |
| How is immutable transaction context propagated inside a trust domain? | Transaction Tokens draft | User/workload identity plus transaction authorization context | Relevant to call-chain evidence and transaction correlation, not workload authentication. |
| How is agent identity represented in a transaction context? | Transaction Tokens For Agents draft | `act` as delegated agent, `sub` as principal, plus `agentic_ctx` for originator/current actor, hop count, and optional minimum assurance | Strongly aligned with agent audit semantics and with preserving weak-link trust instead of laundering identity through a stronger downstream agent. |
| Did a human actually authorize this concrete autonomous action? | Verifiable Human Mandates problem draft | Emerging mandate/intent problem, not yet a finished protocol | Relevant to future approval/intent evidence, separate from actor identity. |

This yields a useful separation:

```text
request authenticity     RFC 9421
        |
key / sender binding     Web Bot Auth / DPoP
        |
delegated actor          RFC 8693
        |
cross-domain chain       OAuth Identity Chaining
        |
transaction context      Transaction Tokens
        |
human mandate            emerging agent-mandate work
        |
audited outcome          AuditSpec
```

A particularly relevant idea in the current Transaction Tokens For Agents draft is **monotonic attenuation**: a chain that began with a low-assurance external agent must not become high-assurance merely because it later passes through a strongly verified internal agent. AuditSpec should preserve the same principle at the evidence layer: later authoritative evidence can strengthen facts that producer directly owns, but it must not retroactively upgrade the trust of earlier actor/delegation assertions.

A JWT is therefore only a possible container. It is not the interoperability model by itself. Likewise, HMAC can authenticate a request in a bilateral shared-secret relationship, but an open ecosystem generally needs independently verifiable key identity/discovery rather than every verifier sharing a secret with every agent.

## Core boundary

AuditSpec Core remains OAuth-neutral.

RFC 8693 belongs in mappings, profiles, adapters, and evidence producers. OAuth-specific fields should not become mandatory Core fields merely because one authorization ecosystem uses them.
