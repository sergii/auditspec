import type { AstScope } from "./ast-calls.js";

const FRAPPE_WHITELIST_DECORATOR = /^@frappe\.whitelist(?:\([^()\n]*\))?$/;

export function isFrappeWhitelistedScope(source: string, scope: AstScope): boolean {
  if (scope.kind !== "function" || scope.start_line <= 1) return false;

  const lines = source.split("\n");
  let index = scope.start_line - 2;

  while (index >= 0) {
    const trimmed = (lines[index] ?? "").trim();
    if (!trimmed.startsWith("@")) break;
    if (FRAPPE_WHITELIST_DECORATOR.test(trimmed)) return true;
    index -= 1;
  }

  return false;
}
