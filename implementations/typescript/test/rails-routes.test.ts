import assert from "node:assert/strict";
import test from "node:test";
import { railsRouteDeclarations, resourceRouteDeclarations } from "../src/rails-routes.js";

function routes(sourceLines: string[]) {
  return resourceRouteDeclarations(sourceLines.join("\n"));
}

test("expands a literal Rails namespace into path and controller prefixes", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  namespace :admin do",
    "    resources :users, only: [:show, :update]",
    "  end",
    "end",
  ]);

  assert.deepEqual(
    result.map(({ verb, path, controller, action }) => ({ verb, path, controller, action })),
    [
      { verb: "GET", path: "/admin/users/:id", controller: "admin/users", action: "show" },
      { verb: "PATCH", path: "/admin/users/:id", controller: "admin/users", action: "update" },
      { verb: "PUT", path: "/admin/users/:id", controller: "admin/users", action: "update" },
    ],
  );
});

test("expands nested resources through the parent member path", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  resources :accounts, only: [:show] do",
    "    resources :invoices, only: [:show, :destroy]",
    "  end",
    "end",
  ]);

  assert.deepEqual(
    result.map(({ verb, path, controller, action }) => ({ verb, path, controller, action })),
    [
      { verb: "GET", path: "/accounts/:id", controller: "accounts", action: "show" },
      { verb: "GET", path: "/accounts/:account_id/invoices/:id", controller: "invoices", action: "show" },
      { verb: "DELETE", path: "/accounts/:account_id/invoices/:id", controller: "invoices", action: "destroy" },
    ],
  );
});

test("preserves a literal parent param in nested route parameter names", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  resources :accounts, param: :uuid, only: [:show] do",
    "    resources :invoices, only: :show",
    "  end",
    "end",
  ]);

  assert.ok(result.some((route) => route.path === "/accounts/:account_uuid/invoices/:id" && route.action === "show"));
});

test("expands literal scope path and module prefixes", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  scope path: 'api', module: :api do",
    "    resources :invoices, only: :show",
    "  end",
    "  scope '/internal', module: 'admin', as: :internal do",
    "    resource :profile, only: :show",
    "  end",
    "end",
  ]);

  assert.deepEqual(
    result.map(({ verb, path, controller, action }) => ({ verb, path, controller, action })),
    [
      { verb: "GET", path: "/api/invoices/:id", controller: "api/invoices", action: "show" },
      { verb: "GET", path: "/internal/profile", controller: "admin/profiles", action: "show" },
    ],
  );
});

test("supports module-only scope without inventing a path prefix", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  scope module: :admin do",
    "    resources :users, only: :show",
    "  end",
    "end",
  ]);

  assert.deepEqual(
    result.map(({ verb, path, controller, action }) => ({ verb, path, controller, action })),
    [{ verb: "GET", path: "/users/:id", controller: "admin/users", action: "show" }],
  );
});

test("preserves literal route constraints as conditional route metadata", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  constraints subdomain: 'api', format: :json do",
    "    resources :invoices, only: :show",
    "  end",
    "end",
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.constraints, ['subdomain: "api", format: :json']);
});

test("resolves explicit routes through scope and constraint context", () => {
  const result = railsRouteDeclarations([
    "Rails.application.routes.draw do",
    "  constraints subdomain: 'api' do",
    "    scope '/v1', module: :api do",
    "      get 'health', to: 'health#show'",
    "    end",
    "  end",
    "end",
  ].join("\n"));

  assert.deepEqual(
    result.map(({ verb, path, controller, action, constraints }) => ({ verb, path, controller, action, constraints })),
    [{
      verb: "GET",
      path: "/v1/health",
      controller: "api/health",
      action: "show",
      constraints: ['subdomain: "api"'],
    }],
  );
});

test("fails closed inside dynamic scopes, dynamic constraints, and conditionals", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  scope path: ROUTE_PREFIX do",
    "    resources :secrets",
    "  end",
    "  constraints ->(request) { request.host.ends_with?('.internal') } do",
    "    resources :internal_users",
    "  end",
    "  if Feature.enabled?(:beta)",
    "    resources :beta_users",
    "  end",
    "  resources :public_users, only: :show",
    "end",
  ]);

  assert.equal(result.some((route) => route.controller === "secrets"), false);
  assert.equal(result.some((route) => route.controller === "internal_users"), false);
  assert.equal(result.some((route) => route.controller === "beta_users"), false);
  assert.equal(result.some((route) => route.controller === "public_users" && route.action === "show"), true);
});

test("fails closed on unsupported and dynamic resource options", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  resources :users, constraints: AdminConstraint.new",
    "  resources :projects, ROUTE_OPTIONS",
    "  resources :accounts, only: :show",
    "end",
  ]);

  assert.equal(result.some((route) => route.controller === "users"), false);
  assert.equal(result.some((route) => route.controller === "projects"), false);
  assert.equal(result.some((route) => route.controller === "accounts" && route.action === "show"), true);
});
