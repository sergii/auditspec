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

function scopeForCall(node: SgNode, language: AstLanguage): AstScope | undefined {
  const definitionKinds = language === "ruby" ? RUBY_DEFINITION_KINDS : PYTHON_DEFINITION_KINDS;
  const containerKinds = language === "ruby" ? RUBY_CONTAINER_KINDS : PYTHON_CONTAINER_KINDS;
  const definition = node.ancestors().find((ancestor) => definitionKinds.has(String(ancestor.kind())));
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

    return { parsed: true, calls };
  } catch {
    return { parsed: false, calls: [] };
  }
}
