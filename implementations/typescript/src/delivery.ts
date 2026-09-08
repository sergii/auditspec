import { normalizeAuditEvent } from "./normalize.js";
import type { AuditEvent } from "./types.js";
import { assertAuditEvent } from "./validate.js";

export type AuditDeliveryStatus = "accepted" | "duplicate";

export interface AuditDeliveryResult {
  status: AuditDeliveryStatus;
  identity: string;
}

export class AuditIdentityConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuditIdentityConflictError";
  }
}

export function auditEventIdentity(event: AuditEvent): string {
  return `${event.source}\u0000${event.id}`;
}

function idempotencyIdentity(event: AuditEvent): string | undefined {
  return event.idempotency_key === undefined
    ? undefined
    : `${event.source}\u0000${event.idempotency_key}`;
}

function canonicalPayload(event: AuditEvent): string {
  return JSON.stringify(normalizeAuditEvent(event));
}

export class InMemoryAuditDeduplicator {
  readonly #events = new Map<string, string>();
  readonly #idempotencyKeys = new Map<string, string>();

  accept(event: AuditEvent): AuditDeliveryResult {
    assertAuditEvent(event);
    const identity = auditEventIdentity(event);
    const payload = canonicalPayload(event);
    const existingPayload = this.#events.get(identity);

    if (existingPayload !== undefined) {
      if (existingPayload !== payload) {
        throw new AuditIdentityConflictError(
          `AuditSpec identity collision: ${event.source} + ${event.id} refers to different payloads`,
        );
      }
      return { status: "duplicate", identity };
    }

    const idempotency = idempotencyIdentity(event);
    if (idempotency !== undefined) {
      const previousIdentity = this.#idempotencyKeys.get(idempotency);
      if (previousIdentity !== undefined && previousIdentity !== identity) {
        throw new AuditIdentityConflictError(
          `AuditSpec idempotency_key collision: ${event.idempotency_key} was previously associated with another event identity`,
        );
      }
    }

    this.#events.set(identity, payload);
    if (idempotency !== undefined) this.#idempotencyKeys.set(idempotency, identity);
    return { status: "accepted", identity };
  }

  get size(): number {
    return this.#events.size;
  }
}
