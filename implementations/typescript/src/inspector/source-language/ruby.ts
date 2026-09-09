import { findAstCalls } from "../../ast-calls.js";
import type { AssuranceSourceLanguagePlugin } from "./plugin.js";

function containerName(qualifiedName: string): string | undefined {
  const [beforeMethod, method] = qualifiedName.split("#");
  if (!method || !beforeMethod) return undefined;
  return beforeMethod.split("::").filter(Boolean).at(-1);
}

export const rubyAssuranceSourcePlugin: AssuranceSourceLanguagePlugin = {
  id: "ruby-source-v0.1",
  language: "ruby",
  matches(path) {
    return path.endsWith(".rb") || path.endsWith(".rake");
  },
  scan(source) {
    const scan = findAstCalls(source, "ruby");
    return {
      ...scan,
      calls: scan.calls.map((call) => ({
        ...call,
        ...(call.scope
          ? {
              scope: {
                ...call.scope,
                container_name: containerName(call.scope.qualified_name),
              },
            }
          : {}),
      })),
    };
  },
};
