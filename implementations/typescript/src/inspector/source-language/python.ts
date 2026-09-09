import { findAstCalls } from "../../ast-calls.js";
import type { AssuranceSourceLanguagePlugin } from "./plugin.js";

export const pythonAssuranceSourcePlugin: AssuranceSourceLanguagePlugin = {
  id: "python-source-v0.1",
  language: "python",
  matches(path) {
    return path.endsWith(".py");
  },
  scan(source) {
    return findAstCalls(source, "python");
  },
};
