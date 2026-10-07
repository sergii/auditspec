export type MandateConstraintClass = "hard" | "escalating";

export type MandateConstraint =
  | {
      id: string;
      class: MandateConstraintClass;
      path: string;
      operator: "equals";
      value: string | number | boolean | null;
    }
  | {
      id: string;
      class: MandateConstraintClass;
      path: string;
      operator: "one_of";
      values: Array<string | number | boolean | null>;
    }
  | {
      id: string;
      class: MandateConstraintClass;
      path: string;
      operator: "number_lte" | "number_gte";
      value: number;
    }
  | {
      id: string;
      class: MandateConstraintClass;
      path: string;
      operator: "present";
    };

export interface HumanMandate {
  mandate_version: "0.1";
  id: string;
  principal: { id: string };
  agent?: { id: string };
  issued_at: string;
  valid_from?: string;
  expires_at?: string;
  constraints: MandateConstraint[];
}

export interface MandatedAction {
  operation: string;
  parameters: Record<string, unknown>;
  occurred_at: string;
}

export interface MandateVerificationContext {
  mandate_signature_verified: boolean;
  action_binding_verified: boolean;
  verifier?: string;
  mandate_digest?: string;
  action_digest?: string;
}

export type MandateConstraintResult =
  | {
      id: string;
      class: MandateConstraintClass;
      status: "satisfied";
      path: string;
    }
  | {
      id: string;
      class: MandateConstraintClass;
      status: "violated";
      path: string;
      reason: string;
    }
  | {
      id: string;
      class: MandateConstraintClass;
      status: "unverifiable";
      path: string;
      reason: string;
    };

export interface HumanMandateEvaluation {
  evaluation_version: "0.1";
  mandate_id: string;
  principal_id: string;
  agent_id?: string;
  decision:
    | "within_mandate"
    | "outside_mandate"
    | "requires_fresh_authorization"
    | "unverifiable";
  authorized: boolean;
  constraint_results: MandateConstraintResult[];
  verification: {
    mandate_signature_verified: boolean;
    action_binding_verified: boolean;
    verifier?: string;
    mandate_digest?: string;
    action_digest?: string;
  };
  limitations: string[];
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPath(
  action: MandatedAction,
  path: string,
): { found: true; value: unknown } | { found: false } {
  if (path === "operation") return { found: true, value: action.operation };
  if (path === "occurred_at") return { found: true, value: action.occurred_at };

  const prefix = "parameters.";
  if (!path.startsWith(prefix)) return { found: false };

  const parts = path.slice(prefix.length).split(".").filter(Boolean);
  if (parts.length === 0) return { found: false };

  let current: unknown = action.parameters;
  for (const part of parts) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !Object.prototype.hasOwnProperty.call(current, part)
    ) {
      return { found: false };
    }
    current = (current as Record<string, unknown>)[part];
  }

  return { found: true, value: current };
}

function primitiveEqual(
  left: unknown,
  right: string | number | boolean | null,
): boolean | null {
  if (left === null) return right === null;
  if (
    typeof left !== "string" &&
    typeof left !== "number" &&
    typeof left !== "boolean"
  ) {
    return null;
  }
  return left === right;
}

function evaluateConstraint(
  constraint: MandateConstraint,
  action: MandatedAction,
): MandateConstraintResult {
  const resolved = readPath(action, constraint.path);
  if (!resolved.found) {
    return {
      id: constraint.id,
      class: constraint.class,
      status: "unverifiable",
      path: constraint.path,
      reason: "The constrained action parameter is missing or the path is unsupported.",
    };
  }

  if (constraint.operator === "present") {
    const present = resolved.value !== undefined && resolved.value !== null;
    return present
      ? {
          id: constraint.id,
          class: constraint.class,
          status: "satisfied",
          path: constraint.path,
        }
      : {
          id: constraint.id,
          class: constraint.class,
          status: "violated",
          path: constraint.path,
          reason: "The required action parameter is absent.",
        };
  }

  if (constraint.operator === "equals") {
    const equal = primitiveEqual(resolved.value, constraint.value);
    if (equal === null) {
      return {
        id: constraint.id,
        class: constraint.class,
        status: "unverifiable",
        path: constraint.path,
        reason: "The action value is not a supported primitive for equals comparison.",
      };
    }
    return equal
      ? {
          id: constraint.id,
          class: constraint.class,
          status: "satisfied",
          path: constraint.path,
        }
      : {
          id: constraint.id,
          class: constraint.class,
          status: "violated",
          path: constraint.path,
          reason: "The action value does not equal the mandated value.",
        };
  }

  if (constraint.operator === "one_of") {
    const comparisons = constraint.values.map((value) =>
      primitiveEqual(resolved.value, value),
    );
    if (comparisons.every((value) => value === null)) {
      return {
        id: constraint.id,
        class: constraint.class,
        status: "unverifiable",
        path: constraint.path,
        reason: "The action value is not a supported primitive for one_of comparison.",
      };
    }
    return comparisons.includes(true)
      ? {
          id: constraint.id,
          class: constraint.class,
          status: "satisfied",
          path: constraint.path,
        }
      : {
          id: constraint.id,
          class: constraint.class,
          status: "violated",
          path: constraint.path,
          reason: "The action value is outside the mandated allowed set.",
        };
  }

  if (typeof resolved.value !== "number" || !Number.isFinite(resolved.value)) {
    return {
      id: constraint.id,
      class: constraint.class,
      status: "unverifiable",
      path: constraint.path,
      reason: "The action value is not a finite number.",
    };
  }

  const satisfied =
    constraint.operator === "number_lte"
      ? resolved.value <= constraint.value
      : resolved.value >= constraint.value;

  return satisfied
    ? {
        id: constraint.id,
        class: constraint.class,
        status: "satisfied",
        path: constraint.path,
      }
    : {
        id: constraint.id,
        class: constraint.class,
        status: "violated",
        path: constraint.path,
        reason:
          constraint.operator === "number_lte"
            ? "The action value exceeds the mandated maximum."
            : "The action value is below the mandated minimum.",
      };
}

export function evaluateHumanMandate(input: {
  mandate: HumanMandate;
  action: MandatedAction;
  verification: MandateVerificationContext;
}): HumanMandateEvaluation {
  const { mandate, action, verification } = input;
  const results: MandateConstraintResult[] = [];

  const occurredAt = parseInstant(action.occurred_at);
  const validFrom =
    mandate.valid_from === undefined ? undefined : parseInstant(mandate.valid_from);
  const expiresAt =
    mandate.expires_at === undefined ? undefined : parseInstant(mandate.expires_at);

  if (
    occurredAt === null ||
    validFrom === null ||
    expiresAt === null
  ) {
    return {
      evaluation_version: "0.1",
      mandate_id: mandate.id,
      principal_id: mandate.principal.id,
      ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
      decision: "unverifiable",
      authorized: false,
      constraint_results: [],
      verification: { ...verification },
      limitations: [
        "Mandate evaluation fails closed when mandate or action timestamps are malformed.",
        "This evaluator does not perform cryptographic signature or action-binding verification; it consumes explicit verifier results.",
      ],
    };
  }

  if (validFrom !== undefined && occurredAt < validFrom) {
    results.push({
      id: "mandate.valid_from",
      class: "hard",
      status: "violated",
      path: "occurred_at",
      reason: "The action occurred before the mandate validity window.",
    });
  }

  if (expiresAt !== undefined && occurredAt > expiresAt) {
    results.push({
      id: "mandate.expires_at",
      class: "hard",
      status: "violated",
      path: "occurred_at",
      reason: "The action occurred after the mandate validity window.",
    });
  }

  for (const constraint of mandate.constraints) {
    results.push(evaluateConstraint(constraint, action));
  }

  if (
    !verification.mandate_signature_verified ||
    !verification.action_binding_verified
  ) {
    return {
      evaluation_version: "0.1",
      mandate_id: mandate.id,
      principal_id: mandate.principal.id,
      ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
      decision: "unverifiable",
      authorized: false,
      constraint_results: results,
      verification: { ...verification },
      limitations: [
        "A mandate is not permission unless both mandate signature verification and action-to-mandate binding verification succeed.",
        "This evaluator does not perform cryptographic verification itself.",
      ],
    };
  }

  if (results.some((result) => result.status === "unverifiable")) {
    return {
      evaluation_version: "0.1",
      mandate_id: mandate.id,
      principal_id: mandate.principal.id,
      ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
      decision: "unverifiable",
      authorized: false,
      constraint_results: results,
      verification: { ...verification },
      limitations: [
        "Absence of a positive verifiable within-mandate result is not treated as permission.",
      ],
    };
  }

  if (
    results.some(
      (result) => result.class === "hard" && result.status === "violated",
    )
  ) {
    return {
      evaluation_version: "0.1",
      mandate_id: mandate.id,
      principal_id: mandate.principal.id,
      ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
      decision: "outside_mandate",
      authorized: false,
      constraint_results: results,
      verification: { ...verification },
      limitations: [],
    };
  }

  if (
    results.some(
      (result) =>
        result.class === "escalating" && result.status === "violated",
    )
  ) {
    return {
      evaluation_version: "0.1",
      mandate_id: mandate.id,
      principal_id: mandate.principal.id,
      ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
      decision: "requires_fresh_authorization",
      authorized: false,
      constraint_results: results,
      verification: { ...verification },
      limitations: [
        "Escalation removes the action from autonomous authority; a separate fresh-authorization mechanism is required.",
      ],
    };
  }

  return {
    evaluation_version: "0.1",
    mandate_id: mandate.id,
    principal_id: mandate.principal.id,
    ...(mandate.agent ? { agent_id: mandate.agent.id } : {}),
    decision: "within_mandate",
    authorized: true,
    constraint_results: results,
    verification: { ...verification },
    limitations: [
      "This result is a deterministic evaluation over the supplied mandate/action data and supplied verification outcomes, not a claim that AuditSpec performed cryptographic verification.",
      "The mandate problem statement defines requirements, not a wire protocol; this AuditSpec evaluator is a research contract, not protocol conformance.",
    ],
  };
}
