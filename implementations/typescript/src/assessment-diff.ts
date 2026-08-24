import type { AssessmentFinding, AssessmentReport, SourceLocation } from "./assessment-types.js";

export interface AssessmentDiffFinding {
  fingerprint: string;
  rule_id: string;
  title: string;
  severity: AssessmentFinding["severity"];
  confidence: AssessmentFinding["confidence"];
  location: SourceLocation;
}

export interface AssessmentDiff {
  diff_version: "0.1";
  generated_at: string;
  base: {
    subject_path: string;
    revision?: string;
    generated_at: string;
  };
  head: {
    subject_path: string;
    revision?: string;
    generated_at: string;
  };
  new_findings: AssessmentDiffFinding[];
  resolved_findings: AssessmentDiffFinding[];
  unchanged_findings: number;
  coverage: {
    base: number;
    head: number;
    delta: number;
  };
}

function summarize(finding: AssessmentFinding): AssessmentDiffFinding {
  return {
    fingerprint: finding.fingerprint,
    rule_id: finding.rule_id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    location: finding.location,
  };
}

function byFingerprint(a: AssessmentDiffFinding, b: AssessmentDiffFinding): number {
  return a.fingerprint.localeCompare(b.fingerprint);
}

export function diffAssessments(base: AssessmentReport, head: AssessmentReport): AssessmentDiff {
  const baseByFingerprint = new Map(base.findings.map((finding) => [finding.fingerprint, finding]));
  const headByFingerprint = new Map(head.findings.map((finding) => [finding.fingerprint, finding]));

  const newFindings = head.findings
    .filter((finding) => !baseByFingerprint.has(finding.fingerprint))
    .map(summarize)
    .sort(byFingerprint);

  const resolvedFindings = base.findings
    .filter((finding) => !headByFingerprint.has(finding.fingerprint))
    .map(summarize)
    .sort(byFingerprint);

  const unchanged = head.findings.filter((finding) => baseByFingerprint.has(finding.fingerprint)).length;

  return {
    diff_version: "0.1",
    generated_at: new Date().toISOString(),
    base: {
      subject_path: base.subject.path,
      ...(base.subject.revision ? { revision: base.subject.revision } : {}),
      generated_at: base.generated_at,
    },
    head: {
      subject_path: head.subject.path,
      ...(head.subject.revision ? { revision: head.subject.revision } : {}),
      generated_at: head.generated_at,
    },
    new_findings: newFindings,
    resolved_findings: resolvedFindings,
    unchanged_findings: unchanged,
    coverage: {
      base: base.coverage.audit_coverage,
      head: head.coverage.audit_coverage,
      delta: head.coverage.audit_coverage - base.coverage.audit_coverage,
    },
  };
}
