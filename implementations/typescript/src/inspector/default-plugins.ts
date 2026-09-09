import type { InspectorFrameworkPlugin } from "./plugin.js";
import { frappeInspectorPlugin } from "./plugins/frappe.js";
import { railsInspectorPlugin } from "./plugins/rails.js";

export const defaultInspectorPlugins: readonly InspectorFrameworkPlugin[] = [
  railsInspectorPlugin,
  frappeInspectorPlugin,
];
