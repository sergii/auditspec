import type { AstCallCandidate, AstLanguage } from "../../ast-calls.js";
import type {
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "../../assurance-graph.js";

export interface AssuranceGraphIndexedScope {
  node: AssuranceGraphNode;
  calls: AstCallCandidate[];
  source: string;
}

export interface AssuranceGraphPluginContext {
  root: string;
  indexed: AssuranceGraphIndexedScope[];
  source_by_path: ReadonlyMap<string, string>;
  nodes: AssuranceGraphNode[];
  edges: AssuranceGraphEdge[];
  add_role(node: AssuranceGraphNode, role: AssuranceRole): void;
  add_surface(input: {
    language: AstLanguage;
    framework: string;
    kind: string;
    detail: string;
    path: string;
    line?: number;
    column?: number;
    target: AssuranceGraphNode;
    from?: AssuranceGraphNode;
  }): AssuranceGraphNode;
  push_edge(edge: AssuranceGraphEdge): void;
}

export interface AssuranceGraphPlugin {
  id: string;
  roles_for_scope?(scope: AssuranceGraphIndexedScope): AssuranceRole[];
  is_semantic_call?(call: AstCallCandidate, scope: AssuranceGraphIndexedScope): boolean;
  project?(context: AssuranceGraphPluginContext): void;
}
