import {
  evaluateAssuranceAttenuation,
  type AssuranceAssertion,
  type AssuranceStrength,
} from "./assurance-attenuation.js";

export type MappingDisposition =
  | "preserved"
  | "partial"
  | "not_represented"
  | "unknown";

export interface AgentChainSourceFact {
  id: string;
  source_path: string;
  meaning: string;
  disposition: MappingDisposition;
  auditspec_targets?: string[];
  reason?: string;
}

export interface AgentChainFixture {
  fixture_version: "0.1";
  id: string;
  source: {
    name: string;
    revision: string;
    status: string;
    url: string;
  };
  scenario: string;
  facts: AgentChainSourceFact[];
  assurance_scenario?: {
    assertions: AssuranceAssertion[];
    expected_effective_strengths: Record<string, AssuranceStrength>;
  };
}

export interface AgentChainInformationLossReport {
  report_version: "0.1";
  fixture_id: string;
  source: AgentChainFixture["source"];
  summary: {
    source_facts: number;
    preserved: number;
    partial: number;
    not_represented: number;
    unknown: number;
  };
  facts: AgentChainSourceFact[];
  invariant_violations: string[];
  assurance?: {
    expected_effective_strengths: Record<string, AssuranceStrength>;
    actual_effective_strengths: Record<string, AssuranceStrength>;
    matches_expectation: boolean;
  };
}

function validateFact(fact: AgentChainSourceFact): string[] {
  const violations: string[] = [];
  const targets = fact.auditspec_targets ?? [];

  if (fact.disposition === "preserved" && targets.length === 0) {
    violations.push(
      `${fact.id}: preserved facts require at least one explicit AuditSpec target`,
    );
  }

  if (
    (fact.disposition === "partial" ||
      fact.disposition === "not_represented" ||
      fact.disposition === "unknown") &&
    !fact.reason
  ) {
    violations.push(
      `${fact.id}: ${fact.disposition} facts require an explicit reason`,
    );
  }

  if (fact.disposition === "not_represented" && targets.length > 0) {
    violations.push(
      `${fact.id}: not_represented facts cannot claim AuditSpec targets`,
    );
  }

  return violations;
}

export function analyzeAgentChainFixture(
  fixture: AgentChainFixture,
): AgentChainInformationLossReport {
  const ids = new Set<string>();
  const invariantViolations: string[] = [];

  for (const fact of fixture.facts) {
    if (ids.has(fact.id)) {
      invariantViolations.push(`${fact.id}: duplicate source-fact id`);
    }
    ids.add(fact.id);
    invariantViolations.push(...validateFact(fact));
  }

  let assurance: AgentChainInformationLossReport["assurance"];

  if (fixture.assurance_scenario) {
    const evaluated = evaluateAssuranceAttenuation(
      fixture.assurance_scenario.assertions,
    );
    const actual = Object.fromEntries(
      evaluated.assertions.map((assertion) => [
        assertion.id,
        assertion.effective_strength,
      ]),
    ) as Record<string, AssuranceStrength>;

    const expected = fixture.assurance_scenario.expected_effective_strengths;
    const expectedIds = Object.keys(expected).sort();
    const actualExpectedSubset = Object.fromEntries(
      expectedIds.map((id) => [id, actual[id]]),
    );

    const matches =
      expectedIds.every((id) => actual[id] === expected[id]) &&
      Object.values(actualExpectedSubset).every((value) => value !== undefined);

    if (!matches) {
      invariantViolations.push(
        "assurance_scenario: effective strengths do not match fixture expectations",
      );
    }

    assurance = {
      expected_effective_strengths: { ...expected },
      actual_effective_strengths: actual,
      matches_expectation: matches,
    };
  }

  const count = (disposition: MappingDisposition) =>
    fixture.facts.filter((fact) => fact.disposition === disposition).length;

  return {
    report_version: "0.1",
    fixture_id: fixture.id,
    source: { ...fixture.source },
    summary: {
      source_facts: fixture.facts.length,
      preserved: count("preserved"),
      partial: count("partial"),
      not_represented: count("not_represented"),
      unknown: count("unknown"),
    },
    facts: fixture.facts.map((fact) => ({
      ...fact,
      ...(fact.auditspec_targets
        ? { auditspec_targets: [...fact.auditspec_targets] }
        : {}),
    })),
    invariant_violations: invariantViolations,
    ...(assurance ? { assurance } : {}),
  };
}
