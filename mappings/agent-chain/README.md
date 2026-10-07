# Agent-chain information-loss fixtures

This directory turns adjacent identity/authorization specifications into executable research fixtures for AuditSpec.

The goal is not to reimplement each source protocol. The goal is to answer, explicitly and testably:

1. Which source facts can AuditSpec preserve today?
2. Which source facts are only partially representable?
3. Which source facts are not represented?
4. Which facts remain unknown without stronger evidence?
5. Does a realistic multi-agent chain obey AuditSpec's monotonic assurance invariant?

## Current source corpus

The fixtures currently cover:

- OAuth Identity and Authorization Chaining Across Domains, `draft-ietf-oauth-identity-chaining-17`;
- Transaction Tokens, `draft-ietf-oauth-transaction-tokens-11`;
- Transaction Tokens For Agents, `draft-araut-oauth-transaction-tokens-for-agents-02`.

The last item is an individual Internet-Draft rather than an IETF WG standard. It is included because its explicit monotonic attenuation and identity-laundering model is directly useful as research prior art for AuditSpec.

## Machine-readable disposition

Every source fact receives exactly one disposition:

- `preserved` - current AuditSpec semantics can represent the fact without changing its meaning;
- `partial` - useful information can be retained, but some protocol-specific semantics or provenance is missing;
- `not_represented` - current AuditSpec has no defined semantic projection for the fact;
- `unknown` - available evidence is insufficient to decide the fact.

A `preserved` fact must name its AuditSpec target. Partial/lost/unknown facts must explain why. This prevents research notes from silently treating "we could put it in metadata" as semantic interoperability.

## Executable analyzer

The TypeScript reference provides:

`analyzeAgentChainFixture(...)`

from:

`implementations/typescript/src/agent-chain-fixtures.ts`

The analyzer validates fixture discipline, produces summary counts, and can execute an assurance scenario through the existing monotonic attenuation evaluator.

## Current information-loss summary

### OAuth Identity Chaining

AuditSpec currently preserves the target authorization-server audience cleanly. Subject identity, scopes, trust-domain verification, and grant validation are partially representable. The major missing semantic is per-claim transcription lineage: AuditSpec can preserve the resulting assertion but cannot yet explain exactly how an authorization server translated, removed, or downscoped each claim across the domain boundary.

### Transaction Tokens

AuditSpec can preserve the trust-domain audience directly and retain much of the remaining material as correlation, authorization context, actor/evidence provenance, origin, or extensions. However, it does not yet have dedicated executable semantics for `txn` replay/single-use state, `req_wl` workload-chain behavior, or replacement-token immutability/scope-subset rules.

### Transaction Tokens For Agents

This fixture is the strongest fit with the current AuditSpec direction. Actor/delegation concepts and monotonic assurance are directly aligned. `agentic_ctx.current_actor`, `originator`, workload chain, and deployment-specific posture remain partial because no dedicated `agentic_ctx` mapping exists. The token-supplied hop counter remains intentionally unrepresented rather than being treated as a trusted graph length.

The fixture also executes this realistic chain:

```text
external originator       self_reported
        |
        v
internal agent            authoritative locally
        |
        v
authorization service     authoritative locally
        |
        v
execution service         authoritative locally

database commit           authoritative independently
```

Expected effective assurance:

```text
external originator       self_reported
internal agent            self_reported
authorization             self_reported
execution                 self_reported

database commit           authoritative
```

The database fact remains authoritative because it does not semantically depend on the weak actor assertion. The actor-dependent chain cannot launder the weak originator into stronger identity assurance.

## Guardrail

These fixtures are research mappings, not claims that AuditSpec implements or conforms to the source protocols.

A source specification can evolve. When its revision changes, the corresponding fixture should be reviewed and versioned rather than silently reinterpreted.
