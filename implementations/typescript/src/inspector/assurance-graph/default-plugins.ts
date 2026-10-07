import type { AssuranceGraphPlugin } from "./plugin.js";
import { frappeAssuranceGraphPlugin } from "../plugins/frappe-assurance-graph.js";
import { railsAssuranceGraphPlugin } from "../plugins/rails-assurance-graph.js";

export const defaultAssuranceGraphPlugins: readonly AssuranceGraphPlugin[] = [
  railsAssuranceGraphPlugin,
  frappeAssuranceGraphPlugin,
];
