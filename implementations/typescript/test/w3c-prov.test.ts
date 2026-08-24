import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  fromW3CProvProjection,
  toW3CProvProjection,
} from "../src/w3c-prov.js";
import type { AuditEvent } from "../src/types.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const event = JSON.parse(
  readFileSync(resolve(root, "conformance/valid/agent-action.json"), "utf8"),
) as AuditEvent;

test("projects an AuditSpec action into W3C PROV activity, agents, entities, and relations", () => {
  const projection = toW3CProvProjection(event);

  assert.equal(projection.activity.type, "prov:Activity");
  assert.equal(projection.activity.action, event.action);
  assert.equal(projection.activity.source, event.source);
  assert.equal(projection.activity.occurred_at, event.occurred_at);

  const association = projection.relations.find((relation) => relation.type === "prov:wasAssociatedWith");
  assert.ok(association);

  const delegation = projection.relations.find((relation) => relation.type === "prov:actedOnBehalfOf");
  assert.ok(delegation);
  if (delegation.type === "prov:actedOnBehalfOf") {
    assert.equal(delegation.auditspec_relationship, "on_behalf_of");
  }

  const targetUse = projection.relations.find(
    (relation) => relation.type === "prov:used" && relation.auditspec_relation === "target",
  );
  assert.ok(targetUse);

  const attribution = projection.relations.find((relation) => relation.type === "prov:wasAttributedTo");
  assert.ok(attribution);

  assert.deepEqual(fromW3CProvProjection(projection), event);
});

test("preserves a transitive delegation chain in relation order", () => {
  const delegated: AuditEvent = {
    ...event,
    id: "aud_agent_chain_001",
    actor: { type: "agent", id: "agent_child" },
    delegation: [
      {
        relationship: "delegated_by",
        principal: { type: "agent", id: "agent_parent" },
      },
      {
        relationship: "on_behalf_of",
        principal: { type: "user", id: "usr_42" },
      },
    ],
  };

  const projection = toW3CProvProjection(delegated);
  const delegationRelations = projection.relations.filter(
    (relation) => relation.type === "prov:actedOnBehalfOf",
  );

  assert.equal(delegationRelations.length, 2);
  assert.equal(delegationRelations[0]?.type, "prov:actedOnBehalfOf");
  assert.equal(delegationRelations[1]?.type, "prov:actedOnBehalfOf");
  if (delegationRelations[0]?.type === "prov:actedOnBehalfOf" && delegationRelations[1]?.type === "prov:actedOnBehalfOf") {
    assert.equal(delegationRelations[0].responsible, delegationRelations[1].delegate);
    assert.equal(delegationRelations[0].auditspec_relationship, "delegated_by");
    assert.equal(delegationRelations[1].auditspec_relationship, "on_behalf_of");
  }
});

test("rejects provenance graphs that drop required responsibility evidence", () => {
  const projection = toW3CProvProjection(event);
  const withoutDelegation = {
    ...projection,
    relations: projection.relations.filter((relation) => relation.type !== "prov:actedOnBehalfOf"),
  };

  assert.throws(
    () => fromW3CProvProjection(withoutDelegation),
    /missing required relation prov:actedOnBehalfOf/,
  );
});

test("rejects PROV activity identity or semantic conflicts", () => {
  const projection = toW3CProvProjection(event);

  assert.throws(
    () => fromW3CProvProjection({
      ...projection,
      activity: { ...projection.activity, id: "urn:auditspec:activity:different" },
    }),
    /Activity identity does not match/,
  );
  assert.throws(
    () => fromW3CProvProjection({
      ...projection,
      activity: { ...projection.activity, action: "invoice.delete" },
    }),
    /Activity semantics do not match/,
  );
});
