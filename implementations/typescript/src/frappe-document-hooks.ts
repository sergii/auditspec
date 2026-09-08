import { findAstCalls } from "./ast-calls.js";

export interface FrappeDocumentMethod {
  name: string;
  qualified_name: string;
  line: number;
}

export interface FrappeDocumentHookDispatch {
  target_qualified_name: string;
  surface_kind: "frappe_document_hook" | "frappe_queue_action";
  detail: string;
  line: number;
}

const FRAPPE_DOCUMENT_HOOKS = new Set([
  "before_insert",
  "before_naming",
  "autoname",
  "before_validate",
  "validate",
  "before_save",
  "before_submit",
  "before_cancel",
  "before_update_after_submit",
  "after_insert",
  "on_update",
  "on_submit",
  "on_cancel",
  "on_update_after_submit",
  "on_change",
  "before_rename",
  "after_rename",
  "on_trash",
  "after_delete",
]);

const FRAPPE_DOCUMENT_INHERITED_INNER_ACTIONS = new Set([
  "save",
  "submit",
  "cancel",
  "rename",
]);

export function isFrappeDocumentHookName(name: string): boolean {
  return FRAPPE_DOCUMENT_HOOKS.has(name);
}

function conventionalDocTypeControllerPath(path: string): boolean {
  const match = /(?:^|\/)doctype\/([^/]+)\/([^/]+)\.py$/.exec(path);
  return Boolean(match && match[1] === match[2]);
}

function explicitDocumentClass(source: string): { name: string; line: number } | null {
  const matches = [...source.matchAll(
    /^\s*class\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*(?:Document|frappe\.model\.document\.Document)\s*\)\s*:\s*(?:#.*)?$/gm,
  )];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const line = source.slice(0, match.index ?? 0).split("\n").length;
  return { name: match[1]!, line };
}

function containerForQualifiedName(qualifiedName: string): string | undefined {
  const parts = qualifiedName.split(".");
  return parts.length >= 2 ? parts.at(-2) : undefined;
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

function keywordArgument(argument: string): { name: string; value: string } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(argument.trim());
  if (!match) return null;
  return { name: match[1]!, value: match[2]!.trim() };
}

function literalPythonIdentifierString(value: string): string | undefined {
  const match = /^(["'])([A-Za-z_][A-Za-z0-9_]*)\1$/.exec(value.trim());
  return match?.[2];
}

function queueActionName(callText: string): string | undefined {
  const argumentsList = splitTopLevelCallArguments(callText, "self.queue_action");
  if (!argumentsList || argumentsList.some((argument) => argument.trim().startsWith("*"))) return undefined;

  const actionKeywords = argumentsList
    .map((argument) => keywordArgument(argument))
    .filter((argument): argument is { name: string; value: string } => argument?.name === "action");
  if (actionKeywords.length > 1) return undefined;

  const positionals = argumentsList.filter((argument) => !keywordArgument(argument));
  if (actionKeywords.length === 1 && positionals.length > 0) return undefined;

  const value = actionKeywords[0]?.value ?? positionals[0];
  if (!value) return undefined;
  return literalPythonIdentifierString(value);
}

export function frappeDocumentControllerMethods(
  source: string,
  path: string,
  methods: readonly FrappeDocumentMethod[],
): FrappeDocumentMethod[] {
  if (!conventionalDocTypeControllerPath(path)) return [];

  const controller = explicitDocumentClass(source);
  if (!controller) return [];

  return methods
    .filter((method) => method.line > controller.line)
    .filter((method) => containerForQualifiedName(method.qualified_name) === controller.name);
}

function frappeDocumentQueueActionDispatches(
  source: string,
  path: string,
  methods: readonly FrappeDocumentMethod[],
): FrappeDocumentHookDispatch[] {
  const controllerMethods = frappeDocumentControllerMethods(source, path, methods);
  if (controllerMethods.length === 0) return [];

  const controllerScopes = new Set(controllerMethods.map((method) => method.qualified_name));
  const scan = findAstCalls(source, "python");
  if (!scan.parsed) return [];

  const dispatches: FrappeDocumentHookDispatch[] = [];
  for (const call of scan.calls) {
    if (call.callee !== "self.queue_action" || !call.scope || !controllerScopes.has(call.scope.qualified_name)) continue;
    const action = queueActionName(call.text);
    if (!action) continue;

    const innerMethod = controllerMethods.find((method) => method.name === `_${action}`);
    const directMethod = controllerMethods.find((method) => method.name === action);
    const target = innerMethod
      ?? (FRAPPE_DOCUMENT_INHERITED_INNER_ACTIONS.has(action) ? undefined : directMethod);
    if (!target) continue;

    dispatches.push({
      target_qualified_name: target.qualified_name,
      surface_kind: "frappe_queue_action",
      detail: `QUEUE_ACTION ${call.scope.qualified_name} -> ${target.qualified_name} [action=${action}]`,
      line: call.line,
    });
  }

  return dispatches;
}

export function frappeDocumentHookDispatches(
  source: string,
  path: string,
  methods: readonly FrappeDocumentMethod[],
): FrappeDocumentHookDispatch[] {
  const lifecycleDispatches = frappeDocumentControllerMethods(source, path, methods)
    .filter((method) => isFrappeDocumentHookName(method.name))
    .map((method) => ({
      target_qualified_name: method.qualified_name,
      surface_kind: "frappe_document_hook" as const,
      detail: `DOCUMENT_HOOK ${method.name} -> ${method.qualified_name}`,
      line: method.line,
    }));

  return [...lifecycleDispatches, ...frappeDocumentQueueActionDispatches(source, path, methods)];
}
