import type {
  AssessmentBoundary,
  AssessmentConfidence,
  AssessmentFinding,
  AuditCoverageStatus,
} from "../assessment-types.js";
import type { AssurancePathEvidence } from "../assurance-graph.js";

export interface InspectorPluginInspection {
  detected: boolean;
  evidence: string[];
  boundaries: AssessmentBoundary[];
  findings: AssessmentFinding[];
  ast_failures: number;
}

export interface InspectorAssurancePolicy {
  auditStatus(boundary: AssessmentBoundary, path: AssurancePathEvidence): AuditCoverageStatus;
  entrypointKind(qualifiedName: string, boundary: AssessmentBoundary): string | null;
  reportAtomicityGapWhenAuditWithoutTransaction?: boolean;
}

export interface InspectorFrameworkPlugin {
  id: string;
  framework: string;
  confidence?: AssessmentConfidence;
  inspect(root: string): Promise<InspectorPluginInspection>;
  assurance?: InspectorAssurancePolicy;
}
