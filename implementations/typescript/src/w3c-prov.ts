import { assertAuditEvent } from "./validate.js";
import type { AuditEvent, Delegation, EntityRef, Producer, RelatedEntity } from "./types.js";

export interface ProvActivity {
  id: string;
  type: "prov:Activity";
  occurred_at: string;
  action: string;
  source: string;
}

export interface ProvAgent {
  id: string;
  type: "prov:Agent" | "prov:SoftwareAgent";
  auditspec_ref: {
    type: string;
    id: string;
  };
}

export interface ProvEntity {
  id: string;
  type: "prov:Entity";
  auditspec_ref?: {
    type: string;
    id: string;
    role?: string;
  };
  recorded_at?: string;
}

export type ProvRelation =
  | {
      type: "prov:wasAssociatedWith";
      activity: string;
      agent: string;
    }
  | {
      type: "prov:actedOnBehalfOf";
      delegate: string;
      responsible: string;
      auditspec_relationship: Delegation["relationship"];
    }
  | {
      type: "prov:used";
      activity: string;
      entity: string;
      auditspec_relation: "target" | "subject";
      auditspec_role?: string;
    }
  | {
      type: "prov:wasAttributedTo";
      entity: string;
      agent: string;
    };

export interface W3CProvProjection {
  projection_version: "0.1";
  activity: ProvActivity;
  agents: ProvAgent[];
  entities: ProvEntity[];
  relations: ProvRelation[];
  audit_record: string;
  auditspec_event: AuditEvent;
}

function refId(ref: EntityRef): string {
  return `urn:auditspec:agent:${encodeURIComponent(ref.type)}:${encodeURIComponent(ref.id)}`;
}

function entityId(ref: RelatedEntity): string {
  return `urn:auditspec:entity:${encodeURIComponent(ref.type)}:${encodeURIComponent(ref.id)}`;
}

function producerId(producer: Producer): string {
  const identity = producer.instance ?? producer.build ?? producer.version ?? "unknown";
  return `urn:auditspec:software:${encodeURIComponent(producer.name)}:${encodeURIComponent(identity)}`;
}

function activityId(event: AuditEvent): string {
  return `urn:auditspec:activity:${encodeURIComponent(event.source)}:${encodeURIComponent(event.id)}`;
}

function recordId(event: AuditEvent): string {
  return `urn:auditspec:record:${encodeURIComponent(event.source)}:${encodeURIComponent(event.id)}`;
}

function pushAgent(agents: Map<string, ProvAgent>, ref: EntityRef, software = false): string {
  const id = refId(ref);
  agents.set(id, {
    id,
    type: software ? "prov:SoftwareAgent" : "prov:Agent",
    auditspec_ref: { type: ref.type, id: ref.id },
  });
  return id;
}

function producerAgent(agents: Map<string, ProvAgent>, producer: Producer): string {
  const id = producerId(producer);
  agents.set(id, {
    id,
    type: "prov:SoftwareAgent",
    auditspec_ref: { type: "software", id: producer.name },
  });
  return id;
}

export function toW3CProvProjection(event: AuditEvent): W3CProvProjection {
  assertAuditEvent(event);

  const activity = activityId(event);
  const record = recordId(event);
  const agents = new Map<string, ProvAgent>();
  const entities = new Map<string, ProvEntity>();
  const relations: ProvRelation[] = [];

  const actor = pushAgent(agents, event.actor, event.actor.type === "agent" || event.actor.type === "service");
  relations.push({ type: "prov:wasAssociatedWith", activity, agent: actor });

  let delegate = actor;
  for (const delegation of event.delegation ?? []) {
    const responsible = pushAgent(agents, delegation.principal, delegation.principal.type === "agent" || delegation.principal.type === "service");
    relations.push({
      type: "prov:actedOnBehalfOf",
      delegate,
      responsible,
      auditspec_relationship: delegation.relationship,
    });
    delegate = responsible;
  }

  const addRelated = (item: RelatedEntity, relation: "target" | "subject") => {
    const id = entityId(item);
    entities.set(id, {
      id,
      type: "prov:Entity",
      auditspec_ref: { type: item.type, id: item.id, role: item.role },
    });
    relations.push({
      type: "prov:used",
      activity,
      entity: id,
      auditspec_relation: relation,
      auditspec_role: item.role,
    });
  };

  for (const target of event.targets ?? []) addRelated(target, "target");
  for (const subject of event.subjects ?? []) addRelated(subject, "subject");

  entities.set(record, {
    id: record,
    type: "prov:Entity",
    recorded_at: event.recorded_at,
  });

  const producer = event.producer ?? event.origin?.service;
  if (producer) {
    const software = producerAgent(agents, producer);
    relations.push({ type: "prov:wasAttributedTo", entity: record, agent: software });
  }

  return {
    projection_version: "0.1",
    activity: {
      id: activity,
      type: "prov:Activity",
      occurred_at: event.occurred_at,
      action: event.action,
      source: event.source,
    },
    agents: [...agents.values()].sort((a, b) => a.id.localeCompare(b.id)),
    entities: [...entities.values()].sort((a, b) => a.id.localeCompare(b.id)),
    relations,
    audit_record: record,
    auditspec_event: event,
  };
}

export function fromW3CProvProjection(projection: W3CProvProjection): AuditEvent {
  if (projection.projection_version !== "0.1") {
    throw new TypeError("W3C PROV projection version must be 0.1");
  }

  const event = projection.auditspec_event;
  assertAuditEvent(event);
  const expected = toW3CProvProjection(event);

  if (projection.activity.id !== expected.activity.id) {
    throw new TypeError("PROV Activity identity does not match AuditSpec event");
  }
  if (projection.activity.action !== event.action || projection.activity.source !== event.source) {
    throw new TypeError("PROV Activity semantics do not match AuditSpec event");
  }
  if (projection.activity.occurred_at !== event.occurred_at) {
    throw new TypeError("PROV Activity time does not match AuditSpec occurred_at");
  }
  if (projection.audit_record !== expected.audit_record) {
    throw new TypeError("PROV audit record identity does not match AuditSpec event");
  }

  const relationKey = (relation: ProvRelation): string => JSON.stringify(relation);
  const actualRelations = new Set(projection.relations.map(relationKey));
  for (const relation of expected.relations) {
    if (!actualRelations.has(relationKey(relation))) {
      throw new TypeError(`PROV projection is missing required relation ${relation.type}`);
    }
  }

  return event;
}
