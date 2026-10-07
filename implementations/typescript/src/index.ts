export {
  AUDITSPEC_CORE_SPEC_VERSION,
  AUDITSPEC_REFERENCE_VERSION,
  AUDITSPEC_RELEASE_LINE,
} from "./version.js";

export type {
  Actor,
  ActorType,
  AuditEvent,
  Authorization,
  Changes,
  Correlation,
  Delegation,
  Digest,
  DisplaySnapshot,
  EntityRef,
  Evidence,
  ExecutionResult,
  Extension,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  Ordering,
  Origin,
  Producer,
  Redaction,
  RelatedEntity,
} from "./types.js";

export {
  assertAuditEvent,
  assertConformanceCorpusReport,
  validateAuditEvent,
  validateConformanceCorpusReport,
} from "./validate.js";
export type {
  ValidationIssue,
  ValidationResult,
} from "./validate.js";

export { normalizeAuditEvent } from "./normalize.js";

export {
  DEFAULT_SECRET_KEYS,
  redactAuditEvent,
} from "./redact.js";
export type {
  RedactionMethod,
  RedactionPolicy,
} from "./redact.js";

export {
  AuditIdentityConflictError,
  InMemoryAuditDeduplicator,
  auditEventIdentity,
} from "./delivery.js";
export type {
  AuditDeliveryResult,
  AuditDeliveryStatus,
} from "./delivery.js";

export {
  fromCloudEvent,
  toCloudEvent,
} from "./cloudevents.js";
export type {
  CloudEvent,
} from "./cloudevents.js";

export {
  fromOpenTelemetryLog,
  toOpenTelemetryLog,
} from "./opentelemetry.js";
export type {
  OpenTelemetryLogProjection,
} from "./opentelemetry.js";

export {
  fromW3CProvProjection,
  toW3CProvProjection,
} from "./w3c-prov.js";
export type {
  ProvActivity,
  ProvAgent,
  ProvEntity,
  ProvRelation,
  W3CProvProjection,
} from "./w3c-prov.js";

export {
  QUICKSTART_EVENT,
  explainAuditEvent,
  formatAuditEventExplanation,
} from "./quickstart.js";
export type {
  AuditEventExplanation,
} from "./quickstart.js";

export {
  formatConformanceCorpusReport,
  runConformanceCorpus,
} from "./conformance-corpus.js";
export type {
  ConformanceCorpusFileResult,
  ConformanceCorpusReport,
} from "./conformance-corpus.js";
