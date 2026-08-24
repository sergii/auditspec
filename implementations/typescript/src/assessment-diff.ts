import type {
  AssessmentBoundary,
  AssessmentFinding,
  AssessmentReport,
  SourceLocation,
} from "./assessment-types.js";

export interface AssessmentDiffFinding {
  fingerprint: string;
  rule_id: string;
  title: string;
  severity: AssessmentFinding["severity"];
  confidence: AssessmentFinding["confidence"];
  location: SourceLocation;
}

export interface AssessmentDiffBoundary {
  fingerprint: string;
  kind: AssessmentBoundary["kind"];
  framework?: string;
  operation: string;
  audit_status: AssessmentBoundary["audit_status"];
  confidence: AssessmentBoundary["confidence"];
  location: SourceLocation;
  reachability: NonNullable<AssessmentBoundary["reachability"]>;
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
  reachability: {
    base_reachable: number;
    head_reachable: number;
    delta: number;
    newly_reachable: AssessmentDiffBoundary[];
    no_longer_statically_reachable: AssessmentDiffBoundary[];
    unchanged_reachable: number;
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

function summarizeBoundary(boundary: AssessmentBoundary): AssessmentDiffBoundary | null {
  if (!boundary.fingerprint || !boundary.reachability) return null;
  return {
    fingerprint: boundary.fingerprint,
    kind: boundary.kind,
    ...(boundary.framework ? { framework: boundary.framework } : {}),
    operation: boundary.operation,
    audit_status: boundary.audit_status,
    confidence: boundary.confidence,
    location: boundary.location,
    reachability: boundary.reachability,
  };
}

function byFingerprint<T extends { fingerprint: string }>(a: T, b: T): number {
  return a.fingerprint.localeCompare(b.fingerprint);
}

function reachable(boundary: AssessmentBoundary | undefined): boolean {
  return boundary?.reachability?.status === "reachable";
}

function reachableCount(report: AssessmentReport): number {
  return report.reachability?.reachable_boundaries
    ?? report.boundaries.filter((boundary) => reachable(boundary)).length;
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

  const baseBoundaries = new Map(
    base.boundaries
      .filter((boundary): boundary is AssessmentBoundary & { fingerprint: string } => Boolean(boundary.fingerprint))
      .map((boundary) => [boundary.fingerprint, boundary]),
  );
  const headBoundaries = new Map(
    head.boundaries
      .filter((boundary): boundary is AssessmentBoundary & { fingerprint: string } => Boolean(boundary.fingerprint))
      .map((boundary) => [boundary.fingerprint, boundary]),
  );

  const newlyReachable = head.boundaries
    .filter((boundary) => boundary.fingerprint && reachable(boundary) && !reachable(baseBoundaries.get(boundary.fingerprint)))
    .map(summarizeBoundary)
    .filter((boundary): boundary is AssessmentDiffBoundary => boundary !== null)
    .sort(byFingerprint);

  const noLongerStaticallyReachable = base.boundaries
    .filter((boundary) => boundary.fingerprint && reachable(boundary) && !reachable(headBoundaries.get(boundary.fingerprint)))
    .map(summarizeBoundary)
    .filter((boundary): boundary is AssessmentDiffBoundary => boundary !== null)
    .sort(byFingerprint);

  const unchangedReachable = head.boundaries.filter(
    (boundary) => boundary.fingerprint && reachable(boundary) && reachable(baseBoundaries.get(boundary.fingerprint)),
  ).length;
  const baseReachable = reachableCount(base);
  const headReachable = reachableCount(head);

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
    reachability: {
      base_reachable: baseReachable,
      head_reachable: headReachable,
      delta: headReachable - baseReachable,
      newly_reachable: newlyReachable,
      no_longer_statically_reachable: noLongerStaticallyReachable,
      unchanged_reachable: unchangedReachable,
    },
  };
}
