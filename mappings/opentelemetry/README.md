# AuditSpec ↔ OpenTelemetry mapping

OpenTelemetry provides observability context and transport conventions. AuditSpec provides product-audit semantics.

The recommended integration is to represent an AuditSpec event as or alongside an OpenTelemetry Log Record while preserving the full AuditSpec payload.

## Recommended field mapping

| OpenTelemetry Log field | AuditSpec value |
| --- | --- |
| `Timestamp` | `occurred_at` |
| `ObservedTimestamp` | `recorded_at` when appropriate |
| `TraceId` | `correlation.trace_id` |
| `SpanId` | `correlation.span_id` |
| `EventName` | `action` |
| `Body` | complete AuditSpec event or a stable reference to it |
| `Resource` | service/deployment identity derived from `source`, `producer`, and `origin` |
| `Attributes` | selected indexed AuditSpec fields, never the sole semantic representation |

## Example correlation

```json
{
  "action": "invoice.approve",
  "correlation": {
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7"
  }
}
```

When W3C Trace Context/OpenTelemetry context exists, use its actual trace/span identifiers. Do not create a second unrelated audit-only trace namespace.

## Audit is not telemetry

A span showing an HTTP request or database call does not by itself answer who authorized `invoice.approve`, on whose behalf an agent acted, or what business result occurred.

Likewise, AuditSpec should not attempt to replace performance traces, metrics, diagnostic logs, or baggage.

The two systems should correlate rather than duplicate one another.

## Runtime evidence

OpenTelemetry logs/spans may also be referenced as AuditSpec evidence. Trust depends on the producer and the specific assertion being made. A runtime span can strongly corroborate execution while still being unable to establish application-level intent by itself.
