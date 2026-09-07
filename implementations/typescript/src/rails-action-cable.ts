export interface RailsActionCableMethod {
  name: string;
  qualified_name: string;
  line: number;
}

export interface RailsActionCableDispatch {
  target_qualified_name: string;
  surface_kind: "rails_action_cable_action" | "rails_action_cable_subscribe" | "rails_action_cable_unsubscribe";
  detail: string;
  line: number;
}

const ACTION_CABLE_INTERNAL_METHODS = new Set([
  "initialize",
  "perform_action",
  "subscribe_to_channel",
  "unsubscribe_from_channel",
  "unsubscribed?",
  "subscribed",
  "unsubscribed",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classNameFor(qualifiedName: string): string | undefined {
  const separator = qualifiedName.lastIndexOf("#");
  return separator > 0 ? qualifiedName.slice(0, separator) : undefined;
}

function classDeclarationLine(source: string, className: string): number | undefined {
  const escaped = escapeRegExp(className);
  const pattern = new RegExp(
    `^([ \\t]*)class\\s+${escaped}\\s*<\\s*(?:ApplicationCable::Channel|ActionCable::Channel::Base)\\b`,
    "gm",
  );
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  return source.slice(0, match.index ?? 0).split("\n").length;
}

function leadingWhitespace(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function isPublicChannelAction(source: string, method: RailsActionCableMethod, classLine: number): boolean {
  if (ACTION_CABLE_INTERNAL_METHODS.has(method.name)) return false;

  const lines = source.split("\n");
  const methodLine = lines[method.line - 1];
  if (!methodLine || method.line <= classLine) return false;
  const methodIndent = leadingWhitespace(methodLine);
  const escapedMethod = escapeRegExp(method.name);
  if (new RegExp(`^\\s*(?:private|protected)\\s+def\\s+${escapedMethod}\\b`).test(methodLine)) return false;

  let visibility: "public" | "private" | "protected" = "public";
  for (let index = classLine; index < method.line - 1; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (index + 1 > classLine && /^(?:class|module)\b/.test(trimmed)) return false;
    if (leadingWhitespace(line) !== methodIndent) continue;
    if (trimmed === "public") visibility = "public";
    else if (trimmed === "private") visibility = "private";
    else if (trimmed === "protected") visibility = "protected";
  }

  if (visibility !== "public") return false;

  const explicitNonPublic = new RegExp(
    `^\\s*(?:private|protected)\\s+(?:[^#\\n]*,\\s*)?:${escapedMethod}(?:\\b|\\s|,|$)`,
    "m",
  );
  return !explicitNonPublic.test(source);
}

export function actionCableDispatches(
  source: string,
  path: string,
  methods: readonly RailsActionCableMethod[],
): RailsActionCableDispatch[] {
  if (!path.startsWith("app/channels/") || !path.endsWith(".rb")) return [];

  const dispatches: RailsActionCableDispatch[] = [];
  for (const method of methods) {
    const className = classNameFor(method.qualified_name);
    if (!className) continue;
    const classLine = classDeclarationLine(source, className);
    if (!classLine) continue;

    if (method.name === "subscribed") {
      dispatches.push({
        target_qualified_name: method.qualified_name,
        surface_kind: "rails_action_cable_subscribe",
        detail: `SUBSCRIBE -> ${method.qualified_name}`,
        line: method.line,
      });
      continue;
    }

    if (method.name === "unsubscribed") {
      dispatches.push({
        target_qualified_name: method.qualified_name,
        surface_kind: "rails_action_cable_unsubscribe",
        detail: `UNSUBSCRIBE -> ${method.qualified_name}`,
        line: method.line,
      });
      continue;
    }

    if (!isPublicChannelAction(source, method, classLine)) continue;
    dispatches.push({
      target_qualified_name: method.qualified_name,
      surface_kind: "rails_action_cable_action",
      detail: `ACTION -> ${method.qualified_name}`,
      line: method.line,
    });
  }

  return dispatches;
}
