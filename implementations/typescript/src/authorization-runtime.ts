import type {
  CorroborationRelation,
  RuntimeEvidenceCoverage,
  RuntimeEvidenceRecord,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";
import { assertRuntimeEvidenceRecord } from "./validate.js";

export type AuthorizationDecision = "allowed" | "denied";

export interface AuthorizationRuntimeDecision {
  id: string;
  observed_at: string;
  producer_name: string;
  producer_type?: "application" | "external";
  producer_version?: string;
  producer_instance?: string;
  boundary_fingerprint?: string;
  finding_fingerprint?: string;
  assessment_relation?: CorroborationRelation;
  decision: AuthorizationDecision;
  policy_id?: string;
  policy_version?: string;
  reason_code?: string;
  scopes?: string[];
  principal_id?: string;
  resource_id?: string;
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  event_source?: string;
  event_id?: string;
  coverage?: RuntimeEvidenceCoverage;
  trust?: RuntimeEvidenceTrust;
  detail?: string;
  limitations?: string[];
}

export function runtimeEvidenceFromAuthorizationDecision(
  decision: AuthorizationRuntimeDecision,
): RuntimeEvidenceRecord {
  if (!decision.boundary_fingerprint && !decision.finding_fingerprint) {
    throw new TypeError(
      "Authorization runtime evidence requires an explicit boundary_fingerprint or finding_fingerprint",
    );
  }
  if (decision.finding_fingerprint && !decision.assessment_relation) {
    throw new TypeError(
      "Authorization evidence targeting a finding requires explicit assessment_relation",
    );
  }
  if (decision.assessment_relation && !decision.finding_fingerprint) {
    throw new TypeError(
      "Authorization assessment_relation requires finding_fingerprint",
    );
  }

  const correlation = Object.fromEntries(
    Object.entries({
      trace_id: decision.trace_id,
      span_id: decision.span_id,
      request_id: decision.request_id,
      event_source: decision.event_source,
      event_id: decision.event_id,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );

  const metadata: Record<string, unknown> = {
    decision: decision.decision,
  };
  if (decision.policy_id) metadata.policy_id = decision.policy_id;
  if (decision.policy_version) metadata.policy_version = decision.policy_version;
  if (decision.reason_code) metadata.reason_code = decision.reason_code;
  if (decision.scopes && decision.scopes.length > 0) metadata.scopes = [...decision.scopes];
  if (decision.principal_id) metadata.principal_id = decision.principal_id;
  if (decision.resource_id) metadata.resource_id = decision.resource_id;

  const record: RuntimeEvidenceRecord = {
    record_version: "0.1",
    id: decision.id,
    kind: "authorization_decision",
    producer: {
      name: decision.producer_name,
      type: decision.producer_type ?? "application",
      ...(decision.producer_version ? { version: decision.producer_version } : {}),
      ...(decision.producer_instance ? { instance: decision.producer_instance } : {}),
    },
    trust: decision.trust ?? "attributed",
    observed_at: decision.observed_at,
    targets: {
      ...(decision.boundary_fingerprint
        ? { boundary_fingerprint: decision.boundary_fingerprint }
        : {}),
      ...(decision.finding_fingerprint
        ? { finding_fingerprint: decision.finding_fingerprint }
        : {}),
    },
    ...(decision.assessment_relation
      ? { assessment_relation: decision.assessment_relation }
      : {}),
    ...(Object.keys(correlation).length > 0 ? { correlation } : {}),
    observation: {
      state: "observed",
      coverage: decision.coverage ?? "point",
      detail:
        decision.detail ??
        `Authorization decision ${decision.decision} was observed at the explicit AuditSpec target.`,
    },
    metadata,
    limitations: [
      "An authorization decision proves the decision made by the identified policy/enforcement producer, not that downstream business execution necessarily followed it.",
      "Authorization evidence defaults to attributed trust. Use authoritative only when the producer directly owns and enforces the authorization decision being asserted.",
      "A single authorization decision defaults to point coverage and does not prove that every alternate path is protected by the same policy boundary.",
      "Evidence targeting a finding requires an explicit assessment relation because an observed authorization decision can support or contradict a finding depending on the finding semantics.",
      ...(decision.limitations ?? []),
    ],
  };

  assertRuntimeEvidenceRecord(record);
  return record;
}
