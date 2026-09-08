# Evidence query

`query_evidence` provides a stable way for CLI, MCP and future Cloud surfaces to retrieve the evidence already present in an AuditSpec Assessment Report.

It does not perform a second scan. It queries the report as an evidence graph projection.

Filters include:

- evidence `kind`
- Inspector `rule_id`
- source path substring
- confidence
- source object (`boundary` or `finding`)

```bash
auditspec query-evidence assessment.json --rule AS-AUDIT-001 --source finding
```

The result preserves the originating boundary/finding identity and confidence so an agent can distinguish static Assessment evidence from separately collected runtime corroboration. Current runtime evidence is queried through `query-corroboration` / `auditspec.query_runtime_corroboration` and can come from the OpenTelemetry, authorization-decision, database-receipt, or delivery-receipt reference producers. Future kernel/eBPF or signed evidence producers must preserve the same provenance boundary.
