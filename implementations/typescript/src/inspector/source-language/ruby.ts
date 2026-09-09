import { findAstCalls } from "../../ast-calls.js";
import type { AssuranceSourceLanguagePlugin } from "./plugin.js";

export const rubyAssuranceSourcePlugin: AssuranceSourceLanguagePlugin = {
  id: "ruby-source-v0.1",
  language: "ruby",
  matches(path) {
    return path.endsWith(".rb") || path.endsWith(".rake");
  },
  scan(source) {
    return findAstCalls(source, "ruby");
  },
};
