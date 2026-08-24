import { createHash } from "node:crypto";
import type { AssuranceGraph, AssuranceGraphEdge, AssuranceGraphNode } from "./assurance-graph.js";
import type { AssessmentConfidence, SourceLocation } from "./assessment-types.js";

export interface AssuranceTopologyEntrypoint {
  key: string;
  qualified_name: string;
  framework?: string;
  surface_kind?: string;
  location: SourceLocation;
}

export interface AssuranceTopologyDispatch {
  key: string;
  from: string;
  to: string;
  framework_kind: string;
  detail: string;
  confidence: "high" | "medium";
  location: SourceLocation;
}

export interface AssuranceTopologyMutationPath {
  fingerprint: string;
  entrypoint: string;
  mutation: string;
  mutation_location: SourceLocation;
  path: string[];
  roles: string[];
  confidence: AssessmentConfidence;
}

export interface AssuranceGraphDiff {
  diff_version: "0.1";
  generated_at: string;
  base: { subject_path: string; generated_at: string };
  head: { subject_path: string; generated_at: string };
  new_entrypoints: AssuranceTopologyEntrypoint[];
  removed_entrypoints: AssuranceTopologyEntrypoint[];
  new_framework_dispatches: AssuranceTopologyDispatch[];
  removed_framework_dispatches: AssuranceTopologyDispatch[];
  new_mutation_paths: AssuranceTopologyMutationPath[];
  removed_mutation_paths: AssuranceTopologyMutationPath[];
  unchanged_mutation_paths: number;
  summary: {
    base_entrypoints: number;
    head_entrypoints: number;
    base_mutation_paths: number;
    head_mutation_paths: number;
    mutation_path_delta: number;
  };
}

function digest(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function nodeKey(node: AssuranceGraphNode): string {
  if (node.kind === "surface") {
    return ["surface", node.framework ?? "", node.surface?.kind ?? "", node.surface?.detail ?? node.qualified_name].join(":");
  }
  return ["scope", node.language, node.location.path, node.qualified_name].join(":");
}

function entrypointSummary(node: AssuranceGraphNode): AssuranceTopologyEntrypoint {
  return {
    key: digest("entry", nodeKey(node)),
    qualified_name: node.qualified_name,
    ...(node.framework ? { framework: node.framework } : {}),
    ...(node.surface?.kind ? { surface_kind: node.surface.kind } : {}),
    location: node.location,
  };
}

function edgeKey(edge: AssuranceGraphEdge, byId: Map<string, AssuranceGraphNode>): string | null {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;
  return [edge.kind, nodeKey(from), nodeKey(to), edge.framework?.kind ?? "", edge.call?.callee ?? ""].join(":");
}

function dispatchSummary(edge: AssuranceGraphEdge, byId: Map<string, AssuranceGraphNode>): AssuranceTopologyDispatch | null {
  if (edge.kind !== "framework_dispatch" || !edge.framework) return null;
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  const semantic = edgeKey(edge, byId);
  if (!from || !to || !semantic) return null;
  return {
    key: digest("dispatch", semantic),
    from: from.qualified_name,
    to: to.qualified_name,
    framework_kind: edge.framework.kind,
    detail: edge.framework.detail,
    confidence: edge.confidence,
    location: edge.framework.location,
  };
}

function pathConfidence(edges: AssuranceGraphEdge[]): AssessmentConfidence {
  if (edges.length === 0) return "high";
  return edges.every((edge) => edge.confidence === "high") ? "high" : "medium";
}

function mutationPaths(graph: AssuranceGraph): AssuranceTopologyMutationPath[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, AssuranceGraphEdge[]>();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge);
    outgoing.set(edge.from, list);
  }

  const results = new Map<string, AssuranceTopologyMutationPath>();
  const entrypoints = graph.nodes.filter((node) => node.roles.includes("entrypoint"));

  for (const entrypoint of entrypoints) {
    const queue: Array<{ id: string; ids: string[]; edges: AssuranceGraphEdge[] }> = [{ id: entrypoint.id, ids: [entrypoint.id], edges: [] }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const node = byId.get(current.id);
      if (!node) continue;

      if (node.roles.includes("mutation")) {
        const semantic = `${nodeKey(entrypoint)}=>${nodeKey(node)}`;
        const fingerprint = digest("path", semantic);
        if (!results.has(fingerprint)) {
          const nodes = current.ids.map((id) => byId.get(id)).filter((candidate): candidate is AssuranceGraphNode => Boolean(candidate));
          results.set(fingerprint, {
            fingerprint,
            entrypoint: entrypoint.qualified_name,
            mutation: node.qualified_name,
            mutation_location: node.location,
            path: nodes.map((candidate) => candidate.qualified_name),
            roles: [...new Set(nodes.flatMap((candidate) => candidate.roles))].sort(),
            confidence: pathConfidence(current.edges),
          });
        }
      }

      for (const edge of outgoing.get(current.id) ?? []) {
        if (current.ids.includes(edge.to) || current.ids.length >= 12) continue;
        queue.push({ id: edge.to, ids: [...current.ids, edge.to], edges: [...current.edges, edge] });
      }
    }
  }

  return [...results.values()].sort((a, b) => a.fingerprint.localeCompare(b.fingerprint));
}

function byKey<T extends { key: string }>(values: T[]): Map<string, T> {
  return new Map(values.map((value) => [value.key, value]));
}

export function diffAssuranceGraphs(base: AssuranceGraph, head: AssuranceGraph): AssuranceGraphDiff {
  const baseById = new Map(base.nodes.map((node) => [node.id, node]));
  const headById = new Map(head.nodes.map((node) => [node.id, node]));

  const baseEntrypoints = base.nodes.filter((node) => node.roles.includes("entrypoint")).map(entrypointSummary);
  const headEntrypoints = head.nodes.filter((node) => node.roles.includes("entrypoint")).map(entrypointSummary);
  const baseEntries = byKey(baseEntrypoints);
  const headEntries = byKey(headEntrypoints);

  const baseDispatches = base.edges.map((edge) => dispatchSummary(edge, baseById)).filter((value): value is AssuranceTopologyDispatch => Boolean(value));
  const headDispatches = head.edges.map((edge) => dispatchSummary(edge, headById)).filter((value): value is AssuranceTopologyDispatch => Boolean(value));
  const baseDispatchByKey = byKey(baseDispatches);
  const headDispatchByKey = byKey(headDispatches);

  const basePaths = mutationPaths(base);
  const headPaths = mutationPaths(head);
  const basePathByFingerprint = new Map(basePaths.map((path) => [path.fingerprint, path]));
  const headPathByFingerprint = new Map(headPaths.map((path) => [path.fingerprint, path]));

  return {
    diff_version: "0.1",
    generated_at: new Date().toISOString(),
    base: { subject_path: base.subject.path, generated_at: base.generated_at },
    head: { subject_path: head.subject.path, generated_at: head.generated_at },
    new_entrypoints: headEntrypoints.filter((entry) => !baseEntries.has(entry.key)).sort((a, b) => a.key.localeCompare(b.key)),
    removed_entrypoints: baseEntrypoints.filter((entry) => !headEntries.has(entry.key)).sort((a, b) => a.key.localeCompare(b.key)),
    new_framework_dispatches: headDispatches.filter((edge) => !baseDispatchByKey.has(edge.key)).sort((a, b) => a.key.localeCompare(b.key)),
    removed_framework_dispatches: baseDispatches.filter((edge) => !headDispatchByKey.has(edge.key)).sort((a, b) => a.key.localeCompare(b.key)),
    new_mutation_paths: headPaths.filter((path) => !basePathByFingerprint.has(path.fingerprint)),
    removed_mutation_paths: basePaths.filter((path) => !headPathByFingerprint.has(path.fingerprint)),
    unchanged_mutation_paths: headPaths.filter((path) => basePathByFingerprint.has(path.fingerprint)).length,
    summary: {
      base_entrypoints: baseEntrypoints.length,
      head_entrypoints: headEntrypoints.length,
      base_mutation_paths: basePaths.length,
      head_mutation_paths: headPaths.length,
      mutation_path_delta: headPaths.length - basePaths.length,
    },
  };
}
