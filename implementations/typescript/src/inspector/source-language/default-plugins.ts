import type { AssuranceSourceLanguagePlugin } from "./plugin.js";
import { pythonAssuranceSourcePlugin } from "./python.js";
import { rubyAssuranceSourcePlugin } from "./ruby.js";

export const defaultAssuranceSourcePlugins: readonly AssuranceSourceLanguagePlugin[] = [
  rubyAssuranceSourcePlugin,
  pythonAssuranceSourcePlugin,
];
