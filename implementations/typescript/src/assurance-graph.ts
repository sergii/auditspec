import { buildAssuranceGraphWithPlugins } from "./inspector/assurance-graph/core.js";
import { defaultAssuranceGraphPlugins } from "./inspector/assurance-graph/default-plugins.js";

export * from "./inspector/assurance-graph/core.js";
export type {
  AssuranceGraphIndexedScope,
  AssuranceGraphPlugin,
  AssuranceGraphPluginContext,
} from "./inspector/assurance-graph/plugin.js";

export async function buildAssuranceGraph(inputPath: string) {
  return buildAssuranceGraphWithPlugins(inputPath, defaultAssuranceGraphPlugins);
}

export { buildAssuranceGraphWithPlugins };
