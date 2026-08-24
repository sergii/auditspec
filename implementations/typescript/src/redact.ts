import type { AuditEvent, Redaction } from "./types.js";

export type RedactionMethod = "redacted" | "omitted";

export interface RedactionPolicy {
  keys?: readonly string[];
  paths?: readonly string[];
  method?: RedactionMethod;
  reason?: string;
  replacement?: string;
}

export const DEFAULT_SECRET_KEYS = [
  "password",
  "secret",
  "token",
  "api_key",
  "access_token",
  "refresh_token",
  "session_cookie",
  "private_key",
] as const;

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function redactAuditEvent(event: AuditEvent, policy: RedactionPolicy = {}): AuditEvent {
  const clone = structuredClone(event) as AuditEvent;
  const keys = new Set((policy.keys ?? DEFAULT_SECRET_KEYS).map((key) => key.toLowerCase()));
  const paths = new Set(policy.paths ?? []);
  const method = policy.method ?? "redacted";
  const reason = policy.reason ?? "sensitive_data";
  const replacement = policy.replacement ?? "[REDACTED]";
  const additions: Redaction[] = [];

  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${path}/${index}`));
      return;
    }

    if (value === null || typeof value !== "object") return;

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}/${pointerSegment(key)}`;
      const matches = keys.has(key.toLowerCase()) || paths.has(childPath);

      if (matches) {
        if (method === "omitted") {
          delete (value as Record<string, unknown>)[key];
        } else {
          (value as Record<string, unknown>)[key] = replacement;
        }
        additions.push({ path: childPath, method, reason });
        continue;
      }

      visit(child, childPath);
    }
  };

  const existingRedactions = clone.redactions ?? [];
  delete clone.redactions;
  visit(clone, "");

  if (additions.length > 0 || existingRedactions.length > 0) {
    clone.redactions = [...existingRedactions, ...additions];
  }

  return clone;
}
