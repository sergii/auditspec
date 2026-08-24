import type {
  RuntimeEvidenceCoverage,
  RuntimeEvidenceRecord,
  RuntimeEvidenceState,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";
import { assertRuntimeEvidenceRecord } from "./validate.js";

export type DatabaseReceiptKind = "transaction_commit" | "audit_persist" | "outbox_persist";

export interface DatabaseRuntimeReceipt {
  id: string;
  kind: DatabaseReceiptKind;
  observed_at: string;
  producer_name: string;
  producer_version?: string;
  producer_instance?: string;
  boundary_fingerprint?: string;
  finding_fingerprint?: string;
  trace_id?: string;
  span_id?: string;
  request_id?: string;
  event_source?: string;
  event_id?: string;
  state?: RuntimeEvidenceState;
  coverage?: RuntimeEvidenceCoverage;
  trust?: RuntimeEvidenceTrust;
  detail: string;
  transaction_id?: string;
  database_system?: string;
  database_name?: string;
  limitations?: string[];
}

export function runtimeEvidenceFromDatabaseReceipt(
  receipt: DatabaseRuntimeReceipt,
): RuntimeEvidenceRecord {
  if (!receipt.boundary_fingerprint && !receipt.finding_fingerprint) {
    throw new TypeError(
      "Database runtime evidence requires an explicit boundary_fingerprint or finding_fingerprint",
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
  if (receipt.transaction_id) metadata.transaction_id = receipt.transaction_id;
  if (receipt.database_system) metadata.database_system = receipt.database_system;
  if (receipt.database_name) metadata.database_name = receipt.database_name;

  const record: RuntimeEvidenceRecord = {
    record_version: "0.1",
    id: receipt.id,
    kind: receipt.kind,
    producer: {
      name: receipt.producer_name,
      type: "database",
      ...(receipt.producer_version ? { version: receipt.producer_version } : {}),
      ...(receipt.producer_instance ? { instance: receipt.producer_instance } : {}),
    },
    trust: receipt.trust ?? "authoritative",
    observed_at: receipt.observed_at,
    targets: {
      ...(receipt.boundary_fingerprint
        ? { boundary_fingerprint: receipt.boundary_fingerprint }
        : {}),
      ...(receipt.finding_fingerprint
        ? { finding_fingerprint: receipt.finding_fingerprint }
        : {}),
    },
    ...(Object.keys(correlation).length > 0 ? { correlation } : {}),
    observation: {
      state: receipt.state ?? "observed",
      coverage: receipt.coverage ?? "point",
      detail: receipt.detail,
    },
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
    limitations: [
      "Database evidence is authoritative only for facts directly observed by the database-owned producer; it does not prove business intent, authorization semantics, or human accountability.",
      "A single receipt defaults to point coverage and does not establish that every possible execution follows the same persistence path.",
      ...(receipt.limitations ?? []),
    ],
  };

  assertRuntimeEvidenceRecord(record);
  return record;
}
