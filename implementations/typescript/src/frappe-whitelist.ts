import { pythonDecoratorsForScope, type AstScope } from "./ast-calls.js";

const FRAPPE_WHITELIST_DECORATOR = /^@frappe\.whitelist(?:\(.*\))?$/;

export function isFrappeWhitelistedScope(source: string, scope: AstScope): boolean {
  if (scope.kind !== "function") return false;

  const decorators = pythonDecoratorsForScope(source, scope);
  if (!decorators) return false;

  return decorators.some((decorator) =>
    FRAPPE_WHITELIST_DECORATOR.test(decorator.replace(/\s+/g, "")),
  );
}
