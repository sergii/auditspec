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
