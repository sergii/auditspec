import type {
  AssuranceGraph,
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssurancePathEvidence,
} from "./assurance-graph.js";
import type { SourceLocation } from "./assessment-types.js";

interface CandidatePath {
  ids: string[];
  edgeConfidences: Array<"high" | "medium">;
}

export interface AssurancePathSet {
  paths: AssurancePathEvidence[];
  truncated: boolean;
  max_paths: number;
}

function nodeForLocation(graph: AssuranceGraph, location: SourceLocation): AssuranceGraphNode | undefined {
  if (!location.line) return undefined;
  return graph.nodes
    .filter(
      (node) => node.kind === "scope"
        && node.location.path === location.path
        && location.line! >= node.range.start_line
        && location.line! <= node.range.end_line,
    )
    .sort((a, b) => (a.range.end_line - a.range.start_line) - (b.range.end_line - b.range.start_line))[0];
}

function evidence(candidate: CandidatePath, byId: Map<string, AssuranceGraphNode>): AssurancePathEvidence | null {
  const nodes = candidate.ids
    .map((id) => byId.get(id))
    .filter((node): node is AssuranceGraphNode => Boolean(node));
  if (nodes.length === 0) return null;

  const roles = [...new Set(nodes.flatMap((node) => node.roles))].sort() as AssurancePathEvidence["roles"];
  const confidence: AssurancePathEvidence["confidence"] = candidate.ids.length === 1
    ? "high"
    : candidate.edgeConfidences.every((value) => value === "high")
      ? "medium"
      : "low";

  return {
    node_ids: candidate.ids,
    qualified_names: nodes.map((node) => node.qualified_name),
    roles,
    confidence,
  };
}

export function findAssurancePaths(
  graph: AssuranceGraph,
  location: SourceLocation,
  maxDepth = 8,
  maxPaths = 64,
): AssurancePathSet {
  const target = nodeForLocation(graph, location);
  if (!target) return { paths: [], truncated: false, max_paths: maxPaths };

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, AssuranceGraphEdge[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to) ?? [];
    list.push(edge);
    incoming.set(edge.to, list);
  }

  const candidates: CandidatePath[] = [];
  let truncated = false;
  const visit = (
    current: string,
    reversedIds: string[],
    confidences: Array<"high" | "medium">,
  ): void => {
    if (candidates.length >= maxPaths) {
      truncated = true;
      return;
    }
    const node = byId.get(current);
    if (!node) return;

    if (node.roles.includes("entrypoint")) {
      candidates.push({ ids: [...reversedIds].reverse(), edgeConfidences: [...confidences].reverse() });
      return;
    }

    if (reversedIds.length >= maxDepth) {
      truncated = true;
      candidates.push({ ids: [...reversedIds].reverse(), edgeConfidences: [...confidences].reverse() });
      return;
    }

    const predecessors = incoming.get(current) ?? [];
    if (predecessors.length === 0) {
      candidates.push({ ids: [...reversedIds].reverse(), edgeConfidences: [...confidences].reverse() });
      return;
    }

    for (const edge of predecessors) {
      if (reversedIds.includes(edge.from)) continue;
      visit(edge.from, [...reversedIds, edge.from], [...confidences, edge.confidence]);
      if (candidates.length >= maxPaths) {
        if (predecessors.at(-1) !== edge) truncated = true;
        break;
      }
    }
  };

  visit(target.id, [target.id], []);
  if (candidates.length === 0) candidates.push({ ids: [target.id], edgeConfidences: [] });

  const unique = new Map<string, AssurancePathEvidence>();
  for (const candidate of candidates) {
    const value = evidence(candidate, byId);
    if (!value) continue;
    unique.set(value.node_ids.join("->"), value);
  }

  const paths = [...unique.values()].sort((a, b) => {
    const entrypointDelta = Number(b.roles.includes("entrypoint")) - Number(a.roles.includes("entrypoint"));
    if (entrypointDelta !== 0) return entrypointDelta;
    return a.qualified_names.join("->").localeCompare(b.qualified_names.join("->"));
  });

  return { paths, truncated, max_paths: maxPaths };
}
