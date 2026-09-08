import { createHash } from "node:crypto";
import { diffAssessments } from "./assessment-diff.js";
import type { AssessmentFinding, AssessmentReport, SourceLocation } from "./assessment-types.js";

export type RemediationActionKind =
  | "code_change"
  | "test"
  | "config"
  | "documentation"
  | "runtime_verification";

export interface RemediationAction {
  id: string;
  kind: RemediationActionKind;
  summary: string;
  rationale: string;
  acceptance_criteria: string[];
  files?: string[];
}

export interface RemediationPlanItem {
  finding_fingerprint: string;
  rule_id: string;
  title: string;
  confidence: AssessmentFinding["confidence"];
  location: SourceLocation;
  actions: RemediationAction[];
  verification: {
    expected_fingerprint_absent: true;
    notes?: string;
  };
}

export interface RemediationPlan {
  plan_version: "0.1";
  generated_at: string;
  subject: {
    path: string;
    revision?: string;
  };
  source_assessment: {
    generated_at: string;
    inspector: string;
  };
  items: RemediationPlanItem[];
  metadata?: Record<string, unknown>;
}

export interface VerificationFindingSummary {
  fingerprint: string;
  rule_id: string;
  title: string;
  severity: AssessmentFinding["severity"];
  confidence: AssessmentFinding["confidence"];
  location: SourceLocation;
}

export interface RemediationVerificationResult {
  verification_version: "0.1";
  generated_at: string;
  status: "verified" | "partial" | "not_verified";
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
  requested_fingerprints: string[];
  resolved_fingerprints: string[];
  still_open_fingerprints: string[];
  new_findings: VerificationFindingSummary[];
  coverage: {
    base: number;
    head: number;
    delta: number;
  };
  evidence_scope: {
    kind: "assessment_diff";
    statement: string;
  };
  metadata?: Record<string, unknown>;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`;
}

function action(
  finding: AssessmentFinding,
  index: number,
  kind: RemediationActionKind,
  summary: string,
  rationale: string,
  acceptanceCriteria: string[],
): RemediationAction {
  return {
    id: stableId("action", `${finding.fingerprint}:${index}:${kind}:${summary}`),
    kind,
    summary,
    rationale,
    acceptance_criteria: acceptanceCriteria,
    files: [finding.location.path],
  };
}

function actionsForFinding(finding: AssessmentFinding): RemediationAction[] {
  switch (finding.rule_id) {
    case "AS-AUDIT-001":
      return [
        action(
          finding,
          1,
          "code_change",
          "Emit a semantic AuditSpec event at the owning domain or service boundary.",
          "The discovered mutation currently lacks visible semantic audit evidence.",
          [
            "The immediate actor is preserved.",
            "Delegation is preserved when another principal is represented.",
            "The action and target semantics describe business intent rather than only CRUD.",
            "The mutation path produces durable AuditSpec evidence.",
          ],
        ),
        action(
          finding,
          2,
          "test",
          "Add an integration test for the audit side effect.",
          "A code change alone does not demonstrate that the audit event remains emitted across future refactors.",
          [
            "The test exercises the same mutation boundary.",
            "The test asserts the semantic action and actor/target identity.",
            "The test fails if audit emission is removed.",
          ],
        ),
      ];
    case "AS-ATOMIC-001":
      return [
        action(
          finding,
          1,
          "code_change",
          "Couple the business mutation and durable audit write to one reliable commit boundary.",
          "A mutation that commits without its audit record creates an omission gap.",
          [
            "When mutation and audit share a database, both commit or both roll back.",
            "When they cannot share a store, a transactional outbox or equivalent durable handoff is used.",
          ],
        ),
        action(
          finding,
          2,
          "test",
          "Add failure-injection coverage for mutation/audit atomicity.",
          "Atomicity should be verified under failure, not inferred only from the happy path.",
          [
            "Audit write failure cannot leave a committed mutation without durable audit intent.",
            "Retry does not create a second logical AuditSpec event.",
          ],
        ),
      ];
    case "AS-AUTH-001":
      return [
        action(
          finding,
          1,
          "code_change",
          "Make the authorization boundary explicit and retain the decision as audit evidence when relevant.",
          "Privileged or permission-bypassing mutations need an attributable authorization decision.",
          [
            "The authorization decision is explicit at or before the mutation boundary.",
            "Denied attempts are represented when they are security/accountability relevant.",
            "Authorization decision and execution result remain separate facts.",
          ],
        ),
        action(
          finding,
          2,
          "test",
          "Test both allowed and denied authorization paths.",
          "Only testing successful execution can hide missing denial evidence.",
          [
            "Allowed execution records the expected authorization decision when applicable.",
            "Denied execution records a denied decision and does not report business execution as succeeded.",
          ],
        ),
      ];
    default:
      return [
        action(
          finding,
          1,
          "code_change",
          finding.remediation?.summary ?? "Address the AuditSpec finding at the owning boundary.",
          "The active AuditSpec adapter reported a gap that requires explicit remediation.",
          ["The finding fingerprint is absent from a fresh assessment after the change."],
        ),
      ];
  }
}

export function planRemediation(
  assessment: AssessmentReport,
  requestedFingerprints?: string[],
): RemediationPlan {
  const requested = requestedFingerprints ? new Set(requestedFingerprints) : null;
  const findings = assessment.findings.filter(
    (finding) => finding.status === "open" && (!requested || requested.has(finding.fingerprint)),
  );

  const items = findings.map((finding) => ({
    finding_fingerprint: finding.fingerprint,
    rule_id: finding.rule_id,
    title: finding.title,
    confidence: finding.confidence,
    location: finding.location,
    actions: actionsForFinding(finding),
    verification: {
      expected_fingerprint_absent: true as const,
      notes:
        "Absence from a later assessment verifies only that the active Inspector adapters no longer detect this fingerprint; stronger runtime or manual evidence may still be required.",
    },
  }));

  return {
    plan_version: "0.1",
    generated_at: new Date().toISOString(),
    subject: {
      path: assessment.subject.path,
      ...(assessment.subject.revision ? { revision: assessment.subject.revision } : {}),
    },
    source_assessment: {
      generated_at: assessment.generated_at,
      inspector: `${assessment.inspector.name}@${assessment.inspector.version}`,
    },
    items,
    metadata: {
      requested_findings: requestedFingerprints?.length ?? assessment.findings.length,
      planned_findings: items.length,
      automatic_code_write: false,
    },
  };
}

function summarizeFinding(finding: AssessmentFinding): VerificationFindingSummary {
  return {
    fingerprint: finding.fingerprint,
    rule_id: finding.rule_id,
    title: finding.title,
    severity: finding.severity,
    confidence: finding.confidence,
    location: finding.location,
  };
}

export function verifyRemediation(
  base: AssessmentReport,
  head: AssessmentReport,
  requestedFingerprints?: string[],
): RemediationVerificationResult {
  const diff = diffAssessments(base, head);
  const requested = [
    ...new Set(
      requestedFingerprints ?? base.findings.filter((finding) => finding.status === "open").map((finding) => finding.fingerprint),
    ),
  ].sort();
  const headFingerprints = new Set(head.findings.map((finding) => finding.fingerprint));
  const resolved = requested.filter((fingerprint) => !headFingerprints.has(fingerprint));
  const stillOpen = requested.filter((fingerprint) => headFingerprints.has(fingerprint));

  let status: RemediationVerificationResult["status"] = "not_verified";
  if (requested.length === 0 || stillOpen.length === 0) status = "verified";
  else if (resolved.length > 0) status = "partial";

  return {
    verification_version: "0.1",
    generated_at: new Date().toISOString(),
    status,
    base: diff.base,
    head: diff.head,
    requested_fingerprints: requested,
    resolved_fingerprints: resolved,
    still_open_fingerprints: stillOpen,
    new_findings: head.findings
      .filter((finding) => diff.new_findings.some((candidate) => candidate.fingerprint === finding.fingerprint))
      .map(summarizeFinding),
    coverage: diff.coverage,
    evidence_scope: {
      kind: "assessment_diff",
      statement:
        "Verification compares stable finding fingerprints produced by the active AuditSpec Inspector adapters. It does not by itself prove runtime behavior, compliance, or absence of undiscovered paths.",
    },
    metadata: {
      active_adapters: head.inspector.adapters,
      resolved_count: resolved.length,
      still_open_count: stillOpen.length,
      new_findings_count: diff.new_findings.length,
    },
  };
}
