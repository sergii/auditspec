import type { AuditEvent } from "./types.js";

export const QUICKSTART_EVENT: AuditEvent = {
  spec_version: "0.1",
  id: "aud_quickstart_001",
  source: "urn:example:billing-service",
  actor: {
    type: "service",
    id: "service:billing",
  },
  action: "invoice.pay",
  action_version: 1,
  targets: [
    {
      type: "invoice",
      id: "INV-0042",
      role: "primary",
    },
  ],
  authorization: {
    decision: "allowed",
    scopes: ["invoice:pay"],
    policy: {
      id: "billing-payment-policy",
      version: "1",
    },
  },
  result: {
    status: "succeeded",
  },
  producer: {
    name: "billing-service",
    version: "1.0.0",
  },
  correlation: {
    request_id: "req_quickstart_001",
    trace_id: "4bf92f3577b34da6a3ce929d0e0e4736",
  },
  evidence: [
    {
      kind: "authorization_decision",
      producer: {
        name: "billing-policy",
        version: "1.0.0",
      },
      trust: "authoritative",
    },
    {
      kind: "execution",
      producer: {
        name: "billing-service",
        version: "1.0.0",
      },
      trust: "authoritative",
    },
  ],
  occurred_at: "2026-10-07T12:00:00Z",
  recorded_at: "2026-10-07T12:00:00.005Z",
};

export interface AuditEventExplanation {
  core_spec_version: string;
  event_id: string;
  source: string;
  actor: string;
  delegation: string[];
  action: string;
  targets: string[];
  authorization: string;
  result: string;
  evidence: {
    count: number;
    kinds: string[];
    trust: Record<string, number>;
  };
  occurred_at: string;
  recorded_at: string;
}

function entityLabel(entity: {
  type: string;
  id: string;
  role?: string;
}): string {
  const base = `${entity.type}:${entity.id}`;
  return entity.role ? `${base} (${entity.role})` : base;
}

export function explainAuditEvent(event: AuditEvent): AuditEventExplanation {
  const trust: Record<string, number> = {};
  for (const item of event.evidence ?? []) {
    trust[item.trust] = (trust[item.trust] ?? 0) + 1;
  }

  return {
    core_spec_version: event.spec_version,
    event_id: event.id,
    source: event.source,
    actor: entityLabel(event.actor),
    delegation: (event.delegation ?? []).map(
      (item) =>
        `${item.relationship} -> ${entityLabel(item.principal)}`,
    ),
    action: event.action,
    targets: (event.targets ?? []).map(entityLabel),
    authorization: event.authorization?.decision ?? "not_recorded",
    result: event.result.status,
    evidence: {
      count: event.evidence?.length ?? 0,
      kinds: [...new Set((event.evidence ?? []).map((item) => item.kind))].sort(),
      trust,
    },
    occurred_at: event.occurred_at,
    recorded_at: event.recorded_at,
  };
}

export function formatAuditEventExplanation(event: AuditEvent): string {
  const explanation = explainAuditEvent(event);
  const delegation =
    explanation.delegation.length > 0
      ? explanation.delegation.join(", ")
      : "none";
  const targets =
    explanation.targets.length > 0
      ? explanation.targets.join(", ")
      : "none";
  const evidenceKinds =
    explanation.evidence.kinds.length > 0
      ? explanation.evidence.kinds.join(", ")
      : "none";

  return [
    "AuditSpec event",
    `Core: ${explanation.core_spec_version}`,
    `ID: ${explanation.event_id}`,
    `Source: ${explanation.source}`,
    `Actor: ${explanation.actor}`,
    `Delegation: ${delegation}`,
    `Action: ${explanation.action}`,
    `Targets: ${targets}`,
    `Authorization: ${explanation.authorization}`,
    `Result: ${explanation.result}`,
    `Evidence: ${explanation.evidence.count} record(s) [${evidenceKinds}]`,
    `Occurred: ${explanation.occurred_at}`,
    `Recorded: ${explanation.recorded_at}`,
    "",
  ].join("\n");
}
