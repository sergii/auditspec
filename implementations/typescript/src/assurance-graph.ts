import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { findAstCalls, type AstCallCandidate, type AstLanguage, type AstScope } from "./ast-calls.js";
import type { AssessmentConfidence, SourceLocation } from "./assessment-types.js";

export type AssuranceRole = "entrypoint" | "authorization" | "transaction" | "mutation" | "audit";

export interface AssuranceGraphNode {
  id: string;
  language: AstLanguage;
  name: string;
  qualified_name: string;
  location: SourceLocation;
  range: { start_line: number; end_line: number };
  roles: AssuranceRole[];
  confidence: AssessmentConfidence;
}

export interface AssuranceGraphEdge {
  from: string;
  to: string;
  kind: "call";
  confidence: "high" | "medium";
  call: {
    callee: string;
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
  };
}

export interface AssurancePathEvidence {
  node_ids: string[];
  qualified_names: string[];
  roles: AssuranceRole[];
  confidence: "high" | "medium" | "low";
}

interface IndexedScope {
  node: AssuranceGraphNode;
  calls: AstCallCandidate[];
  source: string;
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

const RUBY_MUTATIONS = new Set([
  "save!",
  "update!",
  "update",
  "destroy!",
  "destroy",
  "create!",
  "create",
  "delete",
  "delete_all",
  "destroy_all",
  "update_all",
  "insert_all",
  "upsert_all",
]);
const RUBY_AUTHORIZATION = new Set(["authorize", "policy_scope", "allowed_to?", "can?"]);
const PYTHON_AUTHORIZATION = new Set(["has_permission", "only_for", "check_permission", "get_roles"]);
const PYTHON_DOCUMENT_MUTATIONS = new Set(["save", "insert", "submit", "cancel", "delete", "db_set", "db_insert", "db_update"]);
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

function isPythonMutation(call: AstCallCandidate): boolean {
  return /^frappe\.db\.(set_value|update|bulk_update|delete|truncate)$/.test(call.callee)
    || call.callee === "frappe.delete_doc"
    || PYTHON_DOCUMENT_MUTATIONS.has(call.method);
}

function rolesForCalls(calls: AstCallCandidate[], language: AstLanguage): AssuranceRole[] {
  const roles = new Set<AssuranceRole>();
  for (const call of calls) {
    if (AUDIT_RE.test(call.callee) || AUDIT_RE.test(call.text)) roles.add("audit");
    if (language === "ruby") {
      if (RUBY_MUTATIONS.has(call.method)) roles.add("mutation");
      if (call.method === "transaction") roles.add("transaction");
      if (RUBY_AUTHORIZATION.has(call.method) || /\bPundit\b/.test(call.callee)) roles.add("authorization");
    } else {
      if (isPythonMutation(call)) roles.add("mutation");
      if (PYTHON_AUTHORIZATION.has(call.method)) roles.add("authorization");
    }
  }
  return [...roles].sort();
}

function isEntrypoint(path: string, scope: AstScope, source: string, language: AstLanguage): boolean {
  if (language === "ruby" && path.startsWith("app/controllers/")) return true;
  if (language === "python") {
    const lines = source.split("\n");
    const before = lines.slice(Math.max(0, scope.start_line - 5), scope.start_line - 1).join("\n");
    return /@frappe\.whitelist(?:\([^)]*\))?/.test(before);
  }
  return false;
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

function isSemanticCall(call: AstCallCandidate, language: AstLanguage): boolean {
  if (AUDIT_RE.test(call.callee) || AUDIT_RE.test(call.text)) return true;
  if (language === "ruby") {
    return RUBY_MUTATIONS.has(call.method) || call.method === "transaction" || RUBY_AUTHORIZATION.has(call.method);
  }
  return isPythonMutation(call) || PYTHON_AUTHORIZATION.has(call.method);
}

export async function buildAssuranceGraph(inputPath: string): Promise<AssuranceGraph> {
  const root = resolve(inputPath);
  const files = await collectSourceFiles(root);
  const indexed: IndexedScope[] = [];

  for (const absolutePath of files) {
    const source = await readText(absolutePath);
    if (source === null || source.length > 1_000_000) continue;
    const path = repoPath(root, absolutePath);
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
      const roles = rolesForCalls(calls, language);
      if (isEntrypoint(path, scope, source, language)) roles.push("entrypoint");
      const normalizedRoles = [...new Set(roles)].sort() as AssuranceRole[];
      indexed.push({
        source,
        calls,
        node: {
          id: stableId("node", `${language}:${path}:${scope.id}:${scope.qualified_name}`),
          language,
          name: scope.name,
          qualified_name: scope.qualified_name,
          location: { path, line: scope.start_line, column: scope.start_column },
          range: { start_line: scope.start_line, end_line: scope.end_line },
          roles: normalizedRoles,
          confidence: "high",
        },
      });
    }
  }

  const byName = new Map<string, IndexedScope[]>();
  for (const item of indexed) {
    const items = byName.get(item.node.name) ?? [];
    items.push(item);
    byName.set(item.node.name, items);
  }

  const edges: AssuranceGraphEdge[] = [];
  const unresolved: AssuranceUnresolvedCall[] = [];
  const edgeKeys = new Set<string>();

  for (const sourceScope of indexed) {
    for (const call of sourceScope.calls) {
      if (isSemanticCall(call, sourceScope.node.language)) continue;
      const candidates = (byName.get(call.method) ?? []).filter((candidate) => candidate.node.id !== sourceScope.node.id);
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

      const key = `${sourceScope.node.id}:${resolved.candidate.node.id}:${call.line}:${call.column}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push({
        from: sourceScope.node.id,
        to: resolved.candidate.node.id,
        kind: "call",
        confidence: resolved.confidence,
        call: { callee: call.callee, location },
      });
    }
  }

  const nodes = indexed.map((item) => item.node);
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
    },
  };
}

function nodeForLocation(graph: AssuranceGraph, location: SourceLocation): AssuranceGraphNode | undefined {
  if (!location.line) return undefined;
  return graph.nodes
    .filter((node) => node.location.path === location.path && location.line! >= node.range.start_line && location.line! <= node.range.end_line)
    .sort((a, b) => (a.range.end_line - a.range.start_line) - (b.range.end_line - b.range.start_line))[0];
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
      const nodes = candidate.ids.map((id) => byId.get(id)).filter((node): node is AssuranceGraphNode => Boolean(node));
      const roles = pathRoles(nodes);
      const score = (roles.includes("audit") ? 8 : 0)
        + (roles.includes("transaction") ? 6 : 0)
        + (roles.includes("authorization") ? 3 : 0)
        + (roles.includes("entrypoint") ? 1 : 0)
        - candidate.ids.length * 0.01;
      return { ...candidate, nodes, roles, score };
    })
    .sort((a, b) => b.score - a.score)[0];
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
