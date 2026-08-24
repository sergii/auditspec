# Correlation

AuditSpec complements observability rather than replacing it.

Use `correlation.trace_id` to connect an audit event to an OpenTelemetry trace when one exists. `request_id`, `session_id`, and `tool_call_id` preserve product and agent execution context that may not belong in the trace identifier itself.
