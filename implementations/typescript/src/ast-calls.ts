import python from "@ast-grep/lang-python";
import ruby from "@ast-grep/lang-ruby";
import { parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";

registerDynamicLanguage({ python, ruby });

export type AstLanguage = "python" | "ruby";

export interface AstScope {
  id: string;
  name: string;
  qualified_name: string;
  kind: "function" | "method";
  start_line: number;
  start_column: number;
  end_line: number;
  end_column: number;
}

export interface AstCallCandidate {
  text: string;
  callee: string;
  method: string;
  line: number;
  column: number;
  scope?: AstScope;
}

export interface AstCallScan {
  parsed: boolean;
  calls: AstCallCandidate[];
}

export interface PythonImportBinding {
  owner: "module" | "scope";
  kind: "from" | "module";
  local_name: string;
  module: string;
  imported_name?: string;
  target?: string;
  line: number;
  column: number;
}

export interface PythonImportScan {
  parsed: boolean;
  complete: boolean;
  bindings: PythonImportBinding[];
  wildcard_in_module: boolean;
  wildcard_in_scope: boolean;
}

export interface PythonScopeRange {
  start_line: number;
  end_line: number;
}

const RUBY_DEFINITION_KINDS = new Set(["method", "singleton_method"]);
const RUBY_CONTAINER_KINDS = new Set(["class", "module", "singleton_class"]);
const PYTHON_DEFINITION_KINDS = new Set(["function_definition"]);
const PYTHON_CONTAINER_KINDS = new Set(["class_definition"]);

function lastSegment(value: string): string {
  const match = value.match(/([A-Za-z_][A-Za-z0-9_]*[!?=]?)\s*$/);
  return match?.[1] ?? value;
}

function definitionName(text: string, language: AstLanguage, fieldName?: string): string {
  if (fieldName) return fieldName;
  if (language === "ruby") {
    return text.match(/\bdef\s+(?:self\.|[A-Za-z_][A-Za-z0-9_:]*\.)?([A-Za-z_][A-Za-z0-9_]*[!?=]?)/)?.[1] ?? "<anonymous>";
  }
  return text.match(/\bdef\s+([A-Za-z_][A-Za-z0-9_]*)/)?.[1] ?? "<anonymous>";
}

function definitionForNode(node: SgNode, language: AstLanguage): SgNode | undefined {
  const definitionKinds = language === "ruby" ? RUBY_DEFINITION_KINDS : PYTHON_DEFINITION_KINDS;
  return node.ancestors().find((ancestor) => definitionKinds.has(String(ancestor.kind())));
}

function scopeForCall(node: SgNode, language: AstLanguage): AstScope | undefined {
  const containerKinds = language === "ruby" ? RUBY_CONTAINER_KINDS : PYTHON_CONTAINER_KINDS;
  const definition = definitionForNode(node, language);
  if (!definition) return undefined;

  const range = definition.range();
  const rawName = definition.field("name")?.text();
  const name = definitionName(definition.text(), language, rawName);
  const containers = definition
    .ancestors()
    .filter((ancestor) => containerKinds.has(String(ancestor.kind())))
    .map((ancestor) => ancestor.field("name")?.text() ?? ancestor.field("value")?.text())
    .filter((value): value is string => Boolean(value))
    .reverse();
  const qualifiedName = containers.length === 0
    ? name
    : language === "ruby"
      ? `${containers.join("::")}#${name}`
      : `${containers.join(".")}.${name}`;

  return {
    id: `${String(definition.kind())}:${range.start.line + 1}:${range.start.column + 1}`,
    name,
    qualified_name: qualifiedName,
    kind: language === "python" ? "function" : "method",
    start_line: range.start.line + 1,
    start_column: range.start.column + 1,
    end_line: range.end.line + 1,
    end_column: range.end.column + 1,
  };
}

export function pythonDecoratorsForScope(source: string, scope: AstScope): string[] | null {
  if (scope.kind !== "function") return [];

  try {
    const root = parse("python", source).root();
    const definitions = root.findAll({ rule: { kind: "function_definition" } });
    const definition = definitions.find((candidate) => {
      const range = candidate.range();
      return range.start.line + 1 === scope.start_line
        && range.start.column + 1 === scope.start_column
        && candidate.field("name")?.text() === scope.name;
    });
    if (!definition) return null;

    const decorated = definition
      .ancestors()
      .find((ancestor) => String(ancestor.kind()) === "decorated_definition");
    if (!decorated) return [];

    return decorated
      .findAll({ rule: { kind: "decorator" } })
      .map((decorator) => decorator.text());
  } catch {
    return null;
  }
}

function pythonImportOwner(node: SgNode, scope: PythonScopeRange): "module" | "scope" | null {
  const ancestors = node.ancestors();
  const functionIndex = ancestors.findIndex((ancestor) => String(ancestor.kind()) === "function_definition");

  if (functionIndex >= 0) {
    const definition = ancestors[functionIndex]!;
    const range = definition.range();
    if (range.start.line + 1 !== scope.start_line || range.end.line + 1 !== scope.end_line) return null;

    // Only a statement directly owned by the function body is deterministic here.
    // Imports nested under conditionals, try/except, loops, with blocks, or nested
    // class bodies are intentionally excluded.
    const between = ancestors.slice(0, functionIndex).map((ancestor) => String(ancestor.kind()));
    if (between.some((kind) => kind !== "block")) return null;
    return "scope";
  }

  // A module import must be a direct module statement, not a class or control-flow body.
  const kinds = ancestors.map((ancestor) => String(ancestor.kind()));
  if (kinds.some((kind) => kind !== "module")) return null;
  return "module";
}

function normalizedPythonImportText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join(" ")
    .replace(/\\\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPythonImportNames(value: string): string[] | null {
  let body = value.trim();
  if (body.startsWith("(")) {
    if (!body.endsWith(")")) return null;
    body = body.slice(1, -1).trim();
  } else if (body.includes("(") || body.includes(")")) {
    return null;
  }

  const names = body.split(",").map((item) => item.trim()).filter(Boolean);
  return names.length > 0 ? names : null;
}

function parsePythonImportNode(
  node: SgNode,
  owner: "module" | "scope",
): { bindings: PythonImportBinding[]; wildcard: boolean; complete: boolean } {
  const kind = String(node.kind());
  const text = normalizedPythonImportText(node.text());
  const range = node.range();
  const location = { line: range.start.line + 1, column: range.start.column + 1 };

  if (kind === "import_from_statement") {
    const match = /^from\s+(\.*[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\.+)\s+import\s+(.+)$/.exec(text);
    if (!match) return { bindings: [], wildcard: false, complete: false };
    const module = match[1]!;
    const names = splitPythonImportNames(match[2]!);
    if (!names) return { bindings: [], wildcard: false, complete: false };

    const bindings: PythonImportBinding[] = [];
    let wildcard = false;
    for (const nameText of names) {
      if (nameText === "*") {
        wildcard = true;
        continue;
      }
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(nameText);
      if (!nameMatch) return { bindings: [], wildcard, complete: false };
      const importedName = nameMatch[1]!;
      const localName = nameMatch[2] ?? importedName;
      const absolute = !module.startsWith(".");
      bindings.push({
        owner,
        kind: "from",
        local_name: localName,
        module,
        imported_name: importedName,
        ...(absolute ? { target: `${module}.${importedName}` } : {}),
        ...location,
      });
    }
    return { bindings, wildcard, complete: true };
  }

  if (kind === "import_statement") {
    const match = /^import\s+(.+)$/.exec(text);
    if (!match) return { bindings: [], wildcard: false, complete: false };
    const names = splitPythonImportNames(match[1]!);
    if (!names) return { bindings: [], wildcard: false, complete: false };

    const bindings: PythonImportBinding[] = [];
    for (const nameText of names) {
      const nameMatch = /^([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)(?:\s+as\s+([A-Za-z_][A-Za-z0-9_]*))?$/.exec(nameText);
      if (!nameMatch) return { bindings: [], wildcard: false, complete: false };
      const module = nameMatch[1]!;
      const localName = nameMatch[2] ?? module.split(".")[0]!;
      bindings.push({ owner, kind: "module", local_name: localName, module, ...location });
    }
    return { bindings, wildcard: false, complete: true };
  }

  return { bindings: [], wildcard: false, complete: false };
}

export function pythonImportBindingsForScope(source: string, scope: PythonScopeRange): PythonImportScan {
  try {
    const root = parse("python", source).root();
    const nodes = [
      ...root.findAll({ rule: { kind: "import_from_statement" } }),
      ...root.findAll({ rule: { kind: "import_statement" } }),
    ];
    const bindings: PythonImportBinding[] = [];
    let complete = true;
    let wildcardInModule = false;
    let wildcardInScope = false;

    for (const node of nodes) {
      const owner = pythonImportOwner(node, scope);
      if (!owner) continue;
      const parsed = parsePythonImportNode(node, owner);
      if (!parsed.complete) complete = false;
      bindings.push(...parsed.bindings);
      if (parsed.wildcard && owner === "module") wildcardInModule = true;
      if (parsed.wildcard && owner === "scope") wildcardInScope = true;
    }

    return {
      parsed: true,
      complete,
      bindings,
      wildcard_in_module: wildcardInModule,
      wildcard_in_scope: wildcardInScope,
    };
  } catch {
    return {
      parsed: false,
      complete: false,
      bindings: [],
      wildcard_in_module: false,
      wildcard_in_scope: false,
    };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function rubyScopeBindsName(definition: SgNode, name: string): boolean {
  const escaped = escapeRegExp(name);
  const text = definition.text();
  const firstLine = text.split("\n", 1)[0] ?? "";

  // Parameters and block variables make a bare identifier a local read rather than a method send.
  if (new RegExp(`\\bdef\\b[^\\n]*(?:\\(|[,; ]+)${escaped}(?:[,;) =]|$)`).test(firstLine)) return true;
  if (new RegExp(`\\|[^|]*\\b${escaped}\\b[^|]*\\|`).test(text)) return true;
  if (new RegExp(`=>\\s*${escaped}\\b`).test(text)) return true;

  // Any local assignment in the method causes Ruby to parse subsequent bare references as locals.
  // Exclude comparison/hash-rocket syntax and fail closed on compound assignment as well.
  return new RegExp(`(?:^|[^=!<>])\\b${escaped}\\s*(?:\\|\\|=|&&=|[+\\-*/%]?=)(?!=|>)`, "m").test(text);
}

function rubyBareZeroArgumentCalls(root: SgNode, source: string): AstCallCandidate[] {
  const lines = source.split("\n");
  const results: AstCallCandidate[] = [];

  for (const node of root.findAll({ rule: { kind: "identifier" } })) {
    // Identifiers nested in an explicit call are already represented by the call node.
    if (node.ancestors().some((ancestor) => String(ancestor.kind()) === "call")) continue;

    const scope = scopeForCall(node, "ruby");
    const definition = definitionForNode(node, "ruby");
    if (!scope || !definition) continue;

    const name = node.text();
    if (!/^[A-Za-z_][A-Za-z0-9_]*[!?]?$/.test(name)) continue;
    if (rubyScopeBindsName(definition, name)) continue;

    const range = node.range();
    const lineText = lines[range.start.line] ?? "";
    const before = lineText.slice(0, range.start.column);
    const after = lineText.slice(range.end.column);

    // A conservative bare send must be the first expression on its line and may only
    // be followed by an if/unless modifier or a comment. Receiver/argument/value uses
    // therefore remain excluded instead of being guessed as calls.
    if (before.trim() !== "") continue;
    if (!/^\s*(?:(?:if|unless)\b[^#]*)?(?:#.*)?$/.test(after)) continue;

    results.push({
      text: lineText.trim(),
      callee: name,
      method: name,
      line: range.start.line + 1,
      column: range.start.column + 1,
      scope,
    });
  }

  return results;
}

export function findAstCalls(source: string, language: AstLanguage): AstCallScan {
  try {
    const root = parse(language, source).root();
    const nodes = root.findAll({ rule: { kind: "call" } });
    const calls = nodes.map((node) => {
      const functionNode = node.field("function");
      const methodNode = node.field("method");
      const receiverNode = node.field("receiver");
      const functionText = functionNode?.text();
      const methodText = methodNode?.text();
      const receiverText = receiverNode?.text();
      const callee = functionText ?? (methodText ? `${receiverText ? `${receiverText}.` : ""}${methodText}` : node.text());
      const method = methodText ?? lastSegment(functionText ?? callee);
      const range = node.range();
      const scope = scopeForCall(node, language);
      return {
        text: node.text(),
        callee,
        method,
        line: range.start.line + 1,
        column: range.start.column + 1,
        ...(scope ? { scope } : {}),
      };
    });

    if (language === "ruby") calls.push(...rubyBareZeroArgumentCalls(root, source));

    return { parsed: true, calls };
  } catch {
    return { parsed: false, calls: [] };
  }
}
