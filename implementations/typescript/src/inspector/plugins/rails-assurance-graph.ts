import type { AstCallCandidate } from "../../ast-calls.js";
import { actionCableDispatches, composedActionCableActionDispatches } from "../../rails-action-cable.js";
import { hasAuthorizationBeforeAction } from "../../rails-callbacks.js";
import { railsRouteDeclarations } from "../../rails-routes.js";
import type { AssuranceGraphNode, AssuranceRole } from "../assurance-graph/core.js";
import type {
  AssuranceGraphIndexedScope,
  AssuranceGraphPlugin,
  AssuranceGraphPluginContext,
} from "../assurance-graph/plugin.js";

const RUBY_MUTATIONS = new Set([
  "save!",
  "update!",
  "update",
  "destroy!",
  "destroy",
  "create!",
  "create",
  "delete",
  "delete_all",
  "destroy_all",
  "update_all",
  "insert_all",
  "upsert_all",
]);

const RUBY_AUTHORIZATION = new Set([
  "authorize",
  "policy_scope",
  "allowed_to?",
  "can?",
  "reject_unauthorized_connection",
]);

const RAILS_JOB_DISPATCH = new Set([
  "perform_later",
  "perform_now",
  "perform_async",
  "perform_in",
  "perform_at",
]);

function isRailsJobScope(item: AssuranceGraphIndexedScope, context: AssuranceGraphPluginContext): boolean {
  if (item.node.language !== "ruby" || item.node.name !== "perform") return false;
  const container = context.containerHint(item.node);
  if (!container) return false;
  const escaped = container.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`class\\s+${escaped}\\s*<\\s*(?:ApplicationJob|ActiveJob::Base)\\b`).test(item.source)
    || /include\s+Sidekiq::(?:Job|Worker)\b/.test(item.source);
}

function camelizeController(value: string): string {
  return value
    .split("/")
    .map((segment) => segment.split("_").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(""))
    .join("::") + "Controller";
}

function rolesForRailsScope(
  item: AssuranceGraphIndexedScope,
  context: AssuranceGraphPluginContext,
): AssuranceRole[] {
  if (item.node.language !== "ruby") return [];

  const roles = new Set<AssuranceRole>();
  for (const call of item.calls) {
    if (RUBY_MUTATIONS.has(call.method)) roles.add("mutation");
    if (call.method === "transaction") roles.add("transaction");
    if (RUBY_AUTHORIZATION.has(call.method) || /\bPundit\b/.test(call.callee)) roles.add("authorization");
  }
  if (isRailsJobScope(item, context)) roles.add("entrypoint");
  return [...roles].sort();
}

function consumesRailsCall(call: AstCallCandidate, item: AssuranceGraphIndexedScope): boolean {
  if (item.node.language !== "ruby") return false;
  return RUBY_MUTATIONS.has(call.method)
    || call.method === "transaction"
    || RUBY_AUTHORIZATION.has(call.method);
}

function actionCableSources(context: AssuranceGraphPluginContext) {
  return [...context.sourceByPath.entries()]
    .filter(([path]) => path.startsWith("app/channels/") && path.endsWith(".rb"))
    .map(([path, source]) => ({
      path,
      source,
      methods: context.indexed
        .filter(
          (item) => item.node.language === "ruby"
            && item.node.location.path === path
            && typeof item.node.location.line === "number",
        )
        .map((item) => ({
          name: item.node.name,
          qualified_name: item.node.qualified_name,
          line: item.node.location.line!,
        })),
    }));
}

function applyRailsRoutes(context: AssuranceGraphPluginContext): void {
  const routesSource = context.sourceByPath.get("config/routes.rb");
  if (!routesSource) return;

  for (const route of railsRouteDeclarations(routesSource)) {
    const targetName = `${camelizeController(route.controller)}#${route.action}`;
    const target = context.indexed.find((item) => item.node.qualified_name === targetName);
    if (!target) continue;

    const location = { path: "config/routes.rb", line: route.line, column: 1 };
    const constraintSuffix = route.constraints?.length
      ? ` [constraints: ${route.constraints.join(" && ")}]`
      : "";
    const detail = `${route.verb} ${route.path} -> ${route.controller}#${route.action}${constraintSuffix}`;
    const surface = context.addSurface("ruby", "rails", "rails_route", detail, location);
    context.pushEdge({
      from: surface.id,
      to: target.node.id,
      kind: "framework_dispatch",
      confidence: "high",
      framework: { kind: "rails_route", detail: surface.surface!.detail, location },
    });
  }
}

function applyActionCable(context: AssuranceGraphPluginContext): void {
  const sources = actionCableSources(context);

  for (const { path, source, methods } of sources) {
    for (const dispatch of actionCableDispatches(source, path, methods)) {
      const target = context.indexed.find(
        (item) => item.node.location.path === path
          && item.node.qualified_name === dispatch.target_qualified_name,
      );
      if (!target) continue;
      const location = { path, line: dispatch.line, column: 1 };
      const surface = context.addSurface("ruby", "rails", dispatch.surface_kind, dispatch.detail, location);
      context.pushEdge({
        from: surface.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: { kind: dispatch.surface_kind, detail: dispatch.detail, location },
      });
    }
  }

  for (const dispatch of composedActionCableActionDispatches(sources)) {
    if (!dispatch.source_path || !dispatch.target_path) continue;
    const target = context.indexed.find(
      (item) => item.node.location.path === dispatch.target_path
        && item.node.qualified_name === dispatch.target_qualified_name,
    );
    if (!target) continue;
    const location = { path: dispatch.source_path, line: dispatch.line, column: 1 };
    const surface = context.addSurface("ruby", "rails", dispatch.surface_kind, dispatch.detail, location);
    context.pushEdge({
      from: surface.id,
      to: target.node.id,
      kind: "framework_dispatch",
      confidence: "high",
      framework: { kind: dispatch.surface_kind, detail: dispatch.detail, location },
    });
  }
}

function applyRailsJobDispatch(context: AssuranceGraphPluginContext): void {
  for (const sourceScope of context.indexed.filter((item) => item.node.language === "ruby")) {
    for (const call of sourceScope.calls) {
      if (!RAILS_JOB_DISPATCH.has(call.method)) continue;
      const receiver = context.receiverHint(call.callee, call.method);
      if (!receiver) continue;
      const candidates = context.indexed.filter(
        (item) => item.node.language === "ruby"
          && item.node.name === "perform"
          && context.containerHint(item.node) === receiver,
      );
      if (candidates.length !== 1) continue;
      const target = candidates[0]!;
      context.addRole(target.node, "entrypoint");
      const location = {
        path: sourceScope.node.location.path,
        line: call.line,
        column: call.column,
      };
      context.pushEdge({
        from: sourceScope.node.id,
        to: target.node.id,
        kind: "framework_dispatch",
        confidence: "high",
        framework: {
          kind: "rails_job_dispatch",
          detail: `${call.callee} -> ${target.node.qualified_name}`,
          location,
        },
      });
    }
  }
}

function finalizeRailsControllers(context: AssuranceGraphPluginContext): void {
  const routedControllers = new Set(
    context.edges
      .filter((edge) => edge.kind === "framework_dispatch" && edge.framework?.kind === "rails_route")
      .map((edge) => edge.to),
  );

  const controllerSources = [...context.sourceByPath.entries()]
    .filter(([path]) => path.startsWith("app/controllers/") && path.endsWith(".rb"))
    .map(([path, source]) => ({ path, source }));

  const authorizationMethods = new Set(
    context.indexed
      .filter((item) => item.node.language === "ruby" && item.node.roles.includes("authorization"))
      .map((item) => item.node.qualified_name),
  );

  for (const targetId of routedControllers) {
    const target = context.indexed.find((item) => item.node.id === targetId);
    if (!target || target.node.language !== "ruby") continue;
    const controller = target.node.qualified_name.split("#")[0];
    if (!controller) continue;

    const hasAuthorizationCallback = hasAuthorizationBeforeAction({
      target_source: target.source,
      controller,
      action: target.node.name,
      controller_sources: controllerSources,
      authorization_methods: authorizationMethods,
    });
    if (hasAuthorizationCallback) context.addRole(target.node, "authorization");
  }

  for (const item of context.indexed) {
    if (
      item.node.language === "ruby"
      && item.node.location.path.startsWith("app/controllers/")
      && !routedControllers.has(item.node.id)
    ) {
      context.addRole(item.node, "entrypoint");
    }
  }
}

export const railsAssuranceGraphPlugin: AssuranceGraphPlugin = {
  id: "rails-assurance-graph-v0.1",
  framework: "rails",
  classifyScope: rolesForRailsScope,
  consumesCall: consumesRailsCall,
  apply(context) {
    applyRailsRoutes(context);
    applyActionCable(context);
    applyRailsJobDispatch(context);
  },
  finalize: finalizeRailsControllers,
};
