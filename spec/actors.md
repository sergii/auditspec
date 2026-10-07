# Actors and delegation

AuditSpec separates the **immediate actor** from principals connected through delegation, impersonation, or assumed authority.

`actor` is always the entity that directly caused the audited operation. An AI agent acting for a user remains `type: agent`; a service remains a service; an API key remains an API key. Historical readability may be preserved with minimized display snapshots.

Delegation is modeled separately as an ordered chain:

```json
{
  "actor": { "type": "agent", "id": "agent_child" },
  "delegation": [
    {
      "relationship": "delegated_by",
      "principal": { "type": "agent", "id": "agent_parent" }
    },
    {
      "relationship": "on_behalf_of",
      "principal": { "type": "user", "id": "usr_42" }
    }
  ]
}
```

The first delegation entry is nearest to the immediate actor. Later entries extend the responsibility chain outward.

For impersonation, keep the operator as the immediate actor and represent the impersonated identity as the delegation principal. Preserve a safe reason/reference when available.

This model is intentionally compatible in spirit with provenance systems such as W3C PROV, where agents may act on behalf of other agents without losing the identity of the responsible participants.


## OAuth 2.0 Token Exchange mapping notes

RFC 8693 is useful prior art for AuditSpec because it distinguishes the subject a token is about from the party currently acting with delegated authority.

The mapping is intentionally conservative:

| RFC 8693 concept | AuditSpec interpretation |
| --- | --- |
| top-level `sub` | represented subject/principal; may become the outer delegation principal when the token is known to carry delegation semantics |
| outermost `act` | immediate `actor` |
| nested `act` | prior actors in delegation history; nearest prior actor maps first in AuditSpec's ordered delegation chain |
| `may_act` | evidence that a party is authorized to become an actor; it does not mean the party actually acted |
| `scope` | delegated capability context; may support `authorization.scopes` but does not by itself prove an allow decision for a concrete action |
| `aud` / requested resource | token applicability boundary; not automatically an AuditSpec action `target` |
| `client_id` | OAuth client identity; not automatically the immediate actor |

RFC 8693 says the outermost `act` is the current actor and nested `act` values are prior actors. That ordering aligns naturally with AuditSpec's nearest-first delegation chain.

Do not infer stronger facts than the token and its verification context support. In particular, `may_act` is authorization-to-act rather than evidence-of-action, and an unverified JWT or copied claim set is not authoritative evidence of identity or delegation.

A token exchange can also be audited as its own semantic action when the exchange itself is security-relevant. The resulting token's actor/delegation claims and the later business action are separate facts.
