import assert from "node:assert/strict";
import test from "node:test";
import { frappeStaticHookDispatches } from "../src/frappe-hooks.js";

test("extracts only handler values from static doc_events", () => {
  const source = [
    "app_name = 'wiki'",
    "doc_events = {",
    "    'Wiki.Page': {",
    "        'on_update': 'wiki.handlers.audit_wiki_update',",
    "        'on_submit': [",
    "            'wiki.handlers.audit_wiki_submit',",
    "            'wiki.handlers.notify_wiki_submit',",
    "        ],",
    "    },",
    "}",
    "app_title = 'Wiki'",
  ].join("\n");

  assert.deepEqual(
    frappeStaticHookDispatches(source).map(({ assignment, target }) => ({ assignment, target })),
    [
      { assignment: "doc_events", target: "wiki.handlers.audit_wiki_update" },
      { assignment: "doc_events", target: "wiki.handlers.audit_wiki_submit" },
      { assignment: "doc_events", target: "wiki.handlers.notify_wiki_submit" },
    ],
  );
});

test("extracts documented scheduler lists and nested cron handlers", () => {
  const source = [
    "scheduler_events = {",
    "    'hourly': ['wiki.jobs.refresh_index'],",
    "    'daily_long': [",
    "        'wiki.jobs.rebuild_search',",
    "    ],",
    "    'cron': {",
    "        '*/15 * * * *': ['wiki.jobs.collect_metrics'],",
    "    },",
    "}",
  ].join("\n");

  assert.deepEqual(
    frappeStaticHookDispatches(source).map(({ assignment, target }) => ({ assignment, target })),
    [
      { assignment: "scheduler_events", target: "wiki.jobs.refresh_index" },
      { assignment: "scheduler_events", target: "wiki.jobs.rebuild_search" },
      { assignment: "scheduler_events", target: "wiki.jobs.collect_metrics" },
    ],
  );
});

test("does not interpret dotted keys or unrelated strings as hook targets", () => {
  const source = [
    "doc_events = {",
    "    'Wiki.Page.Model': {",
    "        'on_update': 'wiki.handlers.audit_update',",
    "    },",
    "}",
    "scheduler_tick_interval = 'settings.production.fast'",
  ].join("\n");

  assert.deepEqual(
    frappeStaticHookDispatches(source).map(({ target }) => target),
    ["wiki.handlers.audit_update"],
  );
});

test("fails closed for dynamic hook composition and later mutation", () => {
  const spread = [
    "doc_events = {",
    "    **shared_doc_events,",
    "    'Wiki Page': {'on_update': 'wiki.handlers.audit_update'},",
    "}",
  ].join("\n");
  assert.deepEqual(frappeStaticHookDispatches(spread), []);

  const mutation = [
    "scheduler_events = {'hourly': ['wiki.jobs.refresh_index']}",
    "scheduler_events.update(extra_scheduler_events)",
  ].join("\n");
  assert.deepEqual(frappeStaticHookDispatches(mutation), []);
});

test("fails closed for repeated assignments and duplicate literal keys", () => {
  const reassigned = [
    "doc_events = {'Wiki Page': {'on_update': 'wiki.handlers.first'}}",
    "doc_events = {'Wiki Page': {'on_update': 'wiki.handlers.second'}}",
  ].join("\n");
  assert.deepEqual(frappeStaticHookDispatches(reassigned), []);

  const duplicate = [
    "scheduler_events = {",
    "    'hourly': ['wiki.jobs.first'],",
    "    'hourly': ['wiki.jobs.second'],",
    "}",
  ].join("\n");
  assert.deepEqual(frappeStaticHookDispatches(duplicate), []);
});

test("reports target source lines rather than assignment or key lines", () => {
  const source = [
    "doc_events = {",
    "    'Wiki Page': {",
    "        'on_update': 'wiki.handlers.audit_update',",
    "    },",
    "}",
    "scheduler_events = {",
    "    'hourly': [",
    "        'wiki.jobs.refresh_index',",
    "    ],",
    "}",
  ].join("\n");

  assert.deepEqual(
    frappeStaticHookDispatches(source).map(({ target, line }) => ({ target, line })),
    [
      { target: "wiki.handlers.audit_update", line: 3 },
      { target: "wiki.jobs.refresh_index", line: 8 },
    ],
  );
});
