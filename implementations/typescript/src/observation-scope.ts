export type ObservationScopeBasis = "declared" | "partial" | "unknown";
export type ObservationCollectionMode = "continuous" | "sampled" | "triggered" | "manual" | "unknown";
export type ObservationProducerType = "application" | "database" | "collector" | "proxy" | "kernel" | "agent" | "external";
export type ObservationComparabilityStatus = "comparable" | "partially_comparable" | "not_comparable" | "unknown";
export type ObservationDimensionResult = "match" | "mismatch" | "unknown";

export interface RuntimeObservationScope {
  scope_version: "0.1";
  basis: ObservationScopeBasis;
  environment?: string;
  window?: {
    start: string;
    end: string;
  };
  collection_policy?: {
    id: string;
    version?: string;
    mode: ObservationCollectionMode;
  };
  producers?: Array<{
    name: string;
    type: ObservationProducerType;
    version?: string;
    instance?: string;
  }>;
  assumptions?: string[];
}

export interface ObservationComparability {
  status: ObservationComparabilityStatus;
  dimensions: {
    environment: ObservationDimensionResult;
    window: ObservationDimensionResult;
    collection_policy: ObservationDimensionResult;
    producers: ObservationDimensionResult;
  };
  reasons: string[];
}

export function unknownObservationScope(): RuntimeObservationScope {
  return {
    scope_version: "0.1",
    basis: "unknown",
  };
}

function compareOptionalString(left: string | undefined, right: string | undefined): ObservationDimensionResult {
  if (!left || !right) return "unknown";
  return left === right ? "match" : "mismatch";
}

function policyIdentity(scope: RuntimeObservationScope): string | undefined {
  const policy = scope.collection_policy;
  if (!policy) return undefined;
  return [policy.id, policy.version ?? "", policy.mode].join("\0");
}

function producerIdentity(producer: NonNullable<RuntimeObservationScope["producers"]>[number]): string {
  return [producer.name, producer.type, producer.version ?? "", producer.instance ?? ""].join("\0");
}

function producerSet(scope: RuntimeObservationScope): string[] | undefined {
  if (!scope.producers) return undefined;
  return scope.producers.map(producerIdentity).sort();
}

function compareProducerSets(left: RuntimeObservationScope, right: RuntimeObservationScope): ObservationDimensionResult {
  const leftSet = producerSet(left);
  const rightSet = producerSet(right);
  if (!leftSet || !rightSet) return "unknown";
  if (leftSet.length !== rightSet.length) return "mismatch";
  return leftSet.every((value, index) => value === rightSet[index]) ? "match" : "mismatch";
}

function windowDuration(scope: RuntimeObservationScope): number | undefined {
  if (!scope.window) return undefined;
  const start = Date.parse(scope.window.start);
  const end = Date.parse(scope.window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return undefined;
  return end - start;
}

function compareWindows(left: RuntimeObservationScope, right: RuntimeObservationScope): ObservationDimensionResult {
  if (!left.window || !right.window) return "unknown";
  const leftDuration = windowDuration(left);
  const rightDuration = windowDuration(right);
  if (leftDuration === undefined || rightDuration === undefined) return "mismatch";
  return leftDuration === rightDuration ? "match" : "mismatch";
}

export function compareObservationScopes(
  base: RuntimeObservationScope,
  head: RuntimeObservationScope,
): ObservationComparability {
  const dimensions: ObservationComparability["dimensions"] = {
    environment: compareOptionalString(base.environment, head.environment),
    window: compareWindows(base, head),
    collection_policy: compareOptionalString(policyIdentity(base), policyIdentity(head)),
    producers: compareProducerSets(base, head),
  };

  const reasons: string[] = [];
  if (base.basis === "unknown" || head.basis === "unknown") {
    reasons.push("At least one report does not declare enough observation-scope information for a reliable comparison.");
  }
  if (dimensions.environment === "mismatch") reasons.push("Observation environments differ.");
  if (dimensions.collection_policy === "mismatch") reasons.push("Collection policy identity, version, or mode differs.");
  if (dimensions.producers === "mismatch") reasons.push("Declared runtime producer sets differ.");
  if (dimensions.window === "mismatch") reasons.push("Observation window durations differ or a declared window is invalid.");
  if (dimensions.environment === "unknown") reasons.push("Observation environment is not declared on both reports.");
  if (dimensions.collection_policy === "unknown") reasons.push("Collection policy is not declared on both reports.");
  if (dimensions.producers === "unknown") reasons.push("Runtime producer set is not declared on both reports.");
  if (dimensions.window === "unknown") reasons.push("Observation window is not declared on both reports.");

  const hardMismatch =
    dimensions.environment === "mismatch" ||
    dimensions.collection_policy === "mismatch" ||
    dimensions.producers === "mismatch";

  if (hardMismatch) {
    return { status: "not_comparable", dimensions, reasons };
  }

  const allMatch = Object.values(dimensions).every((value) => value === "match");
  if (base.basis === "declared" && head.basis === "declared" && allMatch) {
    return {
      status: "comparable",
      dimensions,
      reasons: ["Environment, collection policy, producer set, and observation-window duration match."],
    };
  }

  const anyKnownMatch = Object.values(dimensions).some((value) => value === "match");
  if (anyKnownMatch && base.basis !== "unknown" && head.basis !== "unknown") {
    return { status: "partially_comparable", dimensions, reasons };
  }

  return { status: "unknown", dimensions, reasons };
}
