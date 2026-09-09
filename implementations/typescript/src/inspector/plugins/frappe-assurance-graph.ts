import type { AstCallCandidate } from "../../ast-calls.js";
import { frappeDocumentControllerMethods, frappeDocumentHookDispatches } from "../../frappe-document-hooks.js";
import { frappeImportedEnqueueTarget, frappeLocalEnqueueReference } from "../../frappe-enqueue-local.js";
import { frappeStaticHookDispatches } from "../../frappe-hooks.js";
import { isFrappeWhitelistedScope } from "../../frappe-whitelist.js";
import type { AssuranceRole } from "../assurance-graph/core.js";
import type {
  AssuranceGraphIndexedScope,
  AssuranceGraphPlugin,
  AssuranceGraphPluginContext,
} from "../assurance-graph/plugin.js";

const PYTHON_AUTHORIZATION = new Set(["has_permission", "only_for", "check_permission", "get_roles"]);
const PYTHON_DOCUMENT_MUTATIONS = new Set([
  "save",
  "insert",
  "submit",
  "cancel",
  "delete",
  "db_set",
  "db_insert",
  "db_update",
]);

function isFrappeMutation(call: AstCallCandidate): boolean {
  return /^frappe\.db\.(set_value|update|bulk_update|delete|truncate)$/.test(call.callee)
    || call.callee === "frappe.delete_doc"
    || PYTHON_DOCUMENT_MUTATIONS.has(call.method);
}

function rolesForFrappeScope(item: AssuranceGraphIndexedScope): AssuranceRole[] {
  if (item.node.language !== "python") return [];

  const roles = new Set<AssuranceRole>();
  for (const call of item.calls) {
    if (isFrappeMutation(call)) roles.add("mutation");
    if (PYTHON_AUTHORIZATION.has(call.method)) roles.add("authorization");
  }
  if (isFrappeWhitelistedScope(item.source, item.scope)) roles.add("entrypoint");
  return [...roles].sort();
}

function consumesFrappeCall(call: AstCallCandidate, item: AssuranceGraphIndexedScope): boolean {
  if (item.node.language !== "python") return false;
  return isFrappeMutation(call) || PYTHON_AUTHORIZATION.has(call.method);
}

function splitTopLevelCallArguments(callText: string, callee: string): string[] | null {
  const text = callText.trim();
  const prefix = `${callee}(`;
  if (!text.startsWith(prefix) || !text.endsWith(")")) return null;

  const body = text.slice(prefix.length, -1);
  if (body.includes("'''") || body.includes('"""')) return null;

  const argumentsList: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
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
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    if (char === "," && depth === 0) {
      const argument = body.slice(start, index).trim();
      if (argument) argumentsList.push(argument);
      start = index + 1;
    }
  }

  if (quote || depth !== 0) return null;
  const tail = body.slice(start).trim();
  if (tail) argumentsList.push(tail);
  return argumentsList;
}

function pythonKeywordArgument(argument: string): { name: string; value: string } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(argument.trim());
  if (!match) return null;
  return { name: match[1]!, value: match[2]!.trim() };
}

function literalPythonString(value: string): string | undefined {
  const match = /^(["'])([^\\\n\r]*)\1$/.exec(value.trim());
  return match?.[2];
}

function literalDottedPythonString(value: string): string | undefined {
  const literal = literalPythonString(value);
  if (!literal || !/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(literal)) return undefined;
  return literal;
}

function frappeEnqueueTarget(callText: string): string | undefined {
  const argumentsList = splitTopLevelCallArguments(callText, "frappe.enqueue");
  if (!argumentsList) return undefined;

  const methodArguments = argumentsList
    .map((argument) => pythonKeywordArgument(argument))
    .filter((argument): argument is { name: string; value: string } => argument?.name === "method");
  if (methodArguments.length > 0) {
    if (methodArguments.length !== 1) return undefined;
    return literalDottedPythonString(methodArguments[0]!.value);
  }

  const positional = argumentsList.filter((argument) => {
    const trimmed = argument.trim();
    return !pythonKeywordArgument(trimmed) && !trimmed.startsWith("*");
  });
  if (positional.length === 0) return undefined;
  return literalDottedPythonString(positional[0]!);
}

function frappeEnqueueDocTarget(callText: string): { doctype: string; method: string } | undefined {
  const argumentsList = splitTopLevelCallArguments(callText, "frappe.enqueue_doc");
  if (!argumentsList || argumentsList.some((argument) => argument.trim().startsWith("*"))) return undefined;

  const keywords = argumentsList
    .map((argument) => pythonKeywordArgument(argument))
    .filter((argument): argument is { name: string; value: string } => Boolean(argument));
  const keywordNames = keywords.map((argument) => argument.name);
  if (new Set(keywordNames).size !== keywordNames.length) return undefined;

  const positionals = argumentsList.filter((argument) => !pythonKeywordArgument(argument));
  const argumentFor = (name: string, index: number): string | undefined =>
    keywords.find((argument) => argument.name === name)?.value ?? positionals[index];

  const doctypeValue = argumentFor("doctype", 0);
  const nameValue = argumentFor("name", 1);
  const methodValue = argumentFor("method", 2);
  if (!doctypeValue || !nameValue || !methodValue) return undefined;

  const doctype = literalPythonString(doctypeValue);
  const method = literalPythonString(methodValue);
  if (!doctype || !method || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(method)) return undefined;
  return { doctype, method };
}

function frappeDocTypeSlug(doctype: string): string | undefined {
  const slug = doctype.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug || undefined;
}

function resolveFrappeDocumentMethod(
  context: AssuranceGraphPluginContext,
  doctype: string,
  method: string,
): AssuranceGraphIndexedScope | undefined {
  const slug = frappeDocTypeSlug(doctype);
  if (!slug) return undefined;
  const controllerSuffix = `doctype/${slug}/${slug}.py`;
  const candidates: AssuranceGraphIndexedScope[] = [];

  for (const [path, source] of context.sourceByPath) {
    if (path !== controllerSuffix && !path.endsWith(`/${controllerSuffix}`)) continue;
    const methods = context.indexed
      .filter(
        (item) => item.node.language === "python"
          && item.node.location.path === path
          && typeof item.node.location.line === "number",
      )
      .map((item) => ({
        name: item.node.name,
        qualified_name: item.node.qualified_name,
        line: item.node.location.line!,
      }));
    const resolvedMethods = frappeDocumentControllerMethods(source, path, methods)
      .filter((candidate) => candidate.name === method);
    for (const candidate of resolvedMethods) {
      const indexedTarget = context.indexed.find(
        (item) => item.node.location.path === path
          && item.node.qualified_name === candidate.qualified_name,
      );
      if (indexedTarget) candidates.push(indexedTarget);
    }
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function applyStaticHooks(context: AssuranceGraphPluginContext): void {
  for (const [path, source] of context.sourceByPath) {
    if (!path.endsWith("hooks.py")) continue;
    for (const hook of frappeStaticHookDispatches(source)) {
      const target = context.resolvePythonDottedTarget(hook.target);
      if (!target) continue;
      const surfaceKind = hook.assignment === "doc_events" ? "frappe_doc_event" : "frappe_scheduler";
      const location = { path, line: hook.line, column: 1 };
      const surface = context.addSurface("python", "frappe", surfaceKind, hook.target, location);
      context.pushEdge({
        from: surface.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: surfaceKind, detail: `${hook.assignment} -> ${hook.target}`, location },
      });
    }
  }
}

function applyDocumentDispatch(context: AssuranceGraphPluginContext): void {
  for (const [path, source] of context.sourceByPath) {
    if (!path.endsWith(".py")) continue;
    const methods = context.indexed
      .filter(
        (item) => item.node.language === "python"
          && item.node.location.path === path
          && typeof item.node.location.line === "number",
      )
      .map((item) => ({
        name: item.node.name,
        qualified_name: item.node.qualified_name,
        line: item.node.location.line!,
      }));

    for (const dispatch of frappeDocumentHookDispatches(source, path, methods)) {
      const target = context.indexed.find(
        (item) => item.node.location.path === path
          && item.node.qualified_name === dispatch.target_qualified_name,
      );
      if (!target) continue;
      const location = { path, line: dispatch.line, column: 1 };
      const surface = context.addSurface("python", "frappe", dispatch.surface_kind, dispatch.detail, location);
      context.pushEdge({
        from: surface.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: dispatch.surface_kind, detail: dispatch.detail, location },
      });
    }
  }
}

function applyEnqueueDispatch(context: AssuranceGraphPluginContext): void {
  for (const sourceScope of context.indexed.filter((item) => item.node.language === "python")) {
    for (const call of sourceScope.calls) {
      if (call.callee === "frappe.enqueue") {
        const dottedTargetName = frappeEnqueueTarget(call.text);
        let targetName = dottedTargetName;
        let target = dottedTargetName ? context.resolvePythonDottedTarget(dottedTargetName) : undefined;

        if (!targetName) {
          const importedTargetName = frappeImportedEnqueueTarget({
            call_text: call.text,
            source: sourceScope.source,
            scope_start_line: sourceScope.node.range.start_line,
            scope_end_line: sourceScope.node.range.end_line,
            call_line: call.line,
          });
          if (importedTargetName) {
            targetName = importedTargetName;
            target = context.resolvePythonDottedTarget(importedTargetName);
          }
        }

        if (!targetName) {
          targetName = frappeLocalEnqueueReference({
            call_text: call.text,
            source: sourceScope.source,
            scope_start_line: sourceScope.node.range.start_line,
            scope_end_line: sourceScope.node.range.end_line,
          });
          if (!targetName) continue;
          const candidates = context.indexed.filter(
            (item) => item.node.language === "python"
              && item.node.location.path === sourceScope.node.location.path
              && item.node.qualified_name === targetName,
          );
          target = candidates.length === 1 ? candidates[0] : undefined;
        }

        if (!target) continue;
        context.addRole(target.node, "entrypoint");
        const location = {
          path: sourceScope.node.location.path,
          line: call.line,
          column: call.column,
        };
        context.pushEdge({
          from: sourceScope.node.id,
          to: target.node.id,
          kind: "framework_dispatch",
          confidence: "high",
          framework: { kind: "frappe_enqueue", detail: `frappe.enqueue -> ${targetName}`, location },
        });
        continue;
      }

      if (call.callee === "frappe.enqueue_doc") {
        const dispatch = frappeEnqueueDocTarget(call.text);
        if (!dispatch) continue;
        const target = resolveFrappeDocumentMethod(context, dispatch.doctype, dispatch.method);
        if (!target) continue;
        context.addRole(target.node, "entrypoint");
        const location = {
          path: sourceScope.node.location.path,
          line: call.line,
          column: call.column,
        };
        context.pushEdge({
          from: sourceScope.node.id,
          to: target.node.id,
          kind: "framework_dispatch",
          confidence: "high",
          framework: {
            kind: "frappe_enqueue_doc",
            detail: `frappe.enqueue_doc ${dispatch.doctype}#${dispatch.method} -> ${target.node.qualified_name}`,
            location,
          },
        });
      }
    }
  }
}

export const frappeAssuranceGraphPlugin: AssuranceGraphPlugin = {
  id: "frappe-assurance-graph-v0.1",
  framework: "frappe",
  classifyScope: rolesForFrappeScope,
  consumesCall: consumesFrappeCall,
  apply(context) {
    applyStaticHooks(context);
    applyDocumentDispatch(context);
    applyEnqueueDispatch(context);
  },
};
