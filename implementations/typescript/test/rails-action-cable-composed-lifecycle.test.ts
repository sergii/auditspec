import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildAssuranceGraph, findAssurancePath } from "../src/assurance-graph.js";
import {
  composedActionCableActionDispatches,
  type RailsActionCableSource,
} from "../src/rails-action-cable.js";

function source(
  path: string,
  ruby: string[],
  methods: RailsActionCableSource["methods"],
): RailsActionCableSource {
  return { path, source: ruby.join("\n"), methods };
}

async function withRepo(files: Record<string, string>, run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "auditspec-action-cable-lifecycle-"));
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

test("resolves inherited subscribed and unsubscribed lifecycle callbacks regardless of Ruby visibility", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/secured_channel.rb",
      [
        "class SecuredChannel < ApplicationCable::Channel",
        "  protected",
        "",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "",
        "  private",
        "",
        "  def unsubscribed",
        "    Presence.update!(online: false)",
        "  end",
        "end",
      ],
      [
        { name: "subscribed", qualified_name: "SecuredChannel#subscribed", line: 4 },
        { name: "unsubscribed", qualified_name: "SecuredChannel#unsubscribed", line: 10 },
      ],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < SecuredChannel",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources)
    .filter((dispatch) => dispatch.source_path === "app/channels/chat_channel.rb");

  assert.deepEqual(
    dispatches.map((dispatch) => ({ kind: dispatch.surface_kind, detail: dispatch.detail, target: dispatch.target_qualified_name })),
    [
      {
        kind: "rails_action_cable_subscribe",
        detail: "SUBSCRIBE -> ChatChannel#subscribed [inherited: SecuredChannel#subscribed]",
        target: "SecuredChannel#subscribed",
      },
      {
        kind: "rails_action_cable_unsubscribe",
        detail: "UNSUBSCRIBE -> ChatChannel#unsubscribed [inherited: SecuredChannel#unsubscribed]",
        target: "SecuredChannel#unsubscribed",
      },
    ],
  );
  assert.equal(dispatches.some((dispatch) => dispatch.surface_kind === "rails_action_cable_action"), false);
});

test("resolves subscribed and unsubscribed lifecycle callbacks from a direct ActiveSupport::Concern", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/presence_lifecycle.rb",
      [
        "module PresenceLifecycle",
        "  extend ActiveSupport::Concern",
        "",
        "  private",
        "",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "",
        "  def unsubscribed",
        "    Presence.update!(online: false)",
        "  end",
        "end",
      ],
      [
        { name: "subscribed", qualified_name: "PresenceLifecycle#subscribed", line: 6 },
        { name: "unsubscribed", qualified_name: "PresenceLifecycle#unsubscribed", line: 10 },
      ],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < ApplicationCable::Channel",
        "  include PresenceLifecycle",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources)
    .filter((dispatch) => dispatch.source_path === "app/channels/chat_channel.rb");

  assert.deepEqual(
    dispatches.map((dispatch) => ({ kind: dispatch.surface_kind, detail: dispatch.detail, target: dispatch.target_qualified_name })),
    [
      {
        kind: "rails_action_cable_subscribe",
        detail: "SUBSCRIBE -> ChatChannel#subscribed [concern: PresenceLifecycle#subscribed]",
        target: "PresenceLifecycle#subscribed",
      },
      {
        kind: "rails_action_cable_unsubscribe",
        detail: "UNSUBSCRIBE -> ChatChannel#unsubscribed [concern: PresenceLifecycle#unsubscribed]",
        target: "PresenceLifecycle#unsubscribed",
      },
    ],
  );
});

test("fails closed for ambiguous concern lifecycle composition and honors subclass overrides", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/base_channel.rb",
      [
        "class BaseChannel < ApplicationCable::Channel",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "end",
      ],
      [{ name: "subscribed", qualified_name: "BaseChannel#subscribed", line: 2 }],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < BaseChannel",
        "  private",
        "",
        "  def subscribed",
        "    reject",
        "  end",
        "end",
      ],
      [{ name: "subscribed", qualified_name: "ChatChannel#subscribed", line: 4 }],
    ),
    source(
      "app/channels/first_lifecycle.rb",
      [
        "module FirstLifecycle",
        "  extend ActiveSupport::Concern",
        "  def unsubscribed",
        "    FirstReceipt.create!",
        "  end",
        "end",
      ],
      [{ name: "unsubscribed", qualified_name: "FirstLifecycle#unsubscribed", line: 3 }],
    ),
    source(
      "app/channels/second_lifecycle.rb",
      [
        "module SecondLifecycle",
        "  extend ActiveSupport::Concern",
        "  def unsubscribed",
        "    SecondReceipt.create!",
        "  end",
        "end",
      ],
      [{ name: "unsubscribed", qualified_name: "SecondLifecycle#unsubscribed", line: 3 }],
    ),
    source(
      "app/channels/reactions_channel.rb",
      [
        "class ReactionsChannel < ApplicationCable::Channel",
        "  include FirstLifecycle",
        "  include SecondLifecycle",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources);
  assert.equal(
    dispatches.some((dispatch) => dispatch.detail === "SUBSCRIBE -> ChatChannel#subscribed" && dispatch.target_qualified_name === "ChatChannel#subscribed"),
    true,
  );
  assert.equal(
    dispatches.some((dispatch) => dispatch.detail.includes("ChatChannel#subscribed [inherited: BaseChannel#subscribed]")),
    false,
  );
  assert.equal(
    dispatches.some((dispatch) => dispatch.detail.startsWith("UNSUBSCRIBE -> ReactionsChannel#unsubscribed")),
    false,
  );
});

test("builds inherited lifecycle surfaces to the actual implementation methods", async () => {
  await withRepo(
    {
      "app/channels/secured_channel.rb": [
        "class SecuredChannel < ApplicationCable::Channel",
        "  protected",
        "",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "",
        "  private",
        "",
        "  def unsubscribed",
        "    Presence.update!(online: false)",
        "  end",
        "end",
      ].join("\n"),
      "app/channels/chat_channel.rb": [
        "class ChatChannel < SecuredChannel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const subscribed = graph.nodes.find((node) => node.qualified_name === "SecuredChannel#subscribed");
      const unsubscribed = graph.nodes.find((node) => node.qualified_name === "SecuredChannel#unsubscribed");
      const speak = graph.nodes.find((node) => node.qualified_name === "ChatChannel#speak");
      assert.ok(subscribed);
      assert.ok(unsubscribed);
      assert.ok(speak);

      const subscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_subscribe"
          && node.surface.detail === "SUBSCRIBE -> ChatChannel#subscribed [inherited: SecuredChannel#subscribed]",
      );
      const unsubscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_unsubscribe"
          && node.surface.detail === "UNSUBSCRIBE -> ChatChannel#unsubscribed [inherited: SecuredChannel#unsubscribed]",
      );
      assert.ok(subscribeSurface);
      assert.ok(unsubscribeSurface);
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

test("builds concern-provided lifecycle surfaces to the concern implementation methods", async () => {
  await withRepo(
    {
      "app/channels/presence_lifecycle.rb": [
        "module PresenceLifecycle",
        "  extend ActiveSupport::Concern",
        "",
        "  def subscribed",
        "    authorize current_user",
        "  end",
        "",
        "  def unsubscribed",
        "    Presence.update!(online: false)",
        "  end",
        "end",
      ].join("\n"),
      "app/channels/chat_channel.rb": [
        "class ChatChannel < ApplicationCable::Channel",
        "  include PresenceLifecycle",
        "end",
      ].join("\n"),
    },
    async (root) => {
      const graph = await buildAssuranceGraph(root);
      const subscribed = graph.nodes.find((node) => node.qualified_name === "PresenceLifecycle#subscribed");
      const unsubscribed = graph.nodes.find((node) => node.qualified_name === "PresenceLifecycle#unsubscribed");
      assert.ok(subscribed);
      assert.ok(unsubscribed);

      const subscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_subscribe"
          && node.surface.detail === "SUBSCRIBE -> ChatChannel#subscribed [concern: PresenceLifecycle#subscribed]",
      );
      const unsubscribeSurface = graph.nodes.find(
        (node) => node.surface?.kind === "rails_action_cable_unsubscribe"
          && node.surface.detail === "UNSUBSCRIBE -> ChatChannel#unsubscribed [concern: PresenceLifecycle#unsubscribed]",
      );
      assert.ok(subscribeSurface);
      assert.ok(unsubscribeSurface);
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === subscribeSurface.id && edge.to === subscribed.id));
      assert.ok(graph.edges.some((edge) => edge.kind === "framework_dispatch" && edge.from === unsubscribeSurface.id && edge.to === unsubscribed.id));
    },
  );
});
