# AuditSpec ↔ W3C PROV mapping

W3C PROV provides a formal model for provenance. AuditSpec provides concrete application-audit semantics. A mapping between them lets AuditSpec events participate in broader provenance graphs without replacing the AuditSpec event model.

The TypeScript reference implementation now exposes an executable, lossless graph projection:

```ts
const projection = toW3CProvProjection(event)
const eventAgain = fromW3CProvProjection(projection)
```

The projection uses standard PROV concepts while retaining the complete AuditSpec event as the semantic payload. This is deliberate: PROV is excellent for provenance relationships, but it does not replace AuditSpec authorization, execution-result, redaction, evidence-trust, or action semantics.

## Conceptual mapping

| AuditSpec | W3C PROV concept |
| --- | --- |
| AuditSpec event/action occurrence | `prov:Activity` |
| `actor` | `prov:Agent` associated with the Activity |
| delegation principal | `prov:Agent` |
| delegation chain | `prov:actedOnBehalfOf` plus preserved AuditSpec relationship kind |
| targets/subjects | `prov:Entity` referenced by `prov:used` |
| `producer` / originating service | `prov:SoftwareAgent` |
| AuditSpec record | `prov:Entity` attributed to the producing software agent |
| `occurred_at` | Activity provenance time |

## Delegation

AuditSpec:

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

projects to a responsibility chain conceptually equivalent to:

```text
agent_child  prov:actedOnBehalfOf  agent_parent
agent_parent prov:actedOnBehalfOf  usr_42
```

The reference projection retains `delegated_by`, `on_behalf_of`, `impersonation`, or `assumed_role` as `auditspec_relationship` metadata on each PROV delegation relation. This avoids losing the more precise AuditSpec relationship when projecting into the broader PROV concept.

## Activity vs audit record

An AuditSpec JSON document is a record asserting facts about an action occurrence. The reference graph therefore separates:

```text
business/action occurrence  -> prov:Activity
AuditSpec record             -> prov:Entity
producer/runtime             -> prov:SoftwareAgent
record attribution           -> prov:wasAttributedTo
```

This distinction is useful for future integrity and transparency profiles because it separates the activity being asserted from the evidence record that asserts it and the software agent that produced the record.

## Targets and subjects

Targets and subjects are represented as PROV Entities with `prov:used` relations from the Activity. AuditSpec retains whether the relationship originated as a `target` or `subject` and preserves the optional role.

The v0.1 projection intentionally does not infer `prov:wasGeneratedBy`, `prov:wasDerivedFrom`, or mutation-specific provenance from `changes`. Those relationships require stronger domain knowledge than the Core event alone provides.

## Consistency checks

The inverse mapping rejects a projection when required provenance assertions no longer agree with the embedded AuditSpec event, including:

- changed Activity identity
- changed Activity action/source/time
- changed audit-record identity
- removed actor association
- removed delegation responsibility relation
- removed target/subject use relation
- removed producer attribution when one is expected

Extra provenance relationships may coexist with the required AuditSpec projection, but they do not silently modify the embedded AuditSpec event.

## Serialization

The current executable adapter is an in-memory neutral PROV graph projection. A future serializer can emit PROV-O/JSON-LD without changing the AuditSpec mapping semantics.

Future work includes:

- an AuditSpec JSON-LD context
- PROV-O/JSON-LD serialization
- external PROV validator/interoperability fixtures
- richer derived-evidence provenance
- integration with integrity/transparency evidence profiles
