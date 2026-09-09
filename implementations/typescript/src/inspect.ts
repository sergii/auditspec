import { inspectRepositoryWithPlugins } from "./inspector/core.js";
import { defaultInspectorPlugins } from "./inspector/default-plugins.js";

export { inspectRepositoryWithPlugins } from "./inspector/core.js";
export type {
  InspectorAssurancePolicy,
  InspectorFrameworkPlugin,
  InspectorPluginInspection,
} from "./inspector/plugin.js";

export async function inspectRepository(inputPath: string) {
  return inspectRepositoryWithPlugins(inputPath, defaultInspectorPlugins);
}
