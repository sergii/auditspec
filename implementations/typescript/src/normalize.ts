import type { AuditEvent, JsonValue } from "./types.js";

function sortJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}

export function normalizeAuditEvent(event: AuditEvent): AuditEvent {
  return sortJson(event as unknown as JsonValue) as unknown as AuditEvent;
}
