export type AssuranceStrength =
  | "unknown"
  | "self_reported"
  | "attributed"
  | "authoritative";

export type AssuranceAssertionKind =
  | "actor_identity"
  | "represented_principal"
  | "delegation"
  | "request_authenticity"
  | "authorization"
  | "execution"
  | "persistence"
  | "custom";

export interface AssuranceAssertion {
  id: string;
  kind: AssuranceAssertionKind;
  intrinsic_strength: AssuranceStrength;
  depends_on?: string[];
  producer?: {
    name: string;
    authority_scope?: string[];
  };
  detail?: string;
}

export interface EvaluatedAssuranceAssertion extends AssuranceAssertion {
  effective_strength: AssuranceStrength;
  weakened: boolean;
  limiting_dependencies: string[];
  issues: Array<{
    code: "missing_dependency" | "dependency_cycle";
    dependency_id?: string;
    message: string;
  }>;
}

export interface AssuranceAttenuationResult {
  result_version: "0.1";
  assertions: EvaluatedAssuranceAssertion[];
  summary: {
    total: number;
    weakened: number;
    unknown: number;
  };
}

const rank: Record<AssuranceStrength, number> = {
  unknown: 0,
  self_reported: 1,
  attributed: 2,
  authoritative: 3,
};

function weaker(
  left: AssuranceStrength,
  right: AssuranceStrength,
): AssuranceStrength {
  return rank[left] <= rank[right] ? left : right;
}

export function evaluateAssuranceAttenuation(
  assertions: AssuranceAssertion[],
): AssuranceAttenuationResult {
  const byId = new Map<string, AssuranceAssertion>();
  for (const assertion of assertions) {
    if (byId.has(assertion.id)) {
      throw new TypeError(`Duplicate assurance assertion id: ${assertion.id}`);
    }
    byId.set(assertion.id, assertion);
  }

  const cache = new Map<string, EvaluatedAssuranceAssertion>();
  const active = new Set<string>();

  function evaluate(id: string): EvaluatedAssuranceAssertion {
    const cached = cache.get(id);
    if (cached) return cached;

    const assertion = byId.get(id);
    if (!assertion) {
      throw new TypeError(`Unknown assurance assertion: ${id}`);
    }

    if (active.has(id)) {
      const cycle: EvaluatedAssuranceAssertion = {
        ...assertion,
        effective_strength: "unknown",
        weakened: assertion.intrinsic_strength !== "unknown",
        limiting_dependencies: [...(assertion.depends_on ?? [])],
        issues: [
          {
            code: "dependency_cycle",
            message: "Cyclic assurance dependencies fail closed to unknown.",
          },
        ],
      };
      cache.set(id, cycle);
      return cycle;
    }

    active.add(id);

    let effective = assertion.intrinsic_strength;
    const limiting = new Set<string>();
    const issues: EvaluatedAssuranceAssertion["issues"] = [];

    for (const dependencyId of assertion.depends_on ?? []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        effective = "unknown";
        limiting.add(dependencyId);
        issues.push({
          code: "missing_dependency",
          dependency_id: dependencyId,
          message:
            "A missing assurance dependency prevents the dependent assertion from retaining stronger assurance.",
        });
        continue;
      }

      if (active.has(dependencyId)) {
        effective = "unknown";
        limiting.add(dependencyId);
        issues.push({
          code: "dependency_cycle",
          dependency_id: dependencyId,
          message:
            "A cyclic assurance dependency prevents trust amplification and fails closed to unknown.",
        });
        continue;
      }

      const evaluatedDependency = evaluate(dependencyId);
      const next = weaker(effective, evaluatedDependency.effective_strength);
      if (next !== effective || evaluatedDependency.effective_strength === effective) {
        if (rank[evaluatedDependency.effective_strength] <= rank[effective]) {
          limiting.add(dependencyId);
        }
      }
      effective = next;

      for (const issue of evaluatedDependency.issues) {
        if (issue.code === "dependency_cycle") {
          effective = "unknown";
          limiting.add(dependencyId);
        }
      }
    }

    active.delete(id);

    const result: EvaluatedAssuranceAssertion = {
      ...assertion,
      ...(assertion.depends_on ? { depends_on: [...assertion.depends_on] } : {}),
      effective_strength: effective,
      weakened: rank[effective] < rank[assertion.intrinsic_strength],
      limiting_dependencies: [...limiting].sort(),
      issues,
    };

    cache.set(id, result);
    return result;
  }

  const evaluated = assertions
    .map((assertion) => evaluate(assertion.id))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    result_version: "0.1",
    assertions: evaluated,
    summary: {
      total: evaluated.length,
      weakened: evaluated.filter((assertion) => assertion.weakened).length,
      unknown: evaluated.filter(
        (assertion) => assertion.effective_strength === "unknown",
      ).length,
    },
  };
}
