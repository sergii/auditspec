import python from "@ast-grep/lang-python";
import ruby from "@ast-grep/lang-ruby";
import { parse, registerDynamicLanguage } from "@ast-grep/napi";

registerDynamicLanguage({ python, ruby });

export type AstLanguage = "python" | "ruby";

export interface AstCallCandidate {
  text: string;
  callee: string;
  method: string;
  line: number;
  column: number;
}

export interface AstCallScan {
  parsed: boolean;
  calls: AstCallCandidate[];
}

function lastSegment(value: string): string {
  const match = value.match(/([A-Za-z_][A-Za-z0-9_]*[!?=]?)\s*$/);
  return match?.[1] ?? value;
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
      return {
        text: node.text(),
        callee,
        method,
        line: range.start.line + 1,
        column: range.start.column + 1,
      };
    });

    return { parsed: true, calls };
  } catch {
    return { parsed: false, calls: [] };
  }
}
