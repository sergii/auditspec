import assert from "node:assert/strict";
import test from "node:test";
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

test("resolves public RPC actions through an unambiguous channel superclass chain", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/secured_channel.rb",
      [
        "class SecuredChannel < ApplicationCable::Channel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "",
        "  private",
        "",
        "  def hidden(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ],
      [
        { name: "speak", qualified_name: "SecuredChannel#speak", line: 2 },
        { name: "hidden", qualified_name: "SecuredChannel#hidden", line: 8 },
      ],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < SecuredChannel",
        "  def ping(data)",
        "    Presence.update!(seen_at: data['at'])",
        "  end",
        "end",
      ],
      [{ name: "ping", qualified_name: "ChatChannel#ping", line: 2 }],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources)
    .filter((dispatch) => dispatch.source_path === "app/channels/chat_channel.rb");

  assert.deepEqual(
    dispatches.map((dispatch) => ({ detail: dispatch.detail, target: dispatch.target_qualified_name, target_path: dispatch.target_path })),
    [
      {
        detail: "ACTION -> ChatChannel#ping",
        target: "ChatChannel#ping",
        target_path: "app/channels/chat_channel.rb",
      },
      {
        detail: "ACTION -> ChatChannel#speak [inherited: SecuredChannel#speak]",
        target: "SecuredChannel#speak",
        target_path: "app/channels/secured_channel.rb",
      },
    ],
  );
  assert.equal(dispatches.some((dispatch) => dispatch.detail.includes("hidden")), false);
});

test("resolves direct ActiveSupport::Concern RPC actions", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/typing_actions.rb",
      [
        "module TypingActions",
        "  extend ActiveSupport::Concern",
        "",
        "  def typing(data)",
        "    Presence.update!(typing: data['typing'])",
        "  end",
        "",
        "  private",
        "",
        "  def hidden_action(data)",
        "    Presence.update!(hidden: data['hidden'])",
        "  end",
        "end",
      ],
      [
        { name: "typing", qualified_name: "TypingActions#typing", line: 4 },
        { name: "hidden_action", qualified_name: "TypingActions#hidden_action", line: 10 },
      ],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < ApplicationCable::Channel",
        "  include TypingActions",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources)
    .filter((dispatch) => dispatch.source_path === "app/channels/chat_channel.rb");

  assert.deepEqual(dispatches.map((dispatch) => ({ detail: dispatch.detail, target: dispatch.target_qualified_name })), [
    {
      detail: "ACTION -> ChatChannel#typing [concern: TypingActions#typing]",
      target: "TypingActions#typing",
    },
  ]);
});

test("fails closed when overrides or concern composition make RPC resolution ambiguous", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/base_channel.rb",
      [
        "class BaseChannel < ApplicationCable::Channel",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ],
      [{ name: "speak", qualified_name: "BaseChannel#speak", line: 2 }],
    ),
    source(
      "app/channels/chat_channel.rb",
      [
        "class ChatChannel < BaseChannel",
        "  private",
        "",
        "  def speak(data)",
        "    Message.create!(body: data['body'])",
        "  end",
        "end",
      ],
      [{ name: "speak", qualified_name: "ChatChannel#speak", line: 4 }],
    ),
    source(
      "app/channels/first_actions.rb",
      [
        "module FirstActions",
        "  extend ActiveSupport::Concern",
        "  def react(data)",
        "    Reaction.create!(kind: data['kind'])",
        "  end",
        "end",
      ],
      [{ name: "react", qualified_name: "FirstActions#react", line: 3 }],
    ),
    source(
      "app/channels/second_actions.rb",
      [
        "module SecondActions",
        "  extend ActiveSupport::Concern",
        "  def react(data)",
        "    Reaction.create!(kind: data['kind'])",
        "  end",
        "end",
      ],
      [{ name: "react", qualified_name: "SecondActions#react", line: 3 }],
    ),
    source(
      "app/channels/reactions_channel.rb",
      [
        "class ReactionsChannel < ApplicationCable::Channel",
        "  include FirstActions",
        "  include SecondActions",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources);
  assert.equal(dispatches.some((dispatch) => dispatch.detail === "ACTION -> ChatChannel#speak [inherited: BaseChannel#speak]"), false);
  assert.equal(dispatches.some((dispatch) => dispatch.detail.startsWith("ACTION -> ReactionsChannel#react")), false);
});

test("supports fully-qualified superclass chains but not lexical constant lookup", () => {
  const sources: RailsActionCableSource[] = [
    source(
      "app/channels/admin/base_channel.rb",
      [
        "class Admin::BaseChannel < ApplicationCable::Channel",
        "  def publish(data)",
        "    Event.create!(payload: data)",
        "  end",
        "end",
      ],
      [{ name: "publish", qualified_name: "Admin::BaseChannel#publish", line: 2 }],
    ),
    source(
      "app/channels/admin/events_channel.rb",
      [
        "class Admin::EventsChannel < Admin::BaseChannel",
        "end",
      ],
      [],
    ),
    source(
      "app/channels/admin/unsafe_channel.rb",
      [
        "class Admin::UnsafeChannel < BaseChannel",
        "end",
      ],
      [],
    ),
  ];

  const dispatches = composedActionCableActionDispatches(sources);
  assert.equal(
    dispatches.some((dispatch) => dispatch.detail === "ACTION -> Admin::EventsChannel#publish [inherited: Admin::BaseChannel#publish]"),
    true,
  );
  assert.equal(dispatches.some((dispatch) => dispatch.detail.startsWith("ACTION -> Admin::UnsafeChannel#")), false);
});
