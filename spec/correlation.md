# Correlation and causality

AuditSpec complements observability rather than replacing it.

Use `correlation.trace_id` and `correlation.span_id` to connect an audit event to OpenTelemetry/W3C trace context when it exists. Do not invent unrelated trace identifiers when real trace context is available.

Product and agent execution context can include:

- `request_id`
- `interaction_id`
- `session_id`
- `turn_id`
- `tool_call_id`

Causal relationships can include:

- `causation_id` - the event or command that directly caused this event.
- `parent_event_id` - a parent AuditSpec event in an event hierarchy.

These identifiers allow consumers to reconstruct request, agent, tool and service flows without pretending that wall-clock timestamps alone establish causal order.
