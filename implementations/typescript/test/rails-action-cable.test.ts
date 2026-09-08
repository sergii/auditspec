import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";
import { actionCableDispatches } from "../src/rails-action-cable.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-action-cable-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const absolute = join(root, path);
      await mkdir(join(absolute, ".."), { recursive: true });
      await writeFile(absolute, content);
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("resolves direct public ActionCable actions and lifecycle callbacks", () => {
  const source = [
    "class ChatChannel < ApplicationCable::Channel",
    "  def subscribed",
    "    authorize current_user",
    "  end",
    "",
    "  def speak(data)",
    "    Message.create!(body: data['body'])",
    "  end",
    "",
    "  def unsubscribed",
    "    Presence.update!(online: false)",
    "  end",
    "",
    "  private",
    "",
    "  def helper",
    "    Message.create!(body: 'hidden')",
    "  end",
    "end",
  ].join("\n");

  const dispatches = actionCableDispatches(source, "app/channels/chat_channel.rb", [
    { name: "subscribed", qualified_name: "ChatChannel#subscribed", line: 2 },
    { name: "speak", qualified_name: "ChatChannel#speak", line: 6 },
    { name: "unsubscribed", qualified_name: "ChatChannel#unsubscribed", line: 10 },
    { name: "helper", qualified_name: "ChatChannel#helper", line: 16 },
  ]);

  assert.deepEqual(dispatches.map((dispatch) => dispatch.surface_kind), [
    "rails_action_cable_subscribe",
    "rails_action_cable_action",
    "rails_action_cable_unsubscribe",
  ]);
  assert.equal(dispatches.some((dispatch) => dispatch.target_qualified_name === "ChatChannel#helper"), false);
});

test("resolves the conventional ApplicationCable connection lifecycle", () => {
  const source = [
    "module ApplicationCable",
    "  class Connection < ActionCable::Connection::Base",
    "    def connect",
    "      authorize current_user",
    "    end",
    "",
    "    def disconnect",
    "      Presence.update!(online: false)",
    "    end",
    "  end",
    "end",
  ].join("\n");

  const dispatches = actionCableDispatches(source, "app/channels/application_cable/connection.rb", [
    { name: "connect", qualified_name: "ApplicationCable::Connection#connect", line: 3 },
    { name: "disconnect", qualified_name: "ApplicationCable::Connection#disconnect", line: 7 },
  ]);

  assert.deepEqual(
    dispatches.map(({ surface_kind, detail }) => ({ surface_kind, detail })),
    [
      {
        surface_kind: "rails_action_cable_connect",
        detail: "CONNECT -> ApplicationCable::Connection#connect",
      },
      {
        surface_kind: "rails_action_cable_disconnect",
        detail: "DISCONNECT -> ApplicationCable::Connection#disconnect",
      },
    ],
  );
});

test("fails closed for custom or indirect ActionCable connection inheritance", () => {
  const custom = [
    "class RealtimeConnection < ActionCable::Connection::Base",
    "  def connect",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  assert.deepEqual(actionCableDispatches(custom, "app/channels/realtime_connection.rb", [
    { name: "connect", qualified_name: "RealtimeConnection#connect", line: 2 },
  ]), []);

  const inherited = [
    "class ApplicationCable::Connection < SecuredConnection",
    "  def connect",
    "    authorize current_user",
    "  end",
    "end",
  ].join("\n");
  assert.deepEqual(actionCableDispatches(inherited, "app/channels/application_cable/connection.rb", [
    { name: "connect", qualified_name: "ApplicationCable::Connection#connect", line: 2 },
  ]), []);
});

test("fails closed for inherited, lexical-module, and non-public ActionCable actions", () => {
  const inherited = [
    "class ChatChannel < SecuredChannel",
    "  def speak(data)",
    "    Message.create!(body: data['body'])",
    "  end",
    "end",
  ].join("\n");
  assert.deepEqual(actionCableDispatches(inherited, "app/channels/chat_channel.rb", [
    { name: "speak", qualified_name: "ChatChannel#speak", line: 2 },
  ]), []);

  const lexical = [
    "module Admin",
    "  class ChatChannel < ApplicationCable::Channel",
    "    def speak(data)",
    "      Message.create!(body: data['body'])",
    "    end",
    "  end",
    "end",
  ].join("\n");
  assert.deepEqual(actionCableDispatches(lexical, "app/channels/admin/chat_channel.rb", [
    { name: "speak", qualified_name: "Admin::ChatChannel#speak", line: 3 },
  ]), []);

  const protectedSource = [
    "class ChatChannel < ApplicationCable::Channel",
    "  protected",
    "  def speak(data)",
    "    Message.create!(body: data['body'])",
    "  end",
    "end",
  ].join("\n");
  assert.deepEqual(actionCableDispatches(protectedSource, "app/channels/chat_channel.rb", [
    { name: "speak", qualified_name: "ChatChannel#speak", line: 3 },
  ]), []);
});

test("builds ActionCable framework surfaces into the Assurance Graph", async () => {
  await withRepo(
    {
      "app/channels/chat_channel.rb": [
        "class ChatChannel < ApplicationCable::Channel",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "",
        "  def unsubscribed",
        "    Presence.update!(online: false)",
        "  end",
        "",
        "  private",
        "",
        "  def hidden_mutation",
        "    Message.create!(body: 'hidden')",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const speak = graph.nodes.find((node) => node.qualified_name === "ChatChannel#speak");
      const subscribed = graph.nodes.find((node) => node.qualified_name === "ChatChannel#subscribed");
      const unsubscribed = graph.nodes.find((node) => node.qualified_name === "ChatChannel#unsubscribed");
      const hidden = graph.nodes.find((node) => node.qualified_name === "ChatChannel#hidden_mutation");
      assert.ok(speak);
      assert.ok(subscribed);
      assert.ok(unsubscribed);
      assert.ok(hidden);

      const actionSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_action" && node.surface.detail === "ACTION -> ChatChannel#speak",
      );
      const subscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_subscribe" && node.surface.detail === "SUBSCRIBE -> ChatChannel#subscribed",
      );
      const unsubscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_unsubscribe" && node.surface.detail === "UNSUBSCRIBE -> ChatChannel#unsubscribed",
      );
      assert.ok(actionSurface);
      assert.ok(subscribeSurface);
      assert.ok(unsubscribeSurface);
      assert.equal(graph.nodes.some((node) => node.surface?.detail === "ACTION -> ChatChannel#hidden_mutation"), false);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === actionSurface.id && edge.to === speak.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === subscribeSurface.id && edge.to === subscribed.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === unsubscribeSurface.id && edge.to === unsubscribed.id));

      const subscriptionPath = findAssurancePath(graph, subscribed.location);
      const actionPath = findAssurancePath(graph, speak.location);
      assert.ok(subscriptionPath);
      assert.ok(actionPath);
      assert.equal(subscriptionPath.roles.includes("authorization"), true);
      assert.equal(actionPath.roles.includes("authorization"), false);
    },
  );
});

test("builds connection lifecycle surfaces without projecting connection authorization onto channel actions", async () => {
  await withRepo(
    {
      "app/channels/application_cable/connection.rb": [
        "module ApplicationCable",
        "  class Connection < ActionCable::Connection::Base",
        "    def connect",
        "      authorize current_user",
        "    end",
        "",
        "    def disconnect",
        "      Presence.update!(online: false)",
        "    end",
        "  end",
        "end",
      ].join("\n"),
      "app/channels/chat_channel.rb": [
        "class ChatChannel < ApplicationCable::Channel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const connect = graph.nodes.find((node) => node.qualified_name === "ApplicationCable::Connection#connect");
      const disconnect = graph.nodes.find((node) => node.qualified_name === "ApplicationCable::Connection#disconnect");
      const speak = graph.nodes.find((node) => node.qualified_name === "ChatChannel#speak");
      assert.ok(connect);
      assert.ok(disconnect);
      assert.ok(speak);

      const connectSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_connect"
          && node.surface.detail === "CONNECT -> ApplicationCable::Connection#connect",
      );
      const disconnectSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_disconnect"
          && node.surface.detail === "DISCONNECT -> ApplicationCable::Connection#disconnect",
      );
      assert.ok(connectSurface);
      assert.ok(disconnectSurface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === connectSurface.id && edge.to === connect.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === disconnectSurface.id && edge.to === disconnect.id));

      const connectionPath = findAssurancePath(graph, connect.location);
      const actionPath = findAssurancePath(graph, speak.location);
      assert.ok(connectionPath);
      assert.ok(actionPath);
      assert.equal(connectionPath.roles.includes("authorization"), true);
      assert.equal(actionPath.roles.includes("authorization"), false);
    },
  );
});

test("supports explicit fully-qualified namespaced ActionCable channel classes", async () => {
  await withRepo(
    {
      "app/channels/admin/chat_channel.rb": [
        "class Admin::ChatChannel < ApplicationCable::Channel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const target = graph.nodes.find((node) => node.qualified_name === "Admin::ChatChannel#speak");
      assert.ok(target);
      const surface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_action" && node.surface.detail === "ACTION -> Admin::ChatChannel#speak",
      );
      assert.ok(surface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === target.id));
    },
  );
});
