# Actors

AuditSpec separates the **immediate actor** from the principal on whose behalf the action is performed.

`actor` is always the entity that directly caused the audited operation. `actor.on_behalf_of` is optional delegation context.

An AI agent acting for a user must remain `type: agent`; it must not be rewritten as the user. This preserves accountability across agentic workflows.
