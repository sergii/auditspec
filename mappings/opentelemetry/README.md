# AuditSpec ↔ OpenTelemetry mapping

OpenTelemetry provides observability context and transport conventions. AuditSpec provides product-audit semantics.

The recommended integration is to represent an AuditSpec event as or alongside an OpenTelemetry Log Record while preserving the full AuditSpec payload.

The TypeScript reference implementation exposes a lossless projection:

```ts
const log = toOpenTelemetryLog(event)
const eventAgain = fromOpenTelemetryLog(log)
```

The projection deliberately keeps the complete AuditSpec event in `body`. Indexed OpenTelemetry attributes are secondary search/index hints, never the sole semantic representation.

## Recommended field mapping

| OpenTelemetry Log field | AuditSpec value |
| --- | --- |
| `Timestamp` | `occurred_at` |
| `ObservedTimestamp` | `recorded_at` |
| `TraceId` | `correlation.trace_id` |
| `SpanId` | `correlation.span_id` |
| `EventName` | `action` |
| `Body` | complete AuditSpec event |
| `Resource` | service/deployment identity derived from `source`, `producer`, and `origin` |
| `Attributes` | selected indexed AuditSpec fields, never the sole semantic representation |

Reference indexed attributes include:

```text
auditspec.id
auditspec.spec_version
auditspec.actor.type
auditspec.actor.id
auditspec.authorization.decision
auditspec.result.status
auditspec.target.type
auditspec.target.id
auditspec.tenant.id
auditspec.session.id
auditspec.tool_call.id
```

Reference resource attributes include `auditspec.source` and service identity where available.

## Correlation consistency

When W3C Trace Context/OpenTelemetry context exists, use its actual trace/span identifiers. Do not create a second unrelated audit-only trace namespace.

The reference inverse mapping rejects a Log projection when the duplicated transport context contradicts the semantic payload, including mismatched:

- `EventName` / `action`
- `Timestamp` / `occurred_at`
- `ObservedTimestamp` / `recorded_at`
- `TraceId` / `correlation.trace_id`
- `SpanId` / `correlation.span_id`
- duplicated `auditspec.*` indexed attributes

Non-AuditSpec OpenTelemetry attributes remain transport-local and may enrich the log without changing AuditSpec semantics.

## Audit is not telemetry

A span showing an HTTP request or database call does not by itself answer who authorized `invoice.approve`, on whose behalf an agent acted, or what business result occurred.

Likewise, AuditSpec should not attempt to replace performance traces, metrics, diagnostic logs, or baggage.

The two systems should correlate rather than duplicate one another.

## Runtime evidence

OpenTelemetry logs/spans may also be referenced as AuditSpec evidence. Trust depends on the producer and the specific assertion being made. A runtime span can strongly corroborate execution while still being unable to establish application-level intent by itself.

Future OTLP adapters should preserve this distinction: transport/export success does not upgrade evidence trust unless the producer and assertion justify that upgrade.
