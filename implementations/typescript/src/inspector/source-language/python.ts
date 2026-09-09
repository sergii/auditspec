import { findAstCalls } from "../../ast-calls.js";
import type { AssuranceSourceLanguagePlugin } from "./plugin.js";

function containerName(qualifiedName: string): string | undefined {
  const parts = qualifiedName.split(".").filter(Boolean);
  return parts.length > 1 ? parts.at(-2) : undefined;
}

export const pythonAssuranceSourcePlugin: AssuranceSourceLanguagePlugin = {
  id: "python-source-v0.1",
  language: "python",
  matches(path) {
    return path.endsWith(".py");
  },
  scan(source) {
    const scan = findAstCalls(source, "python");
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
