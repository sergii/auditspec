import {
  compareObservationScopes,
  type ObservationComparability,
} from "./observation-scope.js";
import type {
  RuntimeCorroborationMatch,
  RuntimeCorroborationReport,
  RuntimeEvidenceCoverage,
  RuntimeEvidenceTrust,
} from "./runtime-corroboration.js";

export interface CorroborationTarget {
  type: "boundary" | "finding";
  fingerprint: string;
}

export interface ReportedContradiction {
  target: CorroborationTarget;
  evidence_ids: string[];
  trust_levels: RuntimeEvidenceTrust[];
  coverage_levels: RuntimeEvidenceCoverage[];
}

export interface RuntimeCorroborationDiff {
  diff_version: "0.1";
  subject: {
    kind: string;
    path: string;
    base_revision?: string;
    head_revision?: string;
  };
  generated_at: string;
  base_generated_at: string;
  head_generated_at: string;
  comparability: ObservationComparability;
  summary: {
    base_contradicted_targets: number;
    head_contradicted_targets: number;
    delta: number;
    newly_reported: number;
    no_longer_reported: number;
    persisting: number;
  };
  newly_reported_contradictions: ReportedContradiction[];
  no_longer_reported_contradictions: ReportedContradiction[];
  persisting_contradictions: ReportedContradiction[];
  limitations: string[];
}

function targetKeys(match: RuntimeCorroborationMatch): CorroborationTarget[] {
  const targets: CorroborationTarget[] = [];
  if (match.boundary_fingerprint) {
    targets.push({ type: "boundary", fingerprint: match.boundary_fingerprint });
  }
  if (match.finding_fingerprint) {
    targets.push({ type: "finding", fingerprint: match.finding_fingerprint });
  }
  return targets;
}

function key(target: CorroborationTarget): string {
  return `${target.type}:${target.fingerprint}`;
}

function contradictionMap(report: RuntimeCorroborationReport): Map<string, ReportedContradiction> {
  const grouped = new Map<string, ReportedContradiction>();

  for (const match of report.matches) {
    if (match.relation !== "contradicts") continue;

    for (const target of targetKeys(match)) {
      const targetKey = key(target);
      const current = grouped.get(targetKey) ?? {
        target,
        evidence_ids: [],
        trust_levels: [],
        coverage_levels: [],
      };
      if (!current.evidence_ids.includes(match.evidence_id)) current.evidence_ids.push(match.evidence_id);
      if (!current.trust_levels.includes(match.trust)) current.trust_levels.push(match.trust);
      if (!current.coverage_levels.includes(match.coverage)) current.coverage_levels.push(match.coverage);
      grouped.set(targetKey, current);
    }
  }

  for (const value of grouped.values()) {
    value.evidence_ids.sort();
    value.trust_levels.sort();
    value.coverage_levels.sort();
  }
  return grouped;
}

function select(
  keys: string[],
  map: Map<string, ReportedContradiction>,
): ReportedContradiction[] {
  return keys.sort().map((item) => map.get(item)).filter((item): item is ReportedContradiction => item !== undefined);
}

export function diffCorroborationReports(
  base: RuntimeCorroborationReport,
  head: RuntimeCorroborationReport,
  generatedAt = new Date().toISOString(),
): RuntimeCorroborationDiff {
  if (
    base.assessment_subject.kind !== head.assessment_subject.kind ||
    base.assessment_subject.path !== head.assessment_subject.path
  ) {
    throw new TypeError("Corroboration reports must describe the same assessment subject kind and path");
  }

  const comparability = compareObservationScopes(base.observation_scope, head.observation_scope);
  const baseMap = contradictionMap(base);
  const headMap = contradictionMap(head);
  const baseKeys = new Set(baseMap.keys());
  const headKeys = new Set(headMap.keys());

  const newlyReportedKeys = [...headKeys].filter((item) => !baseKeys.has(item));
  const noLongerReportedKeys = [...baseKeys].filter((item) => !headKeys.has(item));
  const persistingKeys = [...headKeys].filter((item) => baseKeys.has(item));

  return {
    diff_version: "0.1",
    subject: {
      kind: head.assessment_subject.kind,
      path: head.assessment_subject.path,
      ...(base.assessment_subject.revision
        ? { base_revision: base.assessment_subject.revision }
        : {}),
      ...(head.assessment_subject.revision
        ? { head_revision: head.assessment_subject.revision }
        : {}),
    },
    generated_at: generatedAt,
    base_generated_at: base.generated_at,
    head_generated_at: head.generated_at,
    comparability,
    summary: {
      base_contradicted_targets: baseMap.size,
      head_contradicted_targets: headMap.size,
      delta: headMap.size - baseMap.size,
      newly_reported: newlyReportedKeys.length,
      no_longer_reported: noLongerReportedKeys.length,
      persisting: persistingKeys.length,
    },
    newly_reported_contradictions: select(newlyReportedKeys, headMap),
    no_longer_reported_contradictions: select(noLongerReportedKeys, baseMap),
    persisting_contradictions: select(persistingKeys, headMap),
    limitations: [
      "This diff compares what two Corroboration Reports state; contradiction changes should be interpreted together with the explicit comparability result.",
      "A contradiction that is no longer reported is not automatically resolved, even when observation scopes are comparable; remediation still requires independent verification.",
      "Trust and coverage remain explicit evidence attributes and are not collapsed into a single runtime assurance score.",
    ],
  };
}
