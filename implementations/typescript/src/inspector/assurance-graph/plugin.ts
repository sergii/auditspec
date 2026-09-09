import type { AstCallCandidate, AstLanguage, AstScope } from "../../ast-calls.js";
import type { SourceLocation } from "../../assessment-types.js";
import type {
  AssuranceGraphEdge,
  AssuranceGraphNode,
  AssuranceRole,
} from "./core.js";

export interface AssuranceGraphIndexedScope {
  node: AssuranceGraphNode;
  calls: AstCallCandidate[];
  source: string;
  scope: AstScope;
}

export interface AssuranceGraphPluginContext {
  readonly root: string;
  readonly indexed: AssuranceGraphIndexedScope[];
  readonly sourceByPath: ReadonlyMap<string, string>;
  readonly nodes: AssuranceGraphNode[];
  readonly edges: AssuranceGraphEdge[];

  addRole(node: AssuranceGraphNode, role: AssuranceRole): void;
  addSurface(
    language: AstLanguage,
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
    call: AstCallCandidate,
    item: AssuranceGraphIndexedScope,
    context: AssuranceGraphPluginContext,
  ): boolean;

  apply?(context: AssuranceGraphPluginContext): void | Promise<void>;
  finalize?(context: AssuranceGraphPluginContext): void | Promise<void>;
}
