import { createHash } from "node:crypto";
import type { AssessmentFinding, AssessmentReport } from "./assessment-types.js";

export interface OscalFindingTargetStatus {
  state: "satisfied" | "not-satisfied";
  reason?: string;
  remarks?: string;
}

export interface OscalFindingTarget {
  type: "statement-id" | "objective-id";
  target_id: string;
  status: OscalFindingTargetStatus;
}

export interface OscalExportRequest {
  assessment_plan_href: string;
  reviewed_control_ids?: string[];
  finding_targets?: Record<string, OscalFindingTarget>;
  title?: string;
  description?: string;
  version?: string;
  start?: string;
  end?: string;
}

export interface OscalAssessmentResultsDocument {
  "assessment-results": Record<string, unknown>;
}

function uuidFrom(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function propsForFinding(finding: AssessmentFinding): Array<Record<string, string>> {
  return [
    { name: "auditspec-rule-id", ns: "https://auditspec.dev/ns", value: finding.rule_id },
    { name: "auditspec-fingerprint", ns: "https://auditspec.dev/ns", value: finding.fingerprint },
    { name: "auditspec-severity", ns: "https://auditspec.dev/ns", value: finding.severity },
    { name: "auditspec-confidence", ns: "https://auditspec.dev/ns", value: finding.confidence },
  ];
}

function observationForFinding(
  finding: AssessmentFinding,
  inspectorPartyUuid: string,
  collected: string,
): Record<string, unknown> {
  const relevantEvidence = finding.evidence.map((item) => ({
    description: item.location
      ? `${item.detail} (${item.location.path}:${item.location.line ?? 1})`
      : item.detail,
  }));

  return {
    uuid: uuidFrom(`observation:${finding.fingerprint}`),
    title: `AuditSpec ${finding.rule_id}`,
    description: finding.message,
    methods: ["EXAMINE"],
    types: ["discovery"],
    collected,
    props: propsForFinding(finding),
    origins: [
      {
        actors: [
          {
            type: "party",
            "actor-uuid": inspectorPartyUuid,
          },
        ],
      },
    ],
    ...(relevantEvidence.length > 0 ? { "relevant-evidence": relevantEvidence } : {}),
  };
}

function findingForFinding(
  finding: AssessmentFinding,
  inspectorPartyUuid: string,
  target: OscalFindingTarget,
): Record<string, unknown> {
  return {
    uuid: uuidFrom(`finding:${finding.fingerprint}`),
    title: finding.title,
    description: finding.message,
    props: propsForFinding(finding),
    origins: [
      {
        actors: [
          {
            type: "party",
            "actor-uuid": inspectorPartyUuid,
          },
        ],
      },
    ],
    target: {
      type: target.type,
      "target-id": target.target_id,
      status: {
        state: target.status.state,
        ...(target.status.reason ? { reason: target.status.reason } : {}),
        ...(target.status.remarks ? { remarks: target.status.remarks } : {}),
      },
    },
    "related-observations": [
      {
        "observation-uuid": uuidFrom(`observation:${finding.fingerprint}`),
      },
    ],
  };
}

function validateAssessmentContext(assessment: AssessmentReport, request: OscalExportRequest): {
  reviewedControlIds: string[];
  findingTargets: Record<string, OscalFindingTarget>;
} {
  if (!request.assessment_plan_href.trim()) {
    throw new TypeError("assessment_plan_href is required for OSCAL Assessment Results export");
  }
  const reviewedControlIds = request.reviewed_control_ids ?? [];
  if (reviewedControlIds.length === 0) {
    throw new TypeError("reviewed_control_ids must identify at least one caller-confirmed assessed control");
  }

  const findingTargets = request.finding_targets ?? {};
  const missingTargets = assessment.findings
    .map((finding) => finding.fingerprint)
    .filter((fingerprint) => findingTargets[fingerprint] === undefined);
  if (missingTargets.length > 0) {
    throw new TypeError(
      `OSCAL finding target/status must be supplied by the caller for: ${missingTargets.join(", ")}`,
    );
  }

  return { reviewedControlIds, findingTargets };
}

export function exportOscalAssessmentResults(
  assessment: AssessmentReport,
  request: OscalExportRequest,
): OscalAssessmentResultsDocument {
  const { reviewedControlIds, findingTargets } = validateAssessmentContext(assessment, request);

  const now = new Date().toISOString();
  const start = request.start ?? assessment.generated_at;
  const end = request.end ?? now;
  const inspectorPartyUuid = uuidFrom("auditspec-reference-inspector-party");
  const documentIdentity = `${assessment.subject.path}:${assessment.subject.revision ?? "working-tree"}:${request.assessment_plan_href}`;
  const findings = assessment.findings;

  const result: Record<string, unknown> = {
    uuid: uuidFrom(`assessment-result:${documentIdentity}`),
    title: request.title ?? "AuditSpec static assessment",
    description:
      request.description ??
      "AuditSpec Inspector observations and findings exported as OSCAL Assessment Results using caller-supplied assessment scope and finding conclusions. AuditSpec does not infer compliance or certification.",
    start,
    end,
    props: [
      {
        name: "auditspec-assessment-kind",
        ns: "https://auditspec.dev/ns",
        value: String(assessment.metadata?.assessment_kind ?? "unknown"),
      },
      {
        name: "auditspec-coverage",
        ns: "https://auditspec.dev/ns",
        value: String(assessment.coverage.audit_coverage),
      },
    ],
    "reviewed-controls": {
      "control-selections": [
        {
          "include-controls": reviewedControlIds.map((controlId) => ({
            "control-id": controlId,
          })),
        },
      ],
    },
  };

  if (findings.length > 0) {
    result.observations = findings.map((finding) =>
      observationForFinding(finding, inspectorPartyUuid, assessment.generated_at),
    );
    result.findings = findings.map((finding) =>
      findingForFinding(finding, inspectorPartyUuid, findingTargets[finding.fingerprint]!),
    );
  }

  return {
    "assessment-results": {
      uuid: uuidFrom(`assessment-results:${documentIdentity}`),
      metadata: {
        title: request.title ?? "AuditSpec assessment results",
        "last-modified": now,
        version: request.version ?? "0.1",
        "oscal-version": "1.2.3",
        parties: [
          {
            uuid: inspectorPartyUuid,
            type: "organization",
            name: "AuditSpec Inspector",
          },
        ],
      },
      "import-ap": {
        href: request.assessment_plan_href,
      },
      results: [result],
    },
  };
}
