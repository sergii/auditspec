import type {
  CorroborationRelation,
  RuntimeEvidenceCoverage,
  RuntimeEvidenceRecord,
  RuntimeEvidenceState,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";
import { assertRuntimeEvidenceRecord } from "./validate.js";

export interface DeliveryRuntimeReceipt {
  id: string;
  observed_at: string;
  producer_name: string;
  producer_type?: "application" | "collector" | "proxy" | "external";
  producer_version?: string;
  producer_instance?: string;
  boundary_fingerprint?: string;
  finding_fingerprint?: string;
  assessment_relation?: CorroborationRelation;
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  event_source?: string;
  event_id?: string;
  state?: RuntimeEvidenceState;
  coverage?: RuntimeEvidenceCoverage;
  trust?: RuntimeEvidenceTrust;
  detail: string;
  destination?: string;
  delivery_id?: string;
  acknowledgement_type?: string;
  limitations?: string[];
}

export function runtimeEvidenceFromDeliveryReceipt(
  receipt: DeliveryRuntimeReceipt,
): RuntimeEvidenceRecord {
  if (!receipt.boundary_fingerprint && !receipt.finding_fingerprint) {
    throw new TypeError(
      "Delivery runtime evidence requires an explicit boundary_fingerprint or finding_fingerprint",
    );
  }
  if (receipt.finding_fingerprint && !receipt.assessment_relation) {
    throw new TypeError(
      "Delivery evidence targeting a finding requires explicit assessment_relation",
    );
  }
  if (receipt.assessment_relation && !receipt.finding_fingerprint) {
    throw new TypeError(
      "Delivery assessment_relation requires finding_fingerprint",
    );
  }

  const correlation = Object.fromEntries(
    Object.entries({
      trace_id: receipt.trace_id,
      span_id: receipt.span_id,
      request_id: receipt.request_id,
      event_source: receipt.event_source,
      event_id: receipt.event_id,
    }).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
  );

  const metadata: Record<string, string> = {};
  if (receipt.destination) metadata.destination = receipt.destination;
  if (receipt.delivery_id) metadata.delivery_id = receipt.delivery_id;
  if (receipt.acknowledgement_type) {
    metadata.acknowledgement_type = receipt.acknowledgement_type;
  }

  const record: RuntimeEvidenceRecord = {
    record_version: "0.1",
    id: receipt.id,
    kind: "delivery_receipt",
    producer: {
      name: receipt.producer_name,
      type: receipt.producer_type ?? "external",
      ...(receipt.producer_version ? { version: receipt.producer_version } : {}),
      ...(receipt.producer_instance ? { instance: receipt.producer_instance } : {}),
    },
    trust: receipt.trust ?? "attributed",
    observed_at: receipt.observed_at,
    targets: {
      ...(receipt.boundary_fingerprint
        ? { boundary_fingerprint: receipt.boundary_fingerprint }
        : {}),
      ...(receipt.finding_fingerprint
        ? { finding_fingerprint: receipt.finding_fingerprint }
        : {}),
    },
    ...(receipt.assessment_relation
      ? { assessment_relation: receipt.assessment_relation }
      : {}),
    ...(Object.keys(correlation).length > 0 ? { correlation } : {}),
    observation: {
      state: receipt.state ?? "observed",
      coverage: receipt.coverage ?? "point",
      detail: receipt.detail,
    },
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    limitations: [
      "A transport or broker acknowledgement proves only the fact represented by that acknowledgement; it does not necessarily prove end-consumer processing.",
      "Delivery evidence defaults to attributed trust. Mark it authoritative only when the receipt is produced by the system that directly owns the delivery fact being asserted.",
      "A single delivery receipt defaults to point coverage.",
      "Evidence targeting a finding requires an explicit assessment relation because delivery evidence can support or contradict different findings depending on the finding semantics.",
      ...(receipt.limitations ?? []),
    ],
  };

  assertRuntimeEvidenceRecord(record);
  return record;
}
