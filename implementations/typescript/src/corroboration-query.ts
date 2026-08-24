import type {
  CorroborationRelation,
  RuntimeCorroborationMatch,
  RuntimeCorroborationReport,
  RuntimeEvidenceCoverage,
  RuntimeEvidenceKind,
  RuntimeEvidenceTrust,
  RuntimeProducerType,
} from "./runtime-corroboration.js";

export interface CorroborationQueryFilters {
  relation?: CorroborationRelation;
  trust?: RuntimeEvidenceTrust;
  coverage?: RuntimeEvidenceCoverage;
  evidence_kind?: RuntimeEvidenceKind;
  producer_name?: string;
  producer_type?: RuntimeProducerType;
  boundary_fingerprint?: string;
  finding_fingerprint?: string;
}

export interface CorroborationQueryResult {
  query_version: "0.1";
  assessment_subject: RuntimeCorroborationReport["assessment_subject"];
  source_generated_at: string;
  filters: CorroborationQueryFilters;
  count: number;
  matches: RuntimeCorroborationMatch[];
}

function matchesFilters(match: RuntimeCorroborationMatch, filters: CorroborationQueryFilters): boolean {
  if (filters.relation && match.relation !== filters.relation) return false;
  if (filters.trust && match.trust !== filters.trust) return false;
  if (filters.coverage && match.coverage !== filters.coverage) return false;
  if (filters.evidence_kind && match.evidence_kind !== filters.evidence_kind) return false;
  if (filters.producer_name && match.producer.name !== filters.producer_name) return false;
  if (filters.producer_type && match.producer.type !== filters.producer_type) return false;
  if (
    filters.boundary_fingerprint &&
    match.boundary_fingerprint !== filters.boundary_fingerprint
  ) return false;
  if (
    filters.finding_fingerprint &&
    match.finding_fingerprint !== filters.finding_fingerprint
  ) return false;
  return true;
}

export function queryCorroboration(
  report: RuntimeCorroborationReport,
  filters: CorroborationQueryFilters = {},
): CorroborationQueryResult {
  const matches = report.matches.filter((match) => matchesFilters(match, filters));
  return {
    query_version: "0.1",
    assessment_subject: report.assessment_subject,
    source_generated_at: report.generated_at,
    filters: { ...filters },
    count: matches.length,
    matches,
  };
}
