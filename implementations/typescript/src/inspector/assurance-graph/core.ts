import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { findAstCalls, type AstCallCandidate, type AstLanguage, type AstScope } from "../../ast-calls.js";
import type { AssessmentConfidence, SourceLocation } from "../../assessment-types.js";
import type {
  AssuranceGraphIndexedScope,
  AssuranceGraphPlugin,
  AssuranceGraphPluginContext,
} from "./plugin.js";

export type AssuranceRole = "entrypoint" | "authorization" | "transaction" | "mutation" | "audit";
export type AssuranceFramework = string;

export interface AssuranceGraphNode {
  id: string;
  kind: "scope" | "surface";
  language: AstLanguage;
  framework?: AssuranceFramework;
  name: string;
  qualified_name: string;
  location: SourceLocation;
  range: { start_line: number; end_line: number };
  roles: AssuranceRole[];
  confidence: AssessmentConfidence;
  surface?: {
    kind: string;
    detail: string;
  };
}

export interface AssuranceGraphEdge {
  from: string;
  to: string;
  kind: "call" | "framework_dispatch";
  confidence: "high" | "medium";
  call?: {
    callee: string;
    location: SourceLocation;
  };
  framework?: {
    kind: string;
    detail: string;
    location: SourceLocation;
  };
}

export interface AssuranceUnresolvedCall {
  from: string;
  callee: string;
  location: SourceLocation;
  reason: "no_candidate" | "ambiguous";
  candidates?: string[];
}

export interface AssuranceGraph {
  graph_version: "0.1";
  generated_at: string;
  subject: { kind: "repository"; path: string };
  nodes: AssuranceGraphNode[];
  edges: AssuranceGraphEdge[];
  unresolved_calls: AssuranceUnresolvedCall[];
  summary: {
    nodes: number;
    edges: number;
    entrypoints: number;
    mutation_nodes: number;
    audit_nodes: number;
    unresolved_calls: number;
    surface_nodes: number;
    framework_edges: number;
  };
}

export interface AssurancePathEvidence {
  node_ids: string[];
  qualified_names: string[];
  roles: AssuranceRole[];
  confidence: "high" | "medium" | "low";
}

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "build",
  "coverage",
  "dist",
  "env",
  "log",
  "node_modules",
  "public/assets",
  "sites/assets",
  "tmp",
  "vendor",
  "venv",
]);

const AUDIT_RE = /\b(?:AuditSpec|auditspec)\.(?:emit!?|record!?)\b|\bemit_audit\b/;

function stableId(prefix: string, value: string): string {
  const digest = createHash("sha256").update(value).digest("hex").slice(0, 12);
  return `${prefix}_${digest}`;
}

function repoPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/") || ".";
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function collectSourceFiles(root: string, directory = root, output: string[] = []): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return output;
  }

  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    const relativeName = repoPath(root, absolute);
    if (entry.isDirectory()) {
      const firstSegment = relativeName.split("/")[0] ?? relativeName;
      if (SKIP_DIRECTORIES.has(relativeName) || SKIP_DIRECTORIES.has(firstSegment)) continue;
      await collectSourceFiles(root, absolute, output);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith(".rb") || entry.name.endsWith(".rake") || entry.name.endsWith(".py"))) {
      output.push(absolute);
    }
  }
  return output;
}

function languageFor(path: string): AstLanguage {
  return path.endsWith(".py") ? "python" : "ruby";
}

function scopeKey(path: string, scope: AstScope): string {
  return `${path}:${scope.id}`;
}

function receiverHint(callee: string, method: string): string | undefined {
  const suffix = `.${method}`;
  if (!callee.endsWith(suffix)) return undefined;
  const receiver = callee.slice(0, -suffix.length);
  const segments = receiver.split(/\.|::/).filter(Boolean);
  return segments.at(-1);
}

function containerHint(node: AssuranceGraphNode): string | undefined {
  const qualified = node.qualified_name;
  if (node.language === "ruby") {
    const beforeMethod = qualified.split("#")[0];
    return beforeMethod?.split("::").at(-1);
  }
  const parts = qualified.split(".");
  return parts.length > 1 ? parts.at(-2) : undefined;
}

function addRole(node: AssuranceGraphNode, role: AssuranceRole): void {
  if (!node.roles.includes(role)) node.roles = [...node.roles, role].sort() as AssuranceRole[];
}

function resolvePythonDottedTarget(
  indexed: AssuranceGraphIndexedScope[],
  target: string,
): AssuranceGraphIndexedScope | undefined {
  const parts = target.split(".");
  if (parts.length < 2) return undefined;
  const name = parts.at(-1)!;
  const modulePath = `${parts.slice(0, -1).join("/")}.py`;
  const candidates = indexed.filter(
    (item) => item.node.language === "python"
      && item.node.name === name
      && item.node.location.path.endsWith(modulePath),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

function coreRolesForCalls(calls: AstCallCandidate[]): AssuranceRole[] {
  return calls.some((call) => AUDIT_RE.test(call.callee) || AUDIT_RE.test(call.text)) ? ["audit"] : [];
}

function isCoreSemanticCall(call: AstCallCandidate): boolean {
  return AUDIT_RE.test(call.callee) || AUDIT_RE.test(call.text);
}

export async function buildAssuranceGraphWithPlugins(
  inputPath: string,
  plugins: readonly AssuranceGraphPlugin[] = [],
): Promise<AssuranceGraph> {
  const root = resolve(inputPath);
  const files = await collectSourceFiles(root);
  const indexed: AssuranceGraphIndexedScope[] = [];
  const sourceByPath = new Map<string, string>();

  for (const absolutePath of files) {
    const source = await readText(absolutePath);
    if (source === null || source.length > 1_000_000) continue;
    const path = repoPath(root, absolutePath);
    sourceByPath.set(path, source);
    const language = languageFor(path);
    const scan = findAstCalls(source, language);
    if (!scan.parsed) continue;

    const scopes = new Map<string, { scope: AstScope; calls: AstCallCandidate[] }>();
    for (const call of scan.calls) {
      if (!call.scope) continue;
      const key = scopeKey(path, call.scope);
      const current = scopes.get(key);
      if (current) current.calls.push(call);
      else scopes.set(key, { scope: call.scope, calls: [call] });
    }

    for (const { scope, calls } of scopes.values()) {
      const roles = coreRolesForCalls(calls);
      indexed.push({
        source,
        calls,
        scope,
        node: {
          id: stableId("node", `${language}:${path}:${scope.id}:${scope.qualified_name}`),
          kind: "scope",
          language,
          name: scope.name,
          qualified_name: scope.qualified_name,
          location: { path, line: scope.start_line, column: scope.start_column },
          range: { start_line: scope.start_line, end_line: scope.end_line },
          roles,
          confidence: "high",
        },
      });
    }
  }

  const nodes: AssuranceGraphNode[] = indexed.map((item) => item.node);
  const edges: AssuranceGraphEdge[] = [];
  const unresolved: AssuranceUnresolvedCall[] = [];
  const edgeKeys = new Set<string>();

  const pushEdge = (edge: AssuranceGraphEdge): void => {
    const location = edge.call?.location ?? edge.framework?.location;
    const key = `${edge.kind}:${edge.from}:${edge.to}:${location?.path ?? ""}:${location?.line ?? 0}:${location?.column ?? 0}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push(edge);
  };

  const addSurface = (
    language: AstLanguage,
    framework: string,
    surfaceKind: string,
    detail: string,
    location: SourceLocation,
  ): AssuranceGraphNode => {
    const qualified = `${framework}.${surfaceKind}:${detail}`;
    const surface: AssuranceGraphNode = {
      id: stableId("surface", `${qualified}:${location.path}:${location.line ?? 0}`),
      kind: "surface",
      language,
      framework,
      name: surfaceKind,
      qualified_name: qualified,
      location,
      range: { start_line: location.line ?? 1, end_line: location.line ?? 1 },
      roles: ["entrypoint"],
      confidence: "high",
      surface: { kind: surfaceKind, detail },
    };
    nodes.push(surface);
    return surface;
  };

  const context: AssuranceGraphPluginContext = {
    root,
    indexed,
    sourceByPath,
    nodes,
    edges,
    addRole,
    addSurface,
    pushEdge,
    receiverHint,
    containerHint,
    resolvePythonDottedTarget: (target) => resolvePythonDottedTarget(indexed, target),
  };

  for (const item of indexed) {
    for (const plugin of plugins) {
      const roles = plugin.classifyScope?.(item, context);
      if (!roles) continue;
      for (const role of roles) addRole(item.node, role);
    }
  }

  const byName = new Map<string, AssuranceGraphIndexedScope[]>();
  for (const item of indexed) {
    const items = byName.get(item.node.name) ?? [];
    items.push(item);
    byName.set(item.node.name, items);
  }

  for (const sourceScope of indexed) {
    for (const call of sourceScope.calls) {
      if (isCoreSemanticCall(call)) continue;
      if (plugins.some((plugin) => plugin.consumesCall?.(call, sourceScope, context) === true)) continue;

      const candidates = (byName.get(call.method) ?? []).filter(
        (candidate) => candidate.node.id !== sourceScope.node.id,
      );
      if (candidates.length === 0) continue;

      const receiver = receiverHint(call.callee, call.method);
      const receiverMatches = receiver
        ? candidates.filter((candidate) => containerHint(candidate.node) === receiver)
        : [];
      const resolved = receiverMatches.length === 1
        ? { candidate: receiverMatches[0]!, confidence: "high" as const }
        : candidates.length === 1
          ? { candidate: candidates[0]!, confidence: "medium" as const }
          : null;
      const location: SourceLocation = {
        path: sourceScope.node.location.path,
        line: call.line,
        column: call.column,
      };

      if (!resolved) {
        unresolved.push({
          from: sourceScope.node.id,
          callee: call.callee,
          location,
          reason: "ambiguous",
          candidates: candidates.map((candidate) => candidate.node.id),
        });
        continue;
      }

      pushEdge({
        from: sourceScope.node.id,
        to: resolved.candidate.node.id,
        kind: "call",
        confidence: resolved.confidence,
        call: { callee: call.callee, location },
      });
    }
  }

  for (const plugin of plugins) await plugin.apply?.(context);
  for (const plugin of plugins) await plugin.finalize?.(context);

  return {
    graph_version: "0.1",
    generated_at: new Date().toISOString(),
    subject: { kind: "repository", path: root },
    nodes,
    edges,
    unresolved_calls: unresolved,
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      entrypoints: nodes.filter((node) => node.roles.includes("entrypoint")).length,
      mutation_nodes: nodes.filter((node) => node.roles.includes("mutation")).length,
      audit_nodes: nodes.filter((node) => node.roles.includes("audit")).length,
      unresolved_calls: unresolved.length,
      surface_nodes: nodes.filter((node) => node.kind === "surface").length,
      framework_edges: edges.filter((edge) => edge.kind === "framework_dispatch").length,
    },
  };
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
    .sort(
      (left, right) => (left.range.end_line - left.range.start_line) - (right.range.end_line - right.range.start_line),
    )[0];
}

function pathRoles(nodes: AssuranceGraphNode[]): AssuranceRole[] {
  return [...new Set(nodes.flatMap((node) => node.roles))].sort() as AssuranceRole[];
}

export function findAssurancePath(
  graph: AssuranceGraph,
  location: SourceLocation,
  maxDepth = 8,
): AssurancePathEvidence | null {
  const target = nodeForLocation(graph, location);
  if (!target) return null;

  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map<string, AssuranceGraphEdge[]>();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.to) ?? [];
    list.push(edge);
    incoming.set(edge.to, list);
  }

  const candidates: { ids: string[]; edgeConfidences: Array<"high" | "medium"> }[] = [];
  const visit = (current: string, reversedIds: string[], confidences: Array<"high" | "medium">): void => {
    const node = byId.get(current);
    if (!node) return;
    if (node.roles.includes("entrypoint") || reversedIds.length >= maxDepth) {
      candidates.push({ ids: [...reversedIds].reverse(), edgeConfidences: confidences });
      return;
    }
    const predecessors = incoming.get(current) ?? [];
    if (predecessors.length === 0) {
      candidates.push({ ids: [...reversedIds].reverse(), edgeConfidences: confidences });
      return;
    }
    for (const edge of predecessors) {
      if (reversedIds.includes(edge.from)) continue;
      visit(edge.from, [...reversedIds, edge.from], [...confidences, edge.confidence]);
    }
  };

  visit(target.id, [target.id], []);
  if (candidates.length === 0) candidates.push({ ids: [target.id], edgeConfidences: [] });

  const scored = candidates
    .map((candidate) => {
      const pathNodes = candidate.ids
        .map((id) => byId.get(id))
        .filter((node): node is AssuranceGraphNode => Boolean(node));
      const roles = pathRoles(pathNodes);
      const score = (roles.includes("audit") ? 8 : 0)
        + (roles.includes("transaction") ? 6 : 0)
        + (roles.includes("authorization") ? 3 : 0)
        + (roles.includes("entrypoint") ? 1 : 0)
        - candidate.ids.length * 0.01;
      return { ...candidate, nodes: pathNodes, roles, score };
    })
    .sort((left, right) => right.score - left.score)[0];
  if (!scored) return null;

  const confidence: AssurancePathEvidence["confidence"] = scored.ids.length === 1
    ? "high"
    : scored.edgeConfidences.every((value) => value === "high")
      ? "medium"
      : "low";
  return {
    node_ids: scored.ids,
    qualified_names: scored.nodes.map((node) => node.qualified_name),
    roles: scored.roles,
    confidence,
  };
}
