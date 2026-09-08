import { pythonImportBindingsForScope } from "./ast-calls.js";

export interface FrappeLocalEnqueueContext {
  call_text: string;
  source: string;
  scope_start_line: number;
  scope_end_line: number;
}

function splitTopLevelCallArguments(callText: string): string[] | null {
  const text = callText.trim();
  const prefix = "frappe.enqueue(";
  if (!text.startsWith(prefix) || !text.endsWith(")")) return null;

  const body = text.slice(prefix.length, -1);
  if (body.includes("'''") || body.includes('"""')) return null;

  const args: string[] = [];
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
      const arg = body.slice(start, index).trim();
      if (arg) args.push(arg);
      start = index + 1;
    }
  }

  if (quote || depth !== 0) return null;
  const tail = body.slice(start).trim();
  if (tail) args.push(tail);
  return args;
}

function keywordArgument(argument: string): { name: string; value: string } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/.exec(argument.trim());
  if (!match) return null;
  return { name: match[1]!, value: match[2]!.trim() };
}

function referenceExpression(callText: string): string | undefined {
  const args = splitTopLevelCallArguments(callText);
  if (!args || args.some((argument) => argument.trim().startsWith("*"))) return undefined;

  const methods = args
    .map((argument) => keywordArgument(argument))
    .filter((argument): argument is { name: string; value: string } => argument?.name === "method");
  if (methods.length > 0) {
    if (methods.length !== 1) return undefined;
    return methods[0]!.value;
  }

  const positionals = args.filter((argument) => !keywordArgument(argument));
  return positionals[0]?.trim();
}

export function frappeEnqueueBareReference(callText: string): string | undefined {
  const reference = referenceExpression(callText);
  return reference && /^[A-Za-z_][A-Za-z0-9_]*$/.test(reference) ? reference : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scopeMayRebindName(source: string, startLine: number, endLine: number, name: string): boolean {
  const lines = source.split("\n");
  const scopeLines = lines.slice(Math.max(0, startLine - 1), endLine);
  const escaped = escapeRegExp(name);

  let headerEnd = 0;
  let depth = 0;
  let quote: string | null = null;
  let escapedChar = false;
  outer: for (let lineIndex = 0; lineIndex < scopeLines.length; lineIndex += 1) {
    const line = scopeLines[lineIndex] ?? "";
    for (let column = 0; column < line.length; column += 1) {
      const char = line[column]!;
      if (quote) {
        if (escapedChar) escapedChar = false;
        else if (char === "\\") escapedChar = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "(" || char === "[" || char === "{") depth += 1;
      else if (char === ")" || char === "]" || char === "}") depth = Math.max(0, depth - 1);
      else if (char === ":" && depth === 0) {
        headerEnd = lineIndex;
        break outer;
      }
    }
  }

  const header = scopeLines.slice(0, headerEnd + 1).join("\n");
  if (new RegExp(`\\b${escaped}\\b`).test(header)) return true;

  const body = scopeLines.slice(headerEnd + 1).join("\n");
  if (new RegExp(`\\b(?:global|nonlocal)\\b[^\\n#]*\\b${escaped}\\b`).test(body)) return true;
  if (new RegExp(`\\bfor\\s+${escaped}\\s+in\\b`).test(body)) return true;
  if (new RegExp(`\\bas\\s+${escaped}\\b`).test(body)) return true;
  if (new RegExp(`\\b${escaped}\\s*:=`).test(body)) return true;
  if (new RegExp(`^\\s*${escaped}\\s*(?::[^=\\n]+)?=(?!=)`, "m").test(body)) return true;
  if (new RegExp(`\\bdel\\s+${escaped}\\b`).test(body)) return true;
  return false;
}

function moduleMayRebindName(source: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  const topLevelPatterns = [
    new RegExp(`^${escaped}\\s*(?::[^=\\n]+)?=(?!=)`, "m"),
    new RegExp(`^${escaped}\\s*:=`, "m"),
    new RegExp(`^del\\s+${escaped}\\b`, "m"),
    new RegExp(`^import\\s+[^\\n]+\\bas\\s+${escaped}\\b`, "m"),
    new RegExp(`^from\\s+[^\\n]+\\s+import\\s+[^\\n]*\\b${escaped}\\b`, "m"),
  ];
  return topLevelPatterns.some((pattern) => pattern.test(source));
}

export function frappeLocalEnqueueReference(context: FrappeLocalEnqueueContext): string | undefined {
  const reference = frappeEnqueueBareReference(context.call_text);
  if (!reference) return undefined;

  const imports = pythonImportBindingsForScope(context.source, {
    start_line: context.scope_start_line,
    end_line: context.scope_end_line,
  });
  if (!imports.parsed || !imports.complete || imports.wildcard_in_module || imports.wildcard_in_scope) return undefined;
  if (imports.bindings.some((binding) => binding.local_name === reference)) return undefined;

  if (scopeMayRebindName(context.source, context.scope_start_line, context.scope_end_line, reference)) return undefined;
  if (moduleMayRebindName(context.source, reference)) return undefined;
  return reference;
}
