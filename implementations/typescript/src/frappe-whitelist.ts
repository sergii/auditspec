import {
  pythonDecoratorsForScope,
  pythonImportBindingsForScope,
  type AstScope,
  type PythonImportBinding,
} from "./ast-calls.js";

const FRAPPE_WHITELIST_DECORATOR = /^@frappe\.whitelist(?:\(.*\))?$/;
const PYTHON_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function normalizedDecoratorCallable(decorator: string): string | undefined {
  const normalized = decorator.replace(/\s+/g, "");
  if (!normalized.startsWith("@")) return undefined;

  const expression = normalized.slice(1);
  const parenthesis = expression.indexOf("(");
  const callable = parenthesis >= 0 ? expression.slice(0, parenthesis) : expression;
  return callable || undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasIsStableUntilDefinition(
  source: string,
  localName: string,
  importLine: number,
  definitionLine: number,
): boolean {
  const escaped = escapeRegExp(localName);
  const mention = new RegExp(`\\b${escaped}\\b`);
  const lines = source.split("\n");

  // Be deliberately conservative: after the proven import, any additional textual
  // use of the alias before the definition is ambiguous unless it is the decorator
  // itself. This rejects rebinding, duplicate imports, globals tricks, and unusual
  // control-flow without trying to interpret Python execution order.
  for (const line of lines.slice(importLine, Math.max(importLine, definitionLine - 1))) {
    if (!mention.test(line)) continue;
    if (line.trimStart().startsWith("@")) continue;
    return false;
  }
  return true;
}

function uniqueBinding(
  bindings: PythonImportBinding[],
  predicate: (binding: PythonImportBinding) => boolean,
): PythonImportBinding | undefined {
  const matching = bindings.filter(predicate);
  return matching.length === 1 ? matching[0] : undefined;
}

function importedWhitelistDecorator(source: string, scope: AstScope, decorator: string): boolean {
  const callable = normalizedDecoratorCallable(decorator);
  if (!callable) return false;

  const imports = pythonImportBindingsForScope(source, {
    start_line: scope.start_line,
    end_line: scope.end_line,
  });
  if (!imports.parsed || !imports.complete || imports.wildcard_in_module) return false;

  let binding: PythonImportBinding | undefined;
  if (PYTHON_IDENTIFIER.test(callable)) {
    binding = uniqueBinding(
      imports.bindings,
      (candidate) => candidate.owner === "module"
        && candidate.direct
        && candidate.kind === "from"
        && candidate.module === "frappe"
        && candidate.imported_name === "whitelist"
        && candidate.local_name === callable
        && candidate.line < scope.start_line,
    );
  } else {
    const moduleAlias = /^([A-Za-z_][A-Za-z0-9_]*)\.whitelist$/.exec(callable)?.[1];
    if (!moduleAlias) return false;
    binding = uniqueBinding(
      imports.bindings,
      (candidate) => candidate.owner === "module"
        && candidate.direct
        && candidate.kind === "module"
        && candidate.module === "frappe"
        && candidate.local_name === moduleAlias
        && candidate.line < scope.start_line,
    );
  }

  if (!binding) return false;
  return aliasIsStableUntilDefinition(source, binding.local_name, binding.line, scope.start_line);
}

export function isFrappeWhitelistedScope(source: string, scope: AstScope): boolean {
  if (scope.kind !== "function") return false;

  const decorators = pythonDecoratorsForScope(source, scope);
  if (!decorators) return false;

  return decorators.some((decorator) => {
    const normalized = decorator.replace(/\s+/g, "");
    return FRAPPE_WHITELIST_DECORATOR.test(normalized)
      || importedWhitelistDecorator(source, scope, decorator);
  });
}
