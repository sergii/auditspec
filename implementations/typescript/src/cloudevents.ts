import { assertAuditEvent } from "./validate.js";
import type { AuditEvent } from "./types.js";

export interface CloudEvent<T = unknown> {
  specversion: "1.0";
  id: string;
  source: string;
  type: string;
  time?: string;
  subject?: string;
  dataschema?: string;
  datacontenttype: "application/json";
  auditspecversion: string;
  data: T;
}

function eventSubject(event: AuditEvent): string | undefined {
  const target = event.targets?.find((item) => item.role === "primary") ?? event.targets?.[0];
  return target ? `${target.type}/${target.id}` : undefined;
}

export function toCloudEvent(event: AuditEvent): CloudEvent<AuditEvent> {
  assertAuditEvent(event);

  return {
    specversion: "1.0",
    id: event.id,
    source: event.source,
    type: event.action,
    time: event.occurred_at,
    subject: eventSubject(event),
    dataschema: event.action_schema,
    datacontenttype: "application/json",
    auditspecversion: event.spec_version,
    data: event,
  };
}

export function fromCloudEvent(envelope: CloudEvent<unknown>): AuditEvent {
  if (envelope.specversion !== "1.0") throw new TypeError("CloudEvents specversion must be 1.0");
  if (envelope.datacontenttype !== "application/json") {
    throw new TypeError("CloudEvent datacontenttype must be application/json");
  }

  const data = envelope.data;
  assertAuditEvent(data);

  if (envelope.id !== data.id) throw new TypeError("CloudEvent id does not match AuditSpec event id");
  if (envelope.source !== data.source) throw new TypeError("CloudEvent source does not match AuditSpec source");
  if (envelope.type !== data.action) throw new TypeError("CloudEvent type does not match AuditSpec action");
  if (envelope.time !== undefined && envelope.time !== data.occurred_at) {
    throw new TypeError("CloudEvent time does not match AuditSpec occurred_at");
  }
  if (envelope.auditspecversion !== data.spec_version) {
    throw new TypeError("CloudEvent AuditSpec version does not match payload");
  }

  const expectedSubject = eventSubject(data);
  if (envelope.subject !== undefined && envelope.subject !== expectedSubject) {
    throw new TypeError("CloudEvent subject does not match AuditSpec primary target");
  }
  if (envelope.dataschema !== undefined && envelope.dataschema !== data.action_schema) {
    throw new TypeError("CloudEvent dataschema does not match AuditSpec action_schema");
  }

  return data;
}
