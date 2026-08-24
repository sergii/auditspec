export type AssessmentConfidence = "certain" | "high" | "medium" | "low";
export type FindingSeverity = "info" | "warning" | "error";
export type FindingStatus = "open" | "accepted" | "resolved" | "suppressed";
export type AuditCoverageStatus = "covered" | "partial" | "uncovered" | "unknown";
export type ReachabilityStatus = "reachable" | "unknown";

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface AssessmentEvidence {
  kind: string;
  detail: string;
  location?: SourceLocation;
}

export interface DetectedFramework {
  name: string;
  confidence: AssessmentConfidence;
  evidence?: string[];
}

export interface AssessmentEntrypoint {
  kind: string;
  qualified_name: string;
  framework?: string;
  location: SourceLocation;
}

export interface AssessmentReachability {
  status: ReachabilityStatus;
  confidence: AssessmentConfidence;
  entrypoint?: AssessmentEntrypoint;
  path?: string[];
}

export interface AssessmentBoundary {
  id: string;
  kind: "mutation" | "authorization" | "agent" | "tool" | "export" | "access";
  framework?: string;
  operation: string;
  location: SourceLocation;
  audit_status: AuditCoverageStatus;
  confidence: AssessmentConfidence;
  reachability?: AssessmentReachability;
  evidence?: AssessmentEvidence[];
}

export interface AssessmentFinding {
  id: string;
  fingerprint: string;
  rule_id: string;
  title: string;
  severity: FindingSeverity;
  confidence: AssessmentConfidence;
  status: FindingStatus;
  message: string;
  location: SourceLocation;
  boundary_id?: string;
  evidence: AssessmentEvidence[];
  remediation?: {
    summary: string;
    reference?: string;
  };
}

export interface AssessmentCoverage {
  detected_boundaries: number;
  covered_boundaries: number;
  partial_boundaries: number;
  uncovered_boundaries: number;
  unknown_boundaries: number;
  audit_coverage: number;
}

export interface AssessmentReachabilitySummary {
  reachable_boundaries: number;
  unknown_boundaries: number;
}

export interface AssessmentReport {
  report_version: "0.1";
  generated_at: string;
  subject: {
    kind: "repository";
    path: string;
    revision?: string;
  };
  inspector: {
    name: string;
    version: string;
    adapters: string[];
  };
  frameworks: DetectedFramework[];
  boundaries: AssessmentBoundary[];
  findings: AssessmentFinding[];
  coverage: AssessmentCoverage;
  reachability?: AssessmentReachabilitySummary;
  metadata?: Record<string, unknown>;
}
