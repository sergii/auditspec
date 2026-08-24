import type { AssessmentReport } from "./assessment-types.js";

export type RuntimeEvidenceKind =
  | "application_execution"
  | "authorization_decision"
  | "transaction_commit"
  | "audit_persist"
  | "outbox_persist"
  | "delivery_receipt"
  | "trace_span"
  | "database_observation"
  | "kernel_observation";

export type RuntimeEvidenceTrust = "authoritative" | "attributed" | "self_reported" | "derived";
export type RuntimeEvidenceCoverage = "point" | "sampled" | "window" | "exhaustive";
export type RuntimeEvidenceState = "observed" | "not_observed" | "contradicted";
export type CorroborationRelation = "supports" | "contradicts" | "inconclusive";

export interface RuntimeEvidenceRecord {
  record_version: "0.1";
  id: string;
  kind: RuntimeEvidenceKind;
  producer: {
    name: string;
    type: "application" | "database" | "collector" | "proxy" | "kernel" | "agent" | "external";
    version?: string;
    instance?: string;
  };
  trust: RuntimeEvidenceTrust;
  observed_at: string;
  window?: { start: string; end: string };
  targets?: {
    boundary_fingerprint?: string;
    finding_fingerprint?: string;
    assurance_node_id?: string;
  };
  correlation?: Record<string, string>;
  observation: {
    state: RuntimeEvidenceState;
    coverage: RuntimeEvidenceCoverage;
    detail: string;
  };
  integrity?: { algorithm: string; value: string };
  metadata?: Record<string, unknown>;
  limitations?: string[];
}

export interface RuntimeCorroborationMatch {
  evidence_id: string;
  boundary_fingerprint?: string;
  finding_fingerprint?: string;
  relation: CorroborationRelation;
  trust: RuntimeEvidenceTrust;
  coverage: RuntimeEvidenceCoverage;
  rationale: string;
}

export interface RuntimeCorroborationReport {
  report_version: "0.1";
  assessment_subject: AssessmentReport["subject"];
  generated_at: string;
  matches: RuntimeCorroborationMatch[];
  unmatched_evidence_ids: string[];
  summary: {
    evidence_records: number;
    matched: number;
    supports: number;
    contradicts: number;
    inconclusive: number;
    unmatched: number;
  };
  limitations: string[];
}

function relationFor(record: RuntimeEvidenceRecord): { relation: CorroborationRelation; rationale: string } {
  if (record.observation.state === "observed") {
    return {
      relation: "supports",
      rationale: "The runtime producer reported the targeted fact as observed; trust and coverage remain explicit and are not converted into static coverage.",
    };
  }

  if (record.observation.state === "contradicted") {
    return {
      relation: "contradicts",
      rationale: "The runtime producer explicitly contradicted the targeted fact.",
    };
  }

  if (record.observation.coverage === "exhaustive") {
    return {
      relation: "contradicts",
      rationale: "The targeted fact was not observed under evidence explicitly declared exhaustive for its scope.",
    };
  }

  return {
    relation: "inconclusive",
    rationale: "Non-observation under point, sampled, or bounded-window evidence is not sufficient to contradict a static claim.",
  };
}

export function corroborateAssessment(
  assessment: AssessmentReport,
  evidence: RuntimeEvidenceRecord[],
  generatedAt = new Date().toISOString(),
): RuntimeCorroborationReport {
  const boundaries = new Set(assessment.boundaries.map((boundary) => boundary.fingerprint));
  const findings = new Set(assessment.findings.map((finding) => finding.fingerprint));
  const matches: RuntimeCorroborationMatch[] = [];
  const unmatched: string[] = [];

  for (const record of evidence) {
    const boundaryFingerprint = record.targets?.boundary_fingerprint;
    const findingFingerprint = record.targets?.finding_fingerprint;
    const boundaryMatch = boundaryFingerprint !== undefined && boundaries.has(boundaryFingerprint);
    const findingMatch = findingFingerprint !== undefined && findings.has(findingFingerprint);

    if (!boundaryMatch && !findingMatch) {
      unmatched.push(record.id);
      continue;
    }

    const { relation, rationale } = relationFor(record);
    matches.push({
      evidence_id: record.id,
      ...(boundaryMatch ? { boundary_fingerprint: boundaryFingerprint } : {}),
      ...(findingMatch ? { finding_fingerprint: findingFingerprint } : {}),
      relation,
      trust: record.trust,
      coverage: record.observation.coverage,
      rationale,
    });
  }

  return {
    report_version: "0.1",
    assessment_subject: assessment.subject,
    generated_at: generatedAt,
    matches,
    unmatched_evidence_ids: unmatched,
    summary: {
      evidence_records: evidence.length,
      matched: matches.length,
      supports: matches.filter((match) => match.relation === "supports").length,
      contradicts: matches.filter((match) => match.relation === "contradicts").length,
      inconclusive: matches.filter((match) => match.relation === "inconclusive").length,
      unmatched: unmatched.length,
    },
    limitations: [
      "Runtime corroboration is reported separately and does not rewrite the source Assessment Report or its static coverage score.",
      "v0.1 matches stable boundary/finding fingerprints only; trace/session correlation without an explicit target remains unmatched.",
      "Producer trust and observation coverage are preserved as evidence attributes rather than collapsed into one confidence score.",
    ],
  };
}
