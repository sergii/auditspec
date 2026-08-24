import { assertAuditEvent } from "./validate.js";
import type { AuditEvent, JsonPrimitive } from "./types.js";

export interface OpenTelemetryLogProjection {
  timestamp: string;
  observed_timestamp: string;
  event_name: string;
  trace_id?: string;
  span_id?: string;
  body: AuditEvent;
  resource: Record<string, JsonPrimitive>;
  attributes: Record<string, JsonPrimitive>;
}

function primaryTarget(event: AuditEvent) {
  return event.targets?.find((target) => target.role === "primary") ?? event.targets?.[0];
}

function compact(values: Record<string, JsonPrimitive | undefined>): Record<string, JsonPrimitive> {
  return Object.fromEntries(
    Object.entries(values).filter((entry): entry is [string, JsonPrimitive] => entry[1] !== undefined),
  );
}

export function toOpenTelemetryLog(event: AuditEvent): OpenTelemetryLogProjection {
  assertAuditEvent(event);
  const target = primaryTarget(event);
  const service = event.origin?.service ?? event.producer;

  return {
    timestamp: event.occurred_at,
    observed_timestamp: event.recorded_at,
    event_name: event.action,
    trace_id: event.correlation?.trace_id,
    span_id: event.correlation?.span_id,
    body: event,
    resource: compact({
      "auditspec.source": event.source,
      "service.name": service?.name,
      "service.version": service?.version,
      "service.instance.id": service?.instance,
      "deployment.environment": event.origin?.location?.region,
    }),
    attributes: compact({
      "auditspec.id": event.id,
      "auditspec.spec_version": event.spec_version,
      "auditspec.actor.type": event.actor.type,
      "auditspec.actor.id": event.actor.id,
      "auditspec.authorization.decision": event.authorization?.decision,
      "auditspec.result.status": event.result.status,
      "auditspec.target.type": target?.type,
      "auditspec.target.id": target?.id,
      "auditspec.tenant.id": event.tenant?.id,
      "auditspec.session.id": event.correlation?.session_id,
      "auditspec.tool_call.id": event.correlation?.tool_call_id,
    }),
  };
}

export function fromOpenTelemetryLog(log: OpenTelemetryLogProjection): AuditEvent {
  const event = log.body;
  assertAuditEvent(event);

  if (log.event_name !== event.action) {
    throw new TypeError("OpenTelemetry EventName does not match AuditSpec action");
  }
  if (log.timestamp !== event.occurred_at) {
    throw new TypeError("OpenTelemetry Timestamp does not match AuditSpec occurred_at");
  }
  if (log.observed_timestamp !== event.recorded_at) {
    throw new TypeError("OpenTelemetry ObservedTimestamp does not match AuditSpec recorded_at");
  }
  if (log.trace_id !== undefined && log.trace_id !== event.correlation?.trace_id) {
    throw new TypeError("OpenTelemetry TraceId does not match AuditSpec correlation.trace_id");
  }
  if (log.span_id !== undefined && log.span_id !== event.correlation?.span_id) {
    throw new TypeError("OpenTelemetry SpanId does not match AuditSpec correlation.span_id");
  }

  const expectedAttributes = toOpenTelemetryLog(event).attributes;
  for (const [key, value] of Object.entries(log.attributes)) {
    if (key.startsWith("auditspec.") && key in expectedAttributes && expectedAttributes[key] !== value) {
      throw new TypeError(`OpenTelemetry attribute ${key} does not match AuditSpec payload`);
    }
  }

  return event;
}
