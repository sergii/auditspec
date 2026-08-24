export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface DisplaySnapshot {
  name?: string;
  label?: string;
  email?: string;
}

export interface EntityRef {
  type: string;
  id: string;
  display?: DisplaySnapshot;
  metadata?: JsonObject;
}

export interface RelatedEntity extends EntityRef {
  role?: string;
}

export type ActorType = "user" | "agent" | "service" | "api_key" | "system" | "automation";

export interface Actor extends EntityRef {
  type: ActorType;
}

export interface Delegation {
  relationship: "on_behalf_of" | "delegated_by" | "impersonation" | "assumed_role";
  principal: EntityRef;
  reason?: string;
  reference?: string;
}

export interface Authorization {
  decision: "allowed" | "denied" | "not_applicable" | "unknown";
  reason?: string;
  scopes?: string[];
  policy?: {
    id: string;
    version?: string | number;
  };
}

export interface ExecutionResult {
  status: "succeeded" | "failed" | "partial" | "unknown" | "not_executed";
  code?: string;
  reason?: string;
}

export interface Changes {
  fields?: string[];
  before?: JsonObject;
  after?: JsonObject;
}

export interface Redaction {
  path: string;
  method: "omitted" | "redacted" | "hashed" | "tokenized" | "encrypted";
  reason: string;
}

export interface Producer {
  name: string;
  version?: string;
  build?: string;
  instance?: string;
}

export interface Origin {
  surface?: string;
  service?: Producer;
  client?: {
    ip?: string;
    user_agent?: string;
    sdk?: string;
  };
  location?: {
    region?: string;
    zone?: string;
    host?: string;
  };
}

export interface Correlation {
  request_id?: string;
  trace_id?: string;
  span_id?: string;
  interaction_id?: string;
  session_id?: string;
  turn_id?: string;
  tool_call_id?: string;
  causation_id?: string;
  parent_event_id?: string;
}

export interface Digest {
  algorithm: string;
  value: string;
}

export interface Evidence {
  kind: string;
  producer: Producer;
  trust: "authoritative" | "attributed" | "self_reported" | "derived";
  ref?: string;
  observed_at?: string;
  digest?: Digest;
  metadata?: JsonObject;
}

export interface Ordering {
  stream_id: string;
  sequence: number;
}

export interface Extension {
  schema: string;
  data: JsonValue;
}

export interface AuditEvent {
  spec_version: "0.1";
  id: string;
  source: string;
  idempotency_key?: string;
  tenant?: EntityRef;
  actor: Actor;
  delegation?: Delegation[];
  action: string;
  action_version?: number;
  action_schema?: string;
  targets?: RelatedEntity[];
  subjects?: RelatedEntity[];
  authorization?: Authorization;
  result: ExecutionResult;
  changes?: Changes;
  redactions?: Redaction[];
  producer?: Producer;
  origin?: Origin;
  correlation?: Correlation;
  evidence?: Evidence[];
  ordering?: Ordering;
  extensions?: Record<string, Extension>;
  metadata?: JsonObject;
  occurred_at: string;
  recorded_at: string;
}
