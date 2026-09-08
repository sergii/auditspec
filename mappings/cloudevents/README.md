# AuditSpec ↔ CloudEvents mapping

CloudEvents is a transport/event-envelope specification. AuditSpec is a semantic audit model. They complement each other.

A recommended CloudEvents envelope for an AuditSpec event is:

| CloudEvents attribute | AuditSpec value |
| --- | --- |
| `specversion` | CloudEvents version, independent of `AuditSpec.spec_version` |
| `id` | `id` |
| `source` | `source` |
| `type` | namespaced AuditSpec action, for example `dev.auditspec.invoice.approve` |
| `subject` | primary target when a useful single subject exists |
| `time` | `occurred_at` |
| `dataschema` | `action_schema` when supplied, otherwise the AuditSpec event schema may be used by convention |
| `datacontenttype` | `application/json` |
| `data` | the complete AuditSpec event |

Example:

```json
{
  "specversion": "1.0",
  "id": "aud_01JXYZ",
  "source": "urn:example:erp",
  "type": "dev.auditspec.invoice.approve",
  "subject": "invoice/INV-0042",
  "time": "2026-08-24T15:00:00Z",
  "datacontenttype": "application/json",
  "data": {
    "spec_version": "0.1",
    "id": "aud_01JXYZ",
    "source": "urn:example:erp",
    "actor": { "type": "user", "id": "usr_42" },
    "action": "invoice.approve",
    "targets": [
      { "type": "invoice", "id": "INV-0042" }
    ],
    "result": { "status": "succeeded" },
    "occurred_at": "2026-08-24T15:00:00Z",
    "recorded_at": "2026-08-24T15:00:00.005Z"
  }
}
```

## Identity

AuditSpec intentionally aligns event identity with the CloudEvents model: `(source, id)` identifies one logical occurrence. Retries should preserve both values.

## Losslessness

The preferred mapping places the complete AuditSpec event in `data`; therefore the envelope does not need to flatten every AuditSpec field into CloudEvents extensions.

Adapters MAY add selected CloudEvents extension attributes for routing/indexing, but those attributes MUST NOT become the only copy of AuditSpec semantic data.
