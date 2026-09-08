import assert from "node:assert/strict";
import test from "node:test";
import { beforeActionCallbacks } from "../src/rails-callbacks.js";

function callbacks(lines: string[], action = "update") {
  return beforeActionCallbacks(lines.join("\n"), "InvoicesController", action);
}

test("resolves literal before_action methods for an action", () => {
  const result = callbacks([
    "class InvoicesController < ApplicationController",
    "  before_action :load_invoice, :authorize_invoice",
    "  def update",
    "    invoice.update!(status: 'approved')",
    "  end",
    "  def load_invoice",
    "    Invoice.find(params[:id])",
    "  end",
    "  def authorize_invoice",
    "    authorize invoice",
    "  end",
    "end",
  ]);

  assert.deepEqual(result.map((item) => item.method), ["load_invoice", "authorize_invoice"]);
});

test("honors literal only and except filters", () => {
  const source = [
    "class InvoicesController < ApplicationController",
    "  before_action :authorize_invoice, only: [:update, :destroy]",
    "  before_action :load_preview, except: :destroy",
    "end",
  ].join("\n");

  assert.deepEqual(beforeActionCallbacks(source, "InvoicesController", "update").map((item) => item.method), ["authorize_invoice", "load_preview"]);
  assert.deepEqual(beforeActionCallbacks(source, "InvoicesController", "destroy").map((item) => item.method), ["authorize_invoice"]);
  assert.deepEqual(beforeActionCallbacks(source, "InvoicesController", "index").map((item) => item.method), ["load_preview"]);
});

test("fails closed for conditional and dynamic callbacks", () => {
  const result = callbacks([
    "class InvoicesController < ApplicationController",
    "  before_action :authorize_invoice, if: :authorization_required?",
    "  before_action callback_method",
    "  before_action :safe_loader",
    "end",
  ]);

  assert.deepEqual(result.map((item) => item.method), ["safe_loader"]);
});

test("fails closed when skip_before_action is present", () => {
  const result = callbacks([
    "class InvoicesController < ApplicationController",
    "  before_action :authorize_invoice",
    "  skip_before_action :authorize_invoice, only: :index",
    "end",
  ]);

  assert.deepEqual(result, []);
});

test("requires a single matching controller class in the source", () => {
  const source = [
    "class AccountsController < ApplicationController",
    "  before_action :authorize_account",
    "end",
  ].join("\n");

  assert.deepEqual(beforeActionCallbacks(source, "InvoicesController", "update"), []);
});
