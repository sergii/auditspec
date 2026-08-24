import { createHash } from "node:crypto";
import type {
  AssessmentConfidence,
  AssessmentEvidence,
  AssessmentReport,
} from "./assessment-types.js";

export interface EvidenceQueryFilters {
  kind?: string;
  rule_id?: string;
  path?: string;
  confidence?: AssessmentConfidence;
  source?: "boundary" | "finding";
}

export interface EvidenceQueryItem {
  id: string;
  source: "boundary" | "finding";
  boundary_id?: string;
  finding_id?: string;
  rule_id?: string;
  confidence: AssessmentConfidence;
  evidence: AssessmentEvidence;
}

export interface EvidenceQueryResult {
  query_version: "0.1";
  generated_at: string;
  subject: AssessmentReport["subject"];
  filters: EvidenceQueryFilters;
  count: number;
  items: EvidenceQueryItem[];
}

function stableId(value: string): string {
  return `evidence_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function pathMatches(path: string | undefined, filter: string | undefined): boolean {
  if (!filter) return true;
  return path?.includes(filter) ?? false;
}

function evidenceMatches(
  evidence: AssessmentEvidence,
  filters: EvidenceQueryFilters,
): boolean {
  if (filters.kind && evidence.kind !== filters.kind) return false;
  if (!pathMatches(evidence.location?.path, filters.path)) return false;
  return true;
}

export function queryEvidence(
  assessment: AssessmentReport,
  filters: EvidenceQueryFilters = {},
): EvidenceQueryResult {
  const items: EvidenceQueryItem[] = [];

  if (!filters.source || filters.source === "boundary") {
    for (const boundary of assessment.boundaries) {
      if (filters.confidence && boundary.confidence !== filters.confidence) continue;
      for (let index = 0; index < (boundary.evidence ?? []).length; index += 1) {
        const evidence = boundary.evidence?.[index];
        if (!evidence || !evidenceMatches(evidence, filters)) continue;
        items.push({
          id: stableId(`boundary:${boundary.id}:${index}:${evidence.kind}:${evidence.detail}`),
          source: "boundary",
          boundary_id: boundary.id,
          confidence: boundary.confidence,
          evidence,
        });
      }
    }
  }

  if (!filters.source || filters.source === "finding") {
    for (const finding of assessment.findings) {
      if (filters.rule_id && finding.rule_id !== filters.rule_id) continue;
      if (filters.confidence && finding.confidence !== filters.confidence) continue;
      for (let index = 0; index < finding.evidence.length; index += 1) {
        const evidence = finding.evidence[index];
        if (!evidence || !evidenceMatches(evidence, filters)) continue;
        items.push({
          id: stableId(`finding:${finding.id}:${index}:${evidence.kind}:${evidence.detail}`),
          source: "finding",
          finding_id: finding.id,
          ...(finding.boundary_id ? { boundary_id: finding.boundary_id } : {}),
          rule_id: finding.rule_id,
          confidence: finding.confidence,
          evidence,
        });
      }
    }
  }

  items.sort((a, b) => a.id.localeCompare(b.id));

  return {
    query_version: "0.1",
    generated_at: new Date().toISOString(),
    subject: assessment.subject,
    filters,
    count: items.length,
    items,
  };
}
