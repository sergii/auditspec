from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol

from auditspec import event_identity, normalize, validate_or_raise


class CallbackRegistry(Protocol):
    def add(self, callback: Callable[[], Any]) -> Any: ...


class FrappeDatabase(Protocol):
    after_commit: CallbackRegistry


InsertEvent = Callable[[dict[str, Any]], Any]
InsertOutbox = Callable[[str, dict[str, Any]], Any]
WakePublisher = Callable[[str], Any]


@dataclass(frozen=True)
class OperationSemantics:
    transaction: str
    document_hooks: str
    note: str


_OPERATION_SEMANTICS = {
    "frappe.db.commit": OperationSemantics(
        transaction="boundary",
        document_hooks="not_applicable",
        note="Explicitly commits the current database transaction.",
    ),
    "frappe.db.truncate": OperationSemantics(
        transaction="non_rollbackable",
        document_hooks="bypassed",
        note="Frappe commits before TRUNCATE; the operation cannot be rolled back.",
    ),
    "frappe.db.set_value": OperationSemantics(
        transaction="current",
        document_hooks="bypassed",
        note="Direct database update; ORM document triggers are not called.",
    ),
    "frappe.db.update": OperationSemantics(
        transaction="current",
        document_hooks="bypassed",
        note="Alias of frappe.db.set_value.",
    ),
    "frappe.db.bulk_update": OperationSemantics(
        transaction="current",
        document_hooks="bypassed",
        note="Direct bulk database update; document events and validations are not triggered.",
    ),
}


def operation_semantics(operation: str) -> OperationSemantics:
    return _OPERATION_SEMANTICS.get(
        operation,
        OperationSemantics(
            transaction="current",
            document_hooks="unknown",
            note="No stronger Frappe-specific claim is available for this operation.",
        ),
    )


class FrappeAuditAdapter:
    """Transaction-neutral AuditSpec primitives for Frappe request/job code.

    The adapter never calls frappe.db.commit() or frappe.db.rollback(). It joins
    the transaction already owned by the active Frappe request, background job,
    patch, or explicit application boundary.
    """

    def __init__(
        self,
        *,
        db: FrappeDatabase,
        insert_event: InsertEvent,
        insert_outbox: InsertOutbox,
        wake_publisher: WakePublisher | None = None,
    ) -> None:
        self._db = db
        self._insert_event = insert_event
        self._insert_outbox = insert_outbox
        self._wake_publisher = wake_publisher

    def emit_same_store(self, event: dict[str, Any]) -> Any:
        """Persist a validated event in the caller's current DB transaction."""
        validate_or_raise(event)
        return self._insert_event(normalize(event))

    def stage_outbox(self, event: dict[str, Any]) -> Any:
        """Persist a durable outbox intent in the caller's current transaction.

        If a wake callback is configured, it is registered with Frappe's
        after_commit hook only after the durable outbox insert succeeds. The
        callback is merely a wake-up signal; the durable outbox row remains the
        source of truth for retry and delivery recovery.
        """
        validate_or_raise(event)
        identity = event_identity(event)
        result = self._insert_outbox(identity, normalize(event))

        if self._wake_publisher is not None:
            self._db.after_commit.add(lambda: self._wake_publisher(identity))

        return result


__all__ = [
    "FrappeAuditAdapter",
    "OperationSemantics",
    "operation_semantics",
]
