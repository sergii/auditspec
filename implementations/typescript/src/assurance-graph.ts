import { createHash } from "node:crypto";
import { type Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { findAstCalls, type AstCallCandidate, type AstLanguage, type AstScope } from "./ast-calls.js";
import type { AssessmentConfidence, SourceLocation } from "./assessment-types.js";
import { actionCableDispatches, composedActionCableActionDispatches } from "./rails-action-cable.js";
import { hasAuthorizationBeforeAction } from "./rails-callbacks.js";
import { railsRouteDeclarations, type RailsRouteDeclaration } from "./rails-routes.js";

export type AssuranceRole = "entrypoint" | "authorization" | "transaction" | "mutation" | "audit";
export type AssuranceFramework = "rails" | "frappe";

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
const RUBY_AUTHORIZATION = new Set([
  "authorize",
  "policy_scope",
  "allowed_to?",
  "can?",
  "reject_unauthorized_connection",
]);
const PYTHON_AUTHORIZATION = new Set(["has_permission", "only_for", "check_permission", "get_roles"]);
const PYTHON_DOCUMENT_MUTATIONS = new Set(["save", "insert", "submit", "cancel", "delete", "db_set", "db_insert", "db_update"]);
const RAILS_JOB_DISPATCH = new Set(["perform_later", "perform_now", "perform_async", "perform_in", "perform_at"]);
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

function isWhitelistedFrappeScope(scope: AstScope, source: string): boolean {
  const lines = source.split("\n");
  const before = lines.slice(Math.max(0, scope.start_line - 5), scope.start_line - 1).join("\n");
  return /@frappe\.whitelist(?:\([^)]*\))?/.test(before);
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

function addRole(node: AssuranceGraphNode, role: AssuranceRole): void {
  if (!node.roles.includes(role)) node.roles = [...node.roles, role].sort() as AssuranceRole[];
}

function isRailsJobScope(item: IndexedScope): boolean {
  if (item.node.language !== "ruby" || item.node.name !== "perform") return false;
  const container = containerHint(item.node);
  if (!container) return false;
  const escaped = container.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`class\\s+${escaped}\\s*<\\s*(?:ApplicationJob|ActiveJob::Base)\\b`).test(item.source)
    || /include\s+Sidekiq::(?:Job|Worker)\b/.test(item.source);
}

function camelizeController(value: string): string {
  return value
    .split("/")
    .map((segment) => segment.split("_").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(""))
    .join("::") + "Controller";
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function routeDeclarations(source: string): RailsRouteDeclaration[] {
  return railsRouteDeclarations(source);
}

function dottedTarget(callText: string): string | undefined {
  return callText.match(/["']([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+)["']/)?.[1];
}

function resolvePythonDottedTarget(indexed: IndexedScope[], target: string): IndexedScope | undefined {
  const parts = target.split(".");
  if (parts.length < 2) return undefined;
  const name = parts.at(-1)!;
  const modulePath = `${parts.slice(0, -1).join("/")}.py`;
  const candidates = indexed.filter((item) => item.node.language === "python" && item.node.name === name && item.node.location.path.endsWith(modulePath));
  return candidates.length === 1 ? candidates[0] : undefined;
}

function assignmentBlock(source: string, name: string): { text: string; offset: number } | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*\\{`).exec(source);
  if (!match || match.index === undefined) return null;
  const open = source.indexOf("{", match.index);
  if (open < 0) return null;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return { text: source.slice(open, index + 1), offset: open };
    }
  }
  return null;
}

function hookTargets(source: string, assignment: string): Array<{ target: string; line: number }> {
  const block = assignmentBlock(source, assignment);
  if (!block) return [];
  const targets: Array<{ target: string; line: number }> = [];
  const stringPattern = /["']([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*){2,})["']/g;
  for (const match of block.text.matchAll(stringPattern)) {
    targets.push({ target: match[1]!, line: lineAt(source, block.offset + (match.index ?? 0)) });
  }
  return targets;
}

function frameworkSurface(
  language: AstLanguage,
  framework: AssuranceFramework,
  surfaceKind: string,
  detail: string,
  location: SourceLocation,
): AssuranceGraphNode {
  const qualified = `${framework}.${surfaceKind}:${detail}`;
  return {
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
}

export async function buildAssuranceGraph(inputPath: string): Promise<AssuranceGraph> {
  const root = resolve(inputPath);
  const files = await collectSourceFiles(root);
  const indexed: IndexedScope[] = [];
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
      const roles = rolesForCalls(calls, language);
      if (language === "python" && isWhitelistedFrappeScope(scope, source)) roles.push("entrypoint");
      const normalizedRoles = [...new Set(roles)].sort() as AssuranceRole[];
      indexed.push({
        source,
        calls,
        node: {
          id: stableId("node", `${language}:${path}:${scope.id}:${scope.qualified_name}`),
          kind: "scope",
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

  for (const item of indexed) {
    if (isRailsJobScope(item)) addRole(item.node, "entrypoint");
  }

  const byName = new Map<string, IndexedScope[]>();
  for (const item of indexed) {
    const items = byName.get(item.node.name) ?? [];
    items.push(item);
    byName.set(item.node.name, items);
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

      pushEdge({
        from: sourceScope.node.id,
        to: resolved.candidate.node.id,
        kind: "call",
        confidence: resolved.confidence,
        call: { callee: call.callee, location },
      });
    }
  }

  const routesSource = sourceByPath.get("config/routes.rb");
  if (routesSource) {
    for (const route of routeDeclarations(routesSource)) {
      const targetName = `${camelizeController(route.controller)}#${route.action}`;
      const target = indexed.find((item) => item.node.qualified_name === targetName);
      if (!target) continue;
      const location: SourceLocation = { path: "config/routes.rb", line: route.line, column: 1 };
      const constraintSuffix = route.constraints?.length
        ? ` [constraints: ${route.constraints.join(" && ")}]`
        : "";
      const detail = `${route.verb} ${route.path} -> ${route.controller}#${route.action}${constraintSuffix}`;
      const surface = frameworkSurface("ruby", "rails", "rails_route", detail, location);
      nodes.push(surface);
      pushEdge({
        from: surface.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: "rails_route", detail: surface.surface!.detail, location },
      });
    }
  }

  const actionCableSources = [...sourceByPath.entries()]
    .filter(([path]) => path.startsWith("app/channels/") && path.endsWith(".rb"))
    .map(([path, source]) => ({
      path,
      source,
      methods: indexed
        .filter((item) => item.node.language === "ruby" && item.node.location.path === path && typeof item.node.location.line === "number")
        .map((item) => ({
          name: item.node.name,
          qualified_name: item.node.qualified_name,
          line: item.node.location.line!,
        })),
    }));

  for (const { path, source, methods } of actionCableSources) {
    for (const dispatch of actionCableDispatches(source, path, methods)) {
      const target = indexed.find(
        (item) => item.node.location.path === path && item.node.qualified_name === dispatch.target_qualified_name,
      );
      if (!target) continue;
      const location: SourceLocation = { path, line: dispatch.line, column: 1 };
      const surface = frameworkSurface("ruby", "rails", dispatch.surface_kind, dispatch.detail, location);
      nodes.push(surface);
      pushEdge({
        from: surface.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: dispatch.surface_kind, detail: dispatch.detail, location },
      });
    }
  }

  for (const dispatch of composedActionCableActionDispatches(actionCableSources)) {
    if (!dispatch.source_path || !dispatch.target_path) continue;
    const target = indexed.find(
      (item) => item.node.location.path === dispatch.target_path
        && item.node.qualified_name === dispatch.target_qualified_name,
    );
    if (!target) continue;
    const location: SourceLocation = { path: dispatch.source_path, line: dispatch.line, column: 1 };
    const surface = frameworkSurface("ruby", "rails", dispatch.surface_kind, dispatch.detail, location);
    nodes.push(surface);
    pushEdge({
      from: surface.id,
      to: target.node.id,
      kind: "framework_dispatch",
      confidence: "high",
      framework: { kind: dispatch.surface_kind, detail: dispatch.detail, location },
    });
  }

  for (const sourceScope of indexed.filter((item) => item.node.language === "ruby")) {
    for (const call of sourceScope.calls) {
      if (!RAILS_JOB_DISPATCH.has(call.method)) continue;
      const receiver = receiverHint(call.callee, call.method);
      if (!receiver) continue;
      const candidates = indexed.filter((item) => item.node.language === "ruby" && item.node.name === "perform" && containerHint(item.node) === receiver);
      if (candidates.length !== 1) continue;
      const target = candidates[0]!;
      addRole(target.node, "entrypoint");
      const location: SourceLocation = { path: sourceScope.node.location.path, line: call.line, column: call.column };
      pushEdge({
        from: sourceScope.node.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: "rails_job_dispatch", detail: `${call.callee} -> ${target.node.qualified_name}`, location },
      });
    }
  }

  for (const [path, source] of sourceByPath) {
    if (!path.endsWith("hooks.py")) continue;
    for (const [assignment, surfaceKind] of [["doc_events", "frappe_doc_event"], ["scheduler_events", "frappe_scheduler"]] as const) {
      for (const hook of hookTargets(source, assignment)) {
        const target = resolvePythonDottedTarget(indexed, hook.target);
        if (!target) continue;
        const location: SourceLocation = { path, line: hook.line, column: 1 };
        const surface = frameworkSurface("python", "frappe", surfaceKind, hook.target, location);
        nodes.push(surface);
        pushEdge({
          from: surface.id,
          to: target.node.id,
          kind: "framework_dispatch",
          confidence: "high",
          framework: { kind: surfaceKind, detail: `${assignment} -> ${hook.target}`, location },
        });
      }
    }
  }

  for (const sourceScope of indexed.filter((item) => item.node.language === "python")) {
    for (const call of sourceScope.calls) {
      if (call.callee !== "frappe.enqueue" && call.method !== "enqueue") continue;
      const targetName = dottedTarget(call.text);
      if (!targetName) continue;
      const target = resolvePythonDottedTarget(indexed, targetName);
      if (!target) continue;
      addRole(target.node, "entrypoint");
      const location: SourceLocation = { path: sourceScope.node.location.path, line: call.line, column: call.column };
      pushEdge({
        from: sourceScope.node.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: "frappe_enqueue", detail: `frappe.enqueue -> ${targetName}`, location },
      });
    }
  }

  const routedControllers = new Set(
    edges.filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "rails_route").map((edge) => edge.to),
  );
  const controllerSources = [...sourceByPath.entries()]
    .filter(([path]) => path.startsWith("app/controllers/") && path.endsWith(".rb"))
    .map(([path, source]) => ({ path, source }));
  const authorizationMethods = new Set(
    indexed
      .filter((item) => item.node.language === "ruby" && item.node.roles.includes("authorization"))
      .map((item) => item.node.qualified_name),
  );

  for (const targetId of routedControllers) {
    const target = indexed.find((item) => item.node.id === targetId);
    if (!target || target.node.language !== "ruby") continue;
    const controller = target.node.qualified_name.split("#")[0];
    if (!controller) continue;

    const hasAuthorizationCallback = hasAuthorizationBeforeAction({
      target_source: target.source,
      controller,
      action: target.node.name,
      controller_sources: controllerSources,
      authorization_methods: authorizationMethods,
    });
    if (hasAuthorizationCallback) addRole(target.node, "authorization");
  }

  for (const item of indexed) {
    if (item.node.language === "ruby" && item.node.location.path.startsWith("app/controllers/") && !routedControllers.has(item.node.id)) {
      addRole(item.node, "entrypoint");
    }
  }

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
    .filter((node) => node.kind === "scope" && node.location.path === location.path && location.line! >= node.range.start_line && location.line! <= node.range.end_line)
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
      const pathNodes = candidate.ids.map((id) => byId.get(id)).filter((node): node is AssuranceGraphNode => Boolean(node));
      const roles = pathRoles(pathNodes);
      const score = (roles.includes("audit") ? 8 : 0)
        + (roles.includes("transaction") ? 6 : 0)
        + (roles.includes("authorization") ? 3 : 0)
        + (roles.includes("entrypoint") ? 1 : 0)
        - candidate.ids.length * 0.01;
      return { ...candidate, nodes: pathNodes, roles, score };
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
