import type { AssessmentReport } from "./assessment-types.js";

export interface ControlMappingProfile {
  mapping_version: "0.1";
  framework: {
    id: string;
    version?: string;
    source?: string;
  };
  rules: Array<{
    rule_id: string;
    controls: Array<{
      id: string;
      relation: "relevant_evidence" | "potential_gap";
      rationale: string;
    }>;
  }>;
  caveat?: string;
}

export interface ControlMappingResult {
  result_version: "0.1";
  generated_at: string;
  framework: ControlMappingProfile["framework"];
  source_assessment: {
    subject_path: string;
    revision?: string;
    generated_at: string;
  };
  controls: Array<{
    control_id: string;
    relations: Array<{
      rule_id: string;
      relation: "relevant_evidence" | "potential_gap";
      rationale: string;
      finding_fingerprints: string[];
    }>;
  }>;
  caveat: string;
  metadata?: Record<string, unknown>;
}

export function mapAssessmentToControls(
  assessment: AssessmentReport,
  profile: ControlMappingProfile,
): ControlMappingResult {
  const controlMap = new Map<string, ControlMappingResult["controls"][number]>();

  for (const ruleMapping of profile.rules) {
    const fingerprints = assessment.findings
      .filter((finding) => finding.status === "open" && finding.rule_id === ruleMapping.rule_id)
      .map((finding) => finding.fingerprint)
      .sort();

    for (const control of ruleMapping.controls) {
      const existing = controlMap.get(control.id) ?? { control_id: control.id, relations: [] };
      existing.relations.push({
        rule_id: ruleMapping.rule_id,
        relation: control.relation,
        rationale: control.rationale,
        finding_fingerprints: fingerprints,
      });
      controlMap.set(control.id, existing);
    }
  }

  return {
    result_version: "0.1",
    generated_at: new Date().toISOString(),
    framework: profile.framework,
    source_assessment: {
      subject_path: assessment.subject.path,
      ...(assessment.subject.revision ? { revision: assessment.subject.revision } : {}),
      generated_at: assessment.generated_at,
    },
    controls: [...controlMap.values()].sort((a, b) => a.control_id.localeCompare(b.control_id)),
    caveat:
      profile.caveat ??
      "Control mappings express relevance between AuditSpec evidence/findings and external controls. They are not control assessment determinations or compliance claims.",
    metadata: {
      mapped_rules: profile.rules.length,
      open_findings: assessment.findings.filter((finding) => finding.status === "open").length,
    },
  };
}
