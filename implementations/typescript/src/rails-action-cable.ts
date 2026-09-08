export interface RailsActionCableMethod {
  name: string;
  qualified_name: string;
  line: number;
}

export interface RailsActionCableSource {
  path: string;
  source: string;
  methods: readonly RailsActionCableMethod[];
}

export interface RailsActionCableDispatch {
  target_qualified_name: string;
  surface_kind:
    | "rails_action_cable_action"
    | "rails_action_cable_subscribe"
    | "rails_action_cable_unsubscribe"
    | "rails_action_cable_connect"
    | "rails_action_cable_disconnect";
  detail: string;
  line: number;
  source_path?: string;
  target_path?: string;
}

interface ChannelDeclaration {
  declared_name: string;
  superclass: string;
  line: number;
}

interface ConcernDeclaration {
  declared_name: string;
  line: number;
}

interface ConcernInclude {
  name: string;
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

const DIRECT_CHANNEL_BASES = new Set([
  "ApplicationCable::Channel",
  "ActionCable::Channel::Base",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function classNameFor(qualifiedName: string): string | undefined {
  const separator = qualifiedName.lastIndexOf("#");
  return separator > 0 ? qualifiedName.slice(0, separator) : undefined;
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function channelDeclaration(source: string): ChannelDeclaration | null {
  const matches = [...source.matchAll(
    /^([ \t]*)class\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*Channel)\s*<\s*([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)\b/gm,
  )];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  return {
    declared_name: match[2]!,
    superclass: match[3]!,
    line: lineNumber(source, match.index ?? 0),
  };
}

function concernDeclaration(source: string): ConcernDeclaration | null {
  const matches = [...source.matchAll(/^([ \t]*)module\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)\b/gm)];
  if (matches.length !== 1) return null;
  if (!/^\s*extend\s+ActiveSupport::Concern\s*(?:#.*)?$/m.test(source)) return null;
  const match = matches[0]!;
  return {
    declared_name: match[2]!,
    line: lineNumber(source, match.index ?? 0),
  };
}

function classDeclarationLine(source: string, className: string): number | undefined {
  const declaration = channelDeclaration(source);
  if (!declaration || declaration.declared_name !== className) return undefined;
  if (!DIRECT_CHANNEL_BASES.has(declaration.superclass)) return undefined;
  return declaration.line;
}

function connectionClassDeclarationLine(source: string, className: string): number | undefined {
  if (className !== "ApplicationCable::Connection") return undefined;

  const explicit = /^([ \t]*)class\s+ApplicationCable::Connection\s*<\s*ActionCable::Connection::Base\b/gm;
  const explicitMatches = [...source.matchAll(explicit)];
  if (explicitMatches.length === 1) return lineNumber(source, explicitMatches[0]!.index ?? 0);
  if (explicitMatches.length > 1) return undefined;

  const moduleMatches = [...source.matchAll(/^([ \t]*)module\s+ApplicationCable\s*$/gm)];
  const classMatches = [...source.matchAll(/^([ \t]*)class\s+Connection\s*<\s*ActionCable::Connection::Base\b/gm)];
  if (moduleMatches.length !== 1 || classMatches.length !== 1) return undefined;

  const moduleMatch = moduleMatches[0]!;
  const classMatch = classMatches[0]!;
  if ((classMatch.index ?? 0) <= (moduleMatch.index ?? 0)) return undefined;
  const moduleIndent = moduleMatch[1]?.length ?? 0;
  const classIndent = classMatch[1]?.length ?? 0;
  if (classIndent <= moduleIndent) return undefined;
  return lineNumber(source, classMatch.index ?? 0);
}

function leadingWhitespace(line: string): number {
  return line.match(/^[ \t]*/)?.[0].length ?? 0;
}

function isPublicMethod(
  source: string,
  method: RailsActionCableMethod,
  declarationLine: number,
  excludedMethods: ReadonlySet<string> = new Set(),
): boolean {
  if (excludedMethods.has(method.name)) return false;

  const lines = source.split("\n");
  const methodLine = lines[method.line - 1];
  if (!methodLine || method.line <= declarationLine) return false;
  const methodIndent = leadingWhitespace(methodLine);
  const escapedMethod = escapeRegExp(method.name);
  if (new RegExp(`^\\s*(?:private|protected)\\s+def\\s+${escapedMethod}\\b`).test(methodLine)) return false;

  let visibility: "public" | "private" | "protected" = "public";
  for (let index = declarationLine; index < method.line - 1; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (index + 1 > declarationLine && /^(?:class|module)\b/.test(trimmed)) return false;
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

function isPublicChannelAction(source: string, method: RailsActionCableMethod, classLine: number): boolean {
  return isPublicMethod(source, method, classLine, ACTION_CABLE_INTERNAL_METHODS);
}

function channelLifecycle(
  methodName: string,
): { surface_kind: "rails_action_cable_subscribe" | "rails_action_cable_unsubscribe"; verb: "SUBSCRIBE" | "UNSUBSCRIBE" } | undefined {
  if (methodName === "subscribed") {
    return { surface_kind: "rails_action_cable_subscribe", verb: "SUBSCRIBE" };
  }
  if (methodName === "unsubscribed") {
    return { surface_kind: "rails_action_cable_unsubscribe", verb: "UNSUBSCRIBE" };
  }
  return undefined;
}

function methodsForContainer(source: RailsActionCableSource, container: string): RailsActionCableMethod[] {
  return source.methods.filter((method) => classNameFor(method.qualified_name) === container);
}

function literalConcernIncludes(source: string): ConcernInclude[] {
  const results: ConcernInclude[] = [];
  for (const match of source.matchAll(/^\s*include\s+([A-Z][A-Za-z0-9_]*(?:::[A-Z][A-Za-z0-9_]*)*)\s*(?:#.*)?$/gm)) {
    results.push({
      name: match[1]!,
      line: lineNumber(source, match.index ?? 0),
    });
  }
  return results;
}

function exactChannelSource(sources: readonly RailsActionCableSource[], className: string): RailsActionCableSource | null {
  const matches = sources.filter((candidate) => channelDeclaration(candidate.source)?.declared_name === className);
  return matches.length === 1 ? matches[0]! : null;
}

function exactConcernSource(sources: readonly RailsActionCableSource[], concernName: string): RailsActionCableSource | null {
  const matches = sources.filter((candidate) => concernDeclaration(candidate.source)?.declared_name === concernName);
  return matches.length === 1 ? matches[0]! : null;
}

function resolveChannelChain(
  source: RailsActionCableSource,
  sources: readonly RailsActionCableSource[],
  maxDepth: number,
): Array<{ source: RailsActionCableSource; declaration: ChannelDeclaration }> | null {
  const first = channelDeclaration(source.source);
  if (!first) return null;

  const chain: Array<{ source: RailsActionCableSource; declaration: ChannelDeclaration }> = [];
  const visited = new Set<string>();
  let currentSource = source;
  let current = first;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (visited.has(current.declared_name)) return null;
    visited.add(current.declared_name);
    chain.push({ source: currentSource, declaration: current });

    if (DIRECT_CHANNEL_BASES.has(current.superclass)) return chain;
    if (!current.superclass.endsWith("Channel")) return null;

    // Fully-qualified child constants must use fully-qualified superclass references.
    // Ruby lexical constant lookup is deliberately not inferred in this v0.1 proof model.
    if (current.declared_name.includes("::") && !current.superclass.includes("::")) return null;

    const parentSource = exactChannelSource(sources, current.superclass);
    if (!parentSource) return null;
    const parent = channelDeclaration(parentSource.source);
    if (!parent || parent.declared_name !== current.superclass) return null;
    currentSource = parentSource;
    current = parent;
  }

  return null;
}

function composedConcernCandidates(
  owner: { source: RailsActionCableSource; declaration: ChannelDeclaration },
  allSources: readonly RailsActionCableSource[],
): Array<{ method: RailsActionCableMethod; source: RailsActionCableSource; include: ConcernInclude }> {
  const results: Array<{ method: RailsActionCableMethod; source: RailsActionCableSource; include: ConcernInclude }> = [];
  for (const include of literalConcernIncludes(owner.source.source)) {
    const concernSource = exactConcernSource(allSources, include.name);
    if (!concernSource) continue;
    const declaration = concernDeclaration(concernSource.source);
    if (!declaration || declaration.declared_name !== include.name) continue;

    for (const method of methodsForContainer(concernSource, include.name)) {
      if (method.line <= declaration.line) continue;
      if (!channelLifecycle(method.name)
        && !isPublicMethod(concernSource.source, method, declaration.line, ACTION_CABLE_INTERNAL_METHODS)) continue;
      results.push({ method, source: concernSource, include });
    }
  }
  return results;
}

function composedMethodDispatch(
  child: ChannelDeclaration,
  childSource: RailsActionCableSource,
  method: RailsActionCableMethod,
  targetSource: RailsActionCableSource,
  line: number,
  provenance: string,
): RailsActionCableDispatch {
  const lifecycle = channelLifecycle(method.name);
  if (lifecycle) {
    return {
      target_qualified_name: method.qualified_name,
      surface_kind: lifecycle.surface_kind,
      detail: `${lifecycle.verb} -> ${child.declared_name}#${method.name}${provenance}`,
      line,
      source_path: childSource.path,
      target_path: targetSource.path,
    };
  }

  return {
    target_qualified_name: method.qualified_name,
    surface_kind: "rails_action_cable_action",
    detail: `ACTION -> ${child.declared_name}#${method.name}${provenance}`,
    line,
    source_path: childSource.path,
    target_path: targetSource.path,
  };
}

export function composedActionCableActionDispatches(
  sources: readonly RailsActionCableSource[],
  maxDepth = 8,
): RailsActionCableDispatch[] {
  const dispatches: RailsActionCableDispatch[] = [];

  for (const childSource of sources) {
    const chain = resolveChannelChain(childSource, sources, maxDepth);
    if (!chain) continue;
    const child = chain[0]!.declaration;
    const shadowed = new Set<string>();

    for (let index = 0; index < chain.length; index += 1) {
      const owner = chain[index]!;
      const ownerMethods = methodsForContainer(owner.source, owner.declaration.declared_name);

      for (const method of ownerMethods) {
        if (shadowed.has(method.name)) continue;
        shadowed.add(method.name);

        // Direct methods on directly-rooted channels are already emitted by actionCableDispatches.
        if (index === 0 && chain.length === 1) continue;

        const lifecycle = channelLifecycle(method.name);
        if (!lifecycle
          && !isPublicMethod(owner.source.source, method, owner.declaration.line, ACTION_CABLE_INTERNAL_METHODS)) continue;

        dispatches.push(composedMethodDispatch(
          child,
          childSource,
          method,
          owner.source,
          child.line,
          index === 0 ? "" : ` [inherited: ${method.qualified_name}]`,
        ));
      }

      const concernCandidates = composedConcernCandidates(owner, sources);
      const byName = new Map<string, typeof concernCandidates>();
      for (const candidate of concernCandidates) {
        const candidates = byName.get(candidate.method.name) ?? [];
        candidates.push(candidate);
        byName.set(candidate.method.name, candidates);
      }

      for (const [name, candidates] of byName) {
        if (shadowed.has(name)) continue;
        // Multiple included concerns defining the same method are order-sensitive in Ruby.
        // Fail closed instead of guessing which implementation wins.
        if (candidates.length !== 1) {
          shadowed.add(name);
          continue;
        }
        const candidate = candidates[0]!;
        shadowed.add(name);
        dispatches.push(composedMethodDispatch(
          child,
          childSource,
          candidate.method,
          candidate.source,
          candidate.include.line,
          ` [concern: ${candidate.method.qualified_name}]`,
        ));
      }

      // Any method definition, including a non-public one, shadows a superclass method of the same name.
      for (const method of ownerMethods) shadowed.add(method.name);
    }
  }

  return dispatches;
}

function connectionLifecycleDispatch(
  source: string,
  method: RailsActionCableMethod,
): RailsActionCableDispatch | undefined {
  if (method.name !== "connect" && method.name !== "disconnect") return undefined;
  const className = classNameFor(method.qualified_name);
  if (!className) return undefined;
  const classLine = connectionClassDeclarationLine(source, className);
  if (!classLine || method.line <= classLine) return undefined;

  if (method.name === "connect") {
    return {
      target_qualified_name: method.qualified_name,
      surface_kind: "rails_action_cable_connect",
      detail: `CONNECT -> ${method.qualified_name}`,
      line: method.line,
    };
  }

  return {
    target_qualified_name: method.qualified_name,
    surface_kind: "rails_action_cable_disconnect",
    detail: `DISCONNECT -> ${method.qualified_name}`,
    line: method.line,
  };
}

export function actionCableDispatches(
  source: string,
  path: string,
  methods: readonly RailsActionCableMethod[],
): RailsActionCableDispatch[] {
  if (!path.startsWith("app/channels/") || !path.endsWith(".rb")) return [];

  const dispatches: RailsActionCableDispatch[] = [];
  for (const method of methods) {
    const connectionDispatch = connectionLifecycleDispatch(source, method);
    if (connectionDispatch) {
      dispatches.push(connectionDispatch);
      continue;
    }

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
