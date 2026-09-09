import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type {
  AssessmentBoundary,
  AssessmentFinding,
  AssessmentReport,
  SourceLocation,
} from "../assessment-types.js";
import { buildAssuranceGraph, findAssurancePath, type AssurancePathEvidence } from "../assurance-graph.js";
import type { InspectorFrameworkPlugin } from "./plugin.js";

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function finding(
  ruleId: string,
  title: string,
  confidence: AssessmentFinding["confidence"],
  message: string,
  location: SourceLocation,
  boundaryId: string,
  sourceIdentity: string,
  evidenceDetail: string,
  remediation: string,
): AssessmentFinding {
  return {
    id: stableId("finding", `${ruleId}:${location.path}:${location.line ?? 0}:${boundaryId}`),
    fingerprint: stableId("fp", `${ruleId}:${sourceIdentity}`),
    rule_id: ruleId,
    title,
    severity: "warning",
    confidence,
    status: "open",
    message,
    location,
    boundary_id: boundaryId,
    evidence: [{ kind: "ast_analysis", detail: evidenceDetail, location }],
    remediation: { summary: remediation },
  };
}

function assuranceDetail(path: AssurancePathEvidence): string {
  return `Resolved assurance path: ${path.qualified_names.join(" -> ")} [roles: ${path.roles.join(", ")}; confidence: ${path.confidence}]`;
}

function reachabilityForPath(
  boundary: AssessmentBoundary,
  path: AssurancePathEvidence,
  plugin: InspectorFrameworkPlugin | undefined,
): AssessmentBoundary["reachability"] {
  if (!path.roles.includes("entrypoint") || path.qualified_names.length === 0) {
    return { status: "unknown", confidence: path.confidence, path: path.qualified_names };
  }

  const qualifiedName = path.qualified_names[0]!;
  const kind = plugin?.assurance?.entrypointKind(qualifiedName, boundary) ?? "resolved_scope";

  return {
    status: "reachable",
    confidence: path.confidence,
    entrypoint: {
      kind,
      qualified_name: qualifiedName,
      ...(boundary.framework ? { framework: boundary.framework } : {}),
    },
    path: path.qualified_names,
  };
}

function reconcileWithAssuranceGraph(
  boundaries: AssessmentBoundary[],
  findings: AssessmentFinding[],
  graph: Awaited<ReturnType<typeof buildAssuranceGraph>>,
  plugins: readonly InspectorFrameworkPlugin[],
): AssessmentFinding[] {
  const pluginByFramework = new Map(plugins.map((plugin) => [plugin.framework, plugin]));
  const paths = new Map<string, AssurancePathEvidence>();

  for (const boundary of boundaries) {
    const path = findAssurancePath(graph, boundary.location);
    if (!path) {
      boundary.reachability = { status: "unknown", confidence: "low" };
      continue;
    }

    paths.set(boundary.id, path);
    const plugin = boundary.framework ? pluginByFramework.get(boundary.framework) : undefined;
    boundary.reachability = reachabilityForPath(boundary, path, plugin);

    const hasAudit = path.roles.includes("audit");
    const hasTransaction = path.roles.includes("transaction");
    boundary.audit_status = plugin?.assurance?.auditStatus(boundary, path)
      ?? (hasAudit ? (hasTransaction ? "covered" : "partial") : "uncovered");

    boundary.evidence = [
      ...(boundary.evidence ?? []),
      {
        kind: "assurance_path",
        detail: assuranceDetail(path),
        location: boundary.location,
      },
    ];
  }

  const filtered = findings.filter((current) => {
    if (!current.boundary_id) return true;
    const path = paths.get(current.boundary_id);
    if (!path) return true;
    if (current.rule_id === "AS-AUDIT-001" && path.roles.includes("audit")) return false;
    if (current.rule_id === "AS-ATOMIC-001" && path.roles.includes("audit") && path.roles.includes("transaction")) return false;
    if (current.rule_id === "AS-AUTH-001" && path.roles.includes("authorization")) return false;
    return true;
  });

  for (const boundary of boundaries) {
    if (!boundary.framework) continue;
    const plugin = pluginByFramework.get(boundary.framework);
    if (!plugin?.assurance?.reportAtomicityGapWhenAuditWithoutTransaction || boundary.audit_status !== "partial") continue;
    if (filtered.some((current) => current.boundary_id === boundary.id && current.rule_id === "AS-ATOMIC-001")) continue;

    const path = paths.get(boundary.id);
    if (!path || !path.roles.includes("audit") || path.roles.includes("transaction")) continue;

    filtered.push(
      finding(
        "AS-ATOMIC-001",
        "Mutation and audit are not visibly atomic",
        path.confidence === "low" ? "low" : "medium",
        "The assurance graph resolved an audit-bearing execution path to this mutation, but no transaction role is visible on that path.",
        boundary.location,
        boundary.id,
        `${boundary.location.path}:${boundary.operation}:${boundary.id}:assurance`,
        assuranceDetail(path),
        "Couple the mutation and durable audit write in one transaction, or use a transactional outbox when they cannot share a store.",
      ),
    );
  }

  return filtered;
}

export async function inspectRepositoryWithPlugins(
  inputPath: string,
  plugins: readonly InspectorFrameworkPlugin[],
): Promise<AssessmentReport> {
  const root = resolve(inputPath);
  const results = await Promise.all(plugins.map(async (plugin) => ({
    plugin,
    result: await plugin.inspect(root),
  })));

  const frameworks: AssessmentReport["frameworks"] = [];
  const adapters: string[] = [];
  const boundaries: AssessmentBoundary[] = [];
  let findings: AssessmentFinding[] = [];
  let astParseFailures = 0;

  for (const { plugin, result } of results) {
    astParseFailures += result.ast_failures;
    if (!result.detected) continue;

    frameworks.push({
      name: plugin.framework,
      confidence: plugin.confidence ?? "high",
      ...(result.evidence.length > 0 ? { evidence: result.evidence } : {}),
    });
    adapters.push(plugin.id);
    boundaries.push(...result.boundaries);
    findings.push(...result.findings);
  }

  const assuranceGraph = await buildAssuranceGraph(root);
  if (assuranceGraph.nodes.length > 0) {
    adapters.push("assurance-call-graph-v0.1");
    findings = reconcileWithAssuranceGraph(boundaries, findings, assuranceGraph, plugins);
  }

  const covered = boundaries.filter((boundary) => boundary.audit_status === "covered").length;
  const partial = boundaries.filter((boundary) => boundary.audit_status === "partial").length;
  const uncovered = boundaries.filter((boundary) => boundary.audit_status === "uncovered").length;
  const unknown = boundaries.filter((boundary) => boundary.audit_status === "unknown").length;
  const reachableBoundaries = boundaries.filter((boundary) => boundary.reachability.status === "reachable").length;
  const unknownReachability = boundaries.length - reachableBoundaries;

  return {
    report_version: "0.1",
    generated_at: new Date().toISOString(),
    subject: { kind: "repository", path: root },
    inspector: {
      name: "auditspec-reference-inspector",
      version: "0.1.0",
      adapters,
    },
    frameworks,
    boundaries,
    findings,
    coverage: {
      detected_boundaries: boundaries.length,
      covered_boundaries: covered,
      partial_boundaries: partial,
      uncovered_boundaries: uncovered,
      unknown_boundaries: unknown,
      audit_coverage: boundaries.length === 0 ? 0 : covered / boundaries.length,
    },
    reachability: {
      reachable_boundaries: reachableBoundaries,
      unknown_boundaries: unknownReachability,
    },
    metadata: {
      assessment_kind: "static_source_ast_assisted_with_assurance_graph",
      non_blocking_recommended: true,
      ast_parse_failures: astParseFailures,
      assurance_graph: assuranceGraph.summary,
    },
  };
}
