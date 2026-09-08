import type { JsonPrimitive } from "./types.js";
import type {
  CorroborationRelation,
  RuntimeEvidenceCoverage,
  RuntimeEvidenceKind,
  RuntimeEvidenceRecord,
  RuntimeEvidenceState,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";
import { assertRuntimeEvidenceRecord } from "./validate.js";

export interface OpenTelemetryRuntimeSignal {
  signal: "span" | "log";
  observed_at: string;
  name: string;
  trace_id?: string;
  span_id?: string;
  resource?: Record<string, JsonPrimitive>;
  attributes: Record<string, JsonPrimitive>;
}

export interface OpenTelemetryRuntimeProducerOptions {
  producer_name?: string;
  producer_version?: string;
  trust?: RuntimeEvidenceTrust;
  coverage?: RuntimeEvidenceCoverage;
  state?: RuntimeEvidenceState;
  kind?: RuntimeEvidenceKind;
  assessment_relation?: CorroborationRelation;
  detail?: string;
}

function stringAttribute(
  attributes: Record<string, JsonPrimitive>,
  name: string,
): string | undefined {
  const value = attributes[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function evidenceId(signal: OpenTelemetryRuntimeSignal): string {
  const explicit = stringAttribute(signal.attributes, "auditspec.evidence.id");
  if (explicit) return explicit;

  const correlation = [signal.trace_id, signal.span_id, signal.name]
    .filter((value): value is string => Boolean(value))
    .join(":");
  if (!correlation) {
    throw new TypeError(
      "OpenTelemetry runtime evidence requires auditspec.evidence.id or stable trace/span/name identity",
    );
  }
  return `otel:${correlation}`;
}

function explicitAssessmentRelation(
  signal: OpenTelemetryRuntimeSignal,
  options: OpenTelemetryRuntimeProducerOptions,
  findingFingerprint: string | undefined,
): CorroborationRelation | undefined {
  const attribute = stringAttribute(signal.attributes, "auditspec.assessment.relation");
  if (
    attribute !== undefined &&
    attribute !== "supports" &&
    attribute !== "contradicts" &&
    attribute !== "inconclusive"
  ) {
    throw new TypeError(
      "auditspec.assessment.relation must be supports, contradicts, or inconclusive",
    );
  }

  const relation = options.assessment_relation ?? (attribute as CorroborationRelation | undefined);
  if (findingFingerprint && !relation) {
    throw new TypeError(
      "OpenTelemetry evidence targeting a finding requires explicit assessment_relation",
    );
  }
  if (relation && !findingFingerprint) {
    throw new TypeError(
      "OpenTelemetry assessment_relation requires auditspec.finding.fingerprint",
    );
  }
  return relation;
}

export function runtimeEvidenceFromOpenTelemetry(
  signal: OpenTelemetryRuntimeSignal,
  options: OpenTelemetryRuntimeProducerOptions = {},
): RuntimeEvidenceRecord {
  const boundaryFingerprint = stringAttribute(
    signal.attributes,
    "auditspec.boundary.fingerprint",
  );
  const findingFingerprint = stringAttribute(
    signal.attributes,
    "auditspec.finding.fingerprint",
  );

  if (!boundaryFingerprint && !findingFingerprint) {
    throw new TypeError(
      "OpenTelemetry runtime evidence requires an explicit auditspec.boundary.fingerprint or auditspec.finding.fingerprint attribute",
    );
  }

  const assessmentRelation = explicitAssessmentRelation(signal, options, findingFingerprint);
  const eventSource = stringAttribute(signal.attributes, "auditspec.event.source");
  const eventId = stringAttribute(signal.attributes, "auditspec.event.id");
  const requestId = stringAttribute(signal.attributes, "auditspec.request.id");
  const sessionId = stringAttribute(signal.attributes, "auditspec.session.id");
  const toolCallId = stringAttribute(signal.attributes, "auditspec.tool_call.id");
  const serviceName = stringAttribute(signal.resource ?? {}, "service.name");
  const serviceVersion = stringAttribute(signal.resource ?? {}, "service.version");
  const serviceInstance = stringAttribute(signal.resource ?? {}, "service.instance.id");

  const correlation = Object.fromEntries(
    Object.entries({
      trace_id: signal.trace_id,
      span_id: signal.span_id,
      request_id: requestId,
      session_id: sessionId,
      tool_call_id: toolCallId,
      event_source: eventSource,
      event_id: eventId,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );

  const record: RuntimeEvidenceRecord = {
    record_version: "0.1",
    id: evidenceId(signal),
    kind: options.kind ?? "trace_span",
    producer: {
      name: options.producer_name ?? serviceName ?? "opentelemetry",
      type: "collector",
      ...(options.producer_version ?? serviceVersion
        ? { version: options.producer_version ?? serviceVersion }
        : {}),
      ...(serviceInstance ? { instance: serviceInstance } : {}),
    },
    trust: options.trust ?? "attributed",
    observed_at: signal.observed_at,
    targets: {
      ...(boundaryFingerprint ? { boundary_fingerprint: boundaryFingerprint } : {}),
      ...(findingFingerprint ? { finding_fingerprint: findingFingerprint } : {}),
    },
    ...(assessmentRelation ? { assessment_relation: assessmentRelation } : {}),
    ...(Object.keys(correlation).length > 0 ? { correlation } : {}),
    observation: {
      state: options.state ?? "observed",
      coverage: options.coverage ?? "point",
      detail:
        options.detail ??
        `OpenTelemetry ${signal.signal} ${signal.name} explicitly targeted this AuditSpec fingerprint.`,
    },
    metadata: {
      opentelemetry_signal: signal.signal,
      opentelemetry_name: signal.name,
    },
    limitations: [
      "OpenTelemetry evidence is attributed telemetry unless a stronger producer trust relationship is established independently.",
      "A single OpenTelemetry signal defaults to point coverage and does not establish exhaustive runtime coverage.",
      "The producer requires an explicit AuditSpec fingerprint attribute and does not infer source boundaries from span names.",
      "Evidence targeting a finding requires an explicit assessment relation because observation state alone does not determine whether a finding is supported or contradicted.",
    ],
  };

  assertRuntimeEvidenceRecord(record);
  return record;
}
