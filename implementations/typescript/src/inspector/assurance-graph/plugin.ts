import type { SourceLocation } from "../../assessment-types.js";
import type {
  AssuranceSourceCall,
  AssuranceSourceScope,
} from "../source-language/plugin.js";
import type {
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "./core.js";

export interface AssuranceGraphIndexedScope {
  node: AssuranceGraphNode;
  calls: AssuranceSourceCall[];
  source: string;
  scope: AssuranceSourceScope;
}

export interface AssuranceGraphPluginContext {
  readonly root: string;
  readonly indexed: AssuranceGraphIndexedScope[];
  readonly sourceByPath: ReadonlyMap<string, string>;
  readonly nodes: AssuranceGraphNode[];
  readonly edges: AssuranceGraphEdge[];

  addRole(node: AssuranceGraphNode, role: AssuranceRole): void;
  addSurface(
    language: string,
    framework: string,
    surfaceKind: string,
    detail: string,
    location: SourceLocation,
  ): AssuranceGraphNode;
  pushEdge(edge: AssuranceGraphEdge): void;
  receiverHint(callee: string, method: string): string | undefined;
  containerHint(node: AssuranceGraphNode): string | undefined;
  resolvePythonDottedTarget(target: string): AssuranceGraphIndexedScope | undefined;
}

export interface AssuranceGraphPlugin {
  id: string;
  framework: string;

  classifyScope?(
    item: AssuranceGraphIndexedScope,
    context: AssuranceGraphPluginContext,
  ): Iterable<AssuranceRole>;

  consumesCall?(
    call: AssuranceSourceCall,
    item: AssuranceGraphIndexedScope,
    context: AssuranceGraphPluginContext,
  ): boolean;

  apply?(context: AssuranceGraphPluginContext): void | Promise<void>;
  finalize?(context: AssuranceGraphPluginContext): void | Promise<void>;
}
