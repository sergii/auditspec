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
- did an authorization decision occur?
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

Runtime producer capability/policy manifests validate against:

```text
schema/runtime-producer-manifest.schema.json
```

Canonical examples live in `schema/examples/`, negative vectors live under `conformance/invalid/`, and producer manifests live under `runtime/producers/`.

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

## Boundary versus finding semantics

Boundary-target evidence can use observation state directly:

```text
observed
  -> supports

contradicted
  -> contradicts

not_observed + exhaustive
  -> contradicts

not_observed + point/sample/window
  -> inconclusive
```

Finding-target evidence is different. Observing a runtime fact does not tell AuditSpec whether the fact supports or contradicts the finding.

For example, an `AS-AUTH-001` finding may say that static analysis could not establish authorization. An authoritative runtime policy decision can therefore contradict the finding even though the runtime fact itself was `observed`.

Any Runtime Evidence Record containing `targets.finding_fingerprint` MUST therefore declare:

```json
{
  "assessment_relation": "supports | contradicts | inconclusive"
}
```

Reference producers fail closed when a finding fingerprint is supplied without this relation.

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
auditspec.list_runtime_producers
```

The MCP surface uses the same validators, producer registry and corroboration engine as the CLI/library.

## Reference runtime producers

AuditSpec v0.1 includes four reference producers. Their defaults and authority scopes are machine-readable in `runtime/producers/*.json` and independently schema-validated in CI.

### OpenTelemetry

Implementation:

```text
implementations/typescript/src/opentelemetry-runtime.ts
```

Default semantics:

```text
trust    = attributed
coverage = point
```

The producer requires an explicit `auditspec.boundary.fingerprint` or `auditspec.finding.fingerprint` attribute. It never infers an AuditSpec target from a span or log name. Trace/span IDs and selected AuditSpec correlation attributes are preserved. Finding-target telemetry additionally requires `auditspec.assessment.relation` or an equivalent explicit producer option.

### Authorization decisions

Implementation:

```text
implementations/typescript/src/authorization-runtime.ts
```

The producer preserves `allowed|denied`, optional policy id/version, reason code, scopes and selected principal/resource context. It defaults to `attributed` trust. A decision-owning enforcement boundary may explicitly declare `authoritative` trust for the authorization decision it directly owns.

An authorization decision does not prove that downstream business execution respected the decision, and one point decision does not prove that every alternate path crosses the same authorization boundary.

### Database receipts

Implementation:

```text
implementations/typescript/src/database-runtime.ts
```

Supported facts:

- `transaction_commit`
- `audit_persist`
- `outbox_persist`

A genuinely database-owned observer defaults to `authoritative` trust for those database-visible facts. That authority does not extend to user intent, authorization policy, actor accountability, or semantic correctness of an audit event.

### Delivery receipts

Implementation:

```text
implementations/typescript/src/delivery-runtime.ts
```

Delivery receipts default to `attributed` trust because a broker acknowledgement does not necessarily prove end-consumer processing. A receiver-owned durable acceptance receipt may explicitly declare `authoritative` trust for the narrow delivery fact it owns.

## Producer manifest registry

The TypeScript reference exposes a validated runtime producer registry from:

```text
implementations/typescript/src/runtime-producer-registry.ts
```

A manifest states:

- producer type
- supported evidence kinds
- default trust
- default observation coverage
- whether an explicit AuditSpec target is required
- authority scope
- allowed overrides
- limitations

This lets agents and future hosted services reason about evidence capability before ingestion instead of reverse-engineering defaults from implementation code.

## Future producers

The v0.1 evidence contract remains producer-neutral. Additional candidates include:

- reverse-proxy observations
- operating-system audit sources
- eBPF/kernel observations
- signed vendor/backend receipts

Each adapter must state what it actually observes, its trust relationship, and its coverage. Kernel proximity does not automatically imply exhaustive coverage or business-semantic authority.

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
