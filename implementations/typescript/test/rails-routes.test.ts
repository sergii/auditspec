import assert from "node:assert/strict";
import test from "node:test";
import { resourceRouteDeclarations } from "../src/rails-routes.js";

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

test("fails closed inside unsupported routing scopes and conditionals", () => {
  const result = routes([
    "Rails.application.routes.draw do",
    "  scope module: :internal do",
    "    resources :secrets",
    "  end",
    "  if Feature.enabled?(:beta)",
    "    resources :beta_users",
    "  end",
    "  resources :public_users, only: :show",
    "end",
  ]);

  assert.equal(result.some((route) => route.controller === "secrets"), false);
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
