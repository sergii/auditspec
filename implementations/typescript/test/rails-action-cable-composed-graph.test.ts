import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-action-cable-composed-graph-"));
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

test("connects an inherited ActionCable RPC surface to the actual superclass implementation", async () => {
  await withRepo(
    {
      "app/channels/secured_channel.rb": [
        "class SecuredChannel < ApplicationCable::Channel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ].join("\n"),
      "app/channels/chat_channel.rb": [
        "class ChatChannel < SecuredChannel",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const implementation = graph.nodes.find((node) => node.qualified_name === "SecuredChannel#speak");
      const surface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_action"
          && node.surface.detail === "ACTION -> ChatChannel#speak [inherited: SecuredChannel#speak]",
      );
      assert.ok(implementation);
      assert.ok(surface);
      assert.ok(graph.edges.some(
        (edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === implementation.id,
      ));
    },
  );
});

test("connects a concern-provided ActionCable RPC surface to the concern method", async () => {
  await withRepo(
    {
      "app/channels/typing_actions.rb": [
        "module TypingActions",
        "  extend ActiveSupport::Concern",
        "",
        "  def typing(data)",
        "    Presence.update!(typing: data['typing'])",
        "  end",
        "end",
      ].join("\n"),
      "app/channels/chat_channel.rb": [
        "class ChatChannel < ApplicationCable::Channel",
        "  include TypingActions",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const implementation = graph.nodes.find((node) => node.qualified_name === "TypingActions#typing");
      const surface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_action"
          && node.surface.detail === "ACTION -> ChatChannel#typing [concern: TypingActions#typing]",
      );
      assert.ok(implementation);
      assert.ok(surface);
      assert.ok(graph.edges.some(
        (edge) => edge.kind === "framework_dispatch" && edge.from === surface.id && edge.to === implementation.id,
      ));
    },
  );
});

test("recognizes reject_unauthorized_connection only on the connection path", async () => {
  await withRepo(
    {
      "app/channels/application_cable/connection.rb": [
        "module ApplicationCable",
        "  class Connection < ActionCable::Connection::Base",
        "    def connect",
        "      reject_unauthorized_connection unless cookies.encrypted[:user_id]",
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
      const speak = graph.nodes.find((node) => node.qualified_name === "ChatChannel#speak");
      assert.ok(connect);
      assert.ok(speak);
      assert.equal(connect.roles.includes("authorization"), true);

      const connectionPath = findAssurancePath(graph, connect.location);
      const actionPath = findAssurancePath(graph, speak.location);
      assert.ok(connectionPath);
      assert.ok(actionPath);
      assert.equal(connectionPath.roles.includes("authorization"), true);
      assert.equal(actionPath.roles.includes("authorization"), false);
    },
  );
});
