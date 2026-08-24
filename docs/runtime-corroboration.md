# Runtime Corroboration

AuditSpec Runtime Corroboration is a separate evidence layer that compares static Assessment Reports with observations produced at runtime.

It does **not** rewrite the static Assessment Report, silently upgrade Inspector coverage, or turn one observed execution into proof about every execution path.

## Why this layer exists

Static source analysis answers questions such as:

- which mutation boundaries exist?
- which entrypoints can reach them?
- where are authorization, transaction and audit boundaries visible in source?

Runtime evidence answers different questions:

- did a particular path execute?
- did a transaction actually commit?
- was an audit/outbox row durably persisted?
- did a delivery receipt arrive?
- did a trace span or kernel observation corroborate execution?

AuditSpec keeps these evidence classes separate and correlates them through stable fingerprints and correlation identifiers.

## Contracts

Runtime evidence records validate against:

```text
schema/runtime-evidence-record.schema.json
```

Corroboration results validate against:

```text
schema/corroboration-report.schema.json
```

Canonical examples live in `schema/examples/` and negative vectors live under `conformance/invalid/`.

## Producer trust

Runtime evidence preserves producer trust explicitly:

- `authoritative` - produced by a system that directly owns or commits the fact being observed
- `attributed` - reliably attributed to a producer, but not the authoritative owner of the fact
- `self_reported` - reported by the subject whose behavior is being assessed
- `derived` - inferred from other evidence

Trust is not collapsed into a single score.

## Observation coverage

Runtime evidence also declares observation coverage:

- `point` - one concrete observation
- `sampled` - a sample of executions
- `window` - a bounded observation window
- `exhaustive` - the producer explicitly claims complete coverage for the stated scope

This distinction is essential for non-observation.

```text
not_observed + point/sample/window
    -> inconclusive

not_observed + exhaustive
    -> contradicts
```

A bounded trace window cannot prove that an operation never executes.

## Relations

Corroboration produces only three relations:

- `supports`
- `contradicts`
- `inconclusive`

Evidence whose stable boundary/finding target is unknown to the Assessment Report remains `unmatched` rather than being attached heuristically.

## No score escalation

The following is intentionally invalid reasoning:

```text
one runtime observation
    -> static boundary is covered
    -> repository audit coverage increases
```

The correct model is:

```text
Static Assessment Report
        |
        +--------------------+
                             |
Runtime Evidence Records     |
        |                    |
        v                    v
      Corroboration Report
        |
        +--> supports
        +--> contradicts
        +--> inconclusive
```

The original Assessment Report is unchanged.

## CLI

The reference CLI accepts an Assessment Report and a JSON array of individually schema-valid Runtime Evidence Records:

```bash
auditspec corroborate assessment.json runtime-evidence.json
```

## MCP

Agents can call:

```text
auditspec.corroborate_runtime
```

with:

```json
{
  "assessment": { "...": "Assessment Report" },
  "evidence": [
    { "...": "Runtime Evidence Record" }
  ]
}
```

The MCP surface uses the same validator and corroboration engine as the CLI/library.

## Producer adapters

The v0.1 contract is deliberately producer-neutral. Candidate adapters include:

- OpenTelemetry spans and logs
- application authorization decision records
- database commit/audit/outbox receipts
- delivery acknowledgements
- reverse-proxy observations
- operating-system audit sources
- eBPF/kernel observations

Adapters must state what they actually observe, their trust relationship, and their coverage. An eBPF observation is not automatically `exhaustive`, and kernel proximity does not by itself prove business semantics such as user intent or authorization policy.

## eBPF boundary

eBPF can provide strong low-level evidence for selected system calls, network activity, process/file behavior or other kernel-visible facts. It cannot by itself prove high-level AuditSpec semantics such as:

- why an invoice was approved
- which business policy authorized the action
- whether the human-readable audit event correctly represented intent

Therefore eBPF is a potential runtime producer, not a replacement for semantic application audit events.

## Future correlation

v0.1 matches explicit stable boundary/finding fingerprints. Future profiles may safely add correlation through:

- W3C Trace Context / OpenTelemetry trace and span IDs
- request IDs
- session IDs
- agent tool-call IDs
- AuditSpec `(source, id)` event identity
- durable outbox/delivery receipt identity

Correlation must remain evidence-backed and must not invent graph edges from coincidence alone.
