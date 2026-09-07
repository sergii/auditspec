export interface RailsBeforeAction {
  method: string;
  line: number;
}

export interface RailsControllerDeclaration {
  declared_name: string;
  superclass?: string;
}

export interface RailsConcernDeclaration {
  declared_name: string;
}

export interface RailsControllerSource {
  path: string;
  source: string;
}

export interface RailsAuthorizationCallbackInput {
  target_source: string;
  controller: string;
  action: string;
  controller_sources: RailsControllerSource[];
  authorization_methods: ReadonlySet<string>;
  max_depth?: number;
}

const SUPPORTED_CALLBACK_OPTIONS = new Set(["only", "except"]);

function parseActionOption(options: string, key: "only" | "except"): Set<string> | null | undefined {
  if (!new RegExp(`\\b${key}:`).test(options)) return undefined;

  const symbolArray = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(options);
  if (symbolArray) {
    return new Set([...symbolArray[1]!.matchAll(/:([A-Za-z_][A-Za-z0-9_]*[!?]?)/g)].map((match) => match[1]!));
  }

  const percentArray = new RegExp(`\\b${key}:\\s*%i\\[([^\\]]*)\\]`).exec(options);
  if (percentArray) {
    return new Set(percentArray[1]!.trim().split(/\s+/).filter(Boolean));
  }

  const single = new RegExp(`\\b${key}:\\s*:([A-Za-z_][A-Za-z0-9_]*[!?]?)`).exec(options);
  if (single) return new Set([single[1]!]);

  return null;
}

export function controllerDeclaration(
  source: string,
  controllerQualifiedName: string,
): RailsControllerDeclaration | null {
  const declarations = [...source.matchAll(
    /^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*Controller)\b(?:\s*<\s*([A-Za-z_][A-Za-z0-9_:]*))?/gm,
  )];
  if (declarations.length !== 1) return null;

  const declared = declarations[0]![1]!;
  const expectedLast = controllerQualifiedName.split("::").at(-1);
  const declaredLast = declared.split("::").at(-1);
  if (declared !== controllerQualifiedName && declaredLast !== expectedLast) return null;

  return {
    declared_name: declared,
    superclass: declarations[0]![2],
  };
}

export function concernDeclaration(
  source: string,
  concernQualifiedName: string,
): RailsConcernDeclaration | null {
  if (concernQualifiedName.includes("::")) return null;

  const declarations = [...source.matchAll(/^\s*module\s+([A-Z][A-Za-z0-9_:]*)\b/gm)];
  if (declarations.length !== 1) return null;

  const declared = declarations[0]![1]!;
  if (declared !== concernQualifiedName || declared.includes("::")) return null;
  if (!/^\s*extend\s+ActiveSupport::Concern\s*(?:#.*)?$/m.test(source)) return null;

  return { declared_name: declared };
}

export function callbackCompositionSupported(source: string): boolean {
  // A skip can change inherited/local callback semantics in ways this v0.1 resolver does not model yet.
  return !/^\s*skip_before_action\b/m.test(source);
}

function callbackOptionsSupported(options: string): boolean {
  const keys = [...options.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((match) => match[1]!);
  if (!keys.every((key) => SUPPORTED_CALLBACK_OPTIONS.has(key))) return false;

  let remainder = options;
  remainder = remainder.replace(/\bonly:\s*\[[^\]]*\]/g, "");
  remainder = remainder.replace(/\bonly:\s*%i\[[^\]]*\]/g, "");
  remainder = remainder.replace(/\bonly:\s*:[A-Za-z_][A-Za-z0-9_]*[!?]?/g, "");
  remainder = remainder.replace(/\bexcept:\s*\[[^\]]*\]/g, "");
  remainder = remainder.replace(/\bexcept:\s*%i\[[^\]]*\]/g, "");
  remainder = remainder.replace(/\bexcept:\s*:[A-Za-z_][A-Za-z0-9_]*[!?]?/g, "");
  return /^[\s,]*$/.test(remainder);
}

function methodsAndOptions(remainder: string): { methods: string[]; options: string } | null {
  const optionStart = remainder.search(/\b(?:only|except)\s*:/);
  const methodsText = (optionStart >= 0 ? remainder.slice(0, optionStart) : remainder).replace(/,\s*$/, "").trim();
  const options = optionStart >= 0 ? remainder.slice(optionStart) : "";

  if (!methodsText) return null;
  const tokens = methodsText.split(",").map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0 || tokens.some((token) => !/^:[A-Za-z_][A-Za-z0-9_]*[!?]?$/.test(token))) return null;
  return { methods: tokens.map((token) => token.slice(1)), options };
}

function callbacksFromLines(lines: string[], action: string, firstLine = 1): RailsBeforeAction[] {
  const results: RailsBeforeAction[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const code = lines[index]!.replace(/#.*$/, "").trim();
    const match = /^before_action\s+(.+)$/.exec(code);
    if (!match) continue;

    const parsed = methodsAndOptions(match[1]!);
    if (!parsed || !callbackOptionsSupported(parsed.options)) continue;

    const only = parseActionOption(parsed.options, "only");
    const except = parseActionOption(parsed.options, "except");
    if (only === null || except === null) continue;
    if (only && !only.has(action)) continue;
    if (except?.has(action)) continue;

    for (const method of parsed.methods) results.push({ method, line: firstLine + index });
  }

  return results;
}

export function beforeActionCallbacks(
  source: string,
  controllerQualifiedName: string,
  action: string,
): RailsBeforeAction[] {
  if (!controllerDeclaration(source, controllerQualifiedName)) return [];
  if (!callbackCompositionSupported(source)) return [];
  return callbacksFromLines(source.split("\n"), action);
}

function includedConcernBlock(source: string): { lines: string[]; first_line: number } | null {
  const lines = source.split("\n");
  const starts = lines
    .map((line, index) => ({ line, index, match: /^(\s*)included\s+do\s*(?:#.*)?$/.exec(line) }))
    .filter((entry) => entry.match);
  if (starts.length !== 1) return null;

  const start = starts[0]!;
  const indent = start.match![1]!;
  for (let index = start.index + 1; index < lines.length; index += 1) {
    const match = /^(\s*)end\s*(?:#.*)?$/.exec(lines[index]!);
    if (!match || match[1] !== indent) continue;
    return {
      lines: lines.slice(start.index + 1, index),
      first_line: start.index + 2,
    };
  }

  return null;
}

export function concernBeforeActionCallbacks(
  source: string,
  concernQualifiedName: string,
  action: string,
): RailsBeforeAction[] {
  if (!concernDeclaration(source, concernQualifiedName)) return [];
  if (!callbackCompositionSupported(source)) return [];

  const block = includedConcernBlock(source);
  if (!block) return [];
  return callbacksFromLines(block.lines, action, block.first_line);
}

function literalConcernIncludes(source: string): string[] {
  const concerns: string[] = [];
  for (const line of source.split("\n")) {
    const code = line.replace(/#.*$/, "").trim();
    const match = /^include\s+([A-Z][A-Za-z0-9_]*)$/.exec(code);
    if (match) concerns.push(match[1]!);
  }
  return [...new Set(concerns)];
}

function exactControllerSource(
  sources: RailsControllerSource[],
  controller: string,
): RailsControllerSource | null {
  const matches = sources.filter((candidate) => {
    const declaration = controllerDeclaration(candidate.source, controller);
    return declaration?.declared_name === controller;
  });
  return matches.length === 1 ? matches[0]! : null;
}

function exactConcernSource(
  sources: RailsControllerSource[],
  concern: string,
): RailsControllerSource | null {
  const matches = sources.filter((candidate) => concernDeclaration(candidate.source, concern)?.declared_name === concern);
  return matches.length === 1 ? matches[0]! : null;
}

function hasConcernAuthorization(
  source: string,
  action: string,
  sources: RailsControllerSource[],
  authorizationMethods: ReadonlySet<string>,
): boolean {
  for (const concern of literalConcernIncludes(source)) {
    const concernSource = exactConcernSource(sources, concern);
    if (!concernSource) continue;

    const callbacks = concernBeforeActionCallbacks(concernSource.source, concern, action);
    if (callbacks.some((callback) => authorizationMethods.has(`${concern}#${callback.method}`))) {
      return true;
    }
  }
  return false;
}

export function hasAuthorizationBeforeAction(input: RailsAuthorizationCallbackInput): boolean {
  const maxDepth = input.max_depth ?? 8;
  let currentController = input.controller;
  let currentSource = input.target_source;
  const visited = new Set<string>();

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (visited.has(currentController)) return false;
    visited.add(currentController);

    if (!callbackCompositionSupported(currentSource)) return false;
    const callbacks = beforeActionCallbacks(currentSource, currentController, input.action);
    if (callbacks.some((callback) => input.authorization_methods.has(`${currentController}#${callback.method}`))) {
      return true;
    }
    if (hasConcernAuthorization(currentSource, input.action, input.controller_sources, input.authorization_methods)) {
      return true;
    }

    // v0.1 inheritance proof intentionally stops at namespaced controller chains.
    if (currentController.includes("::")) return false;

    const declaration = controllerDeclaration(currentSource, currentController);
    const superclass = declaration?.superclass;
    if (!superclass || superclass.includes("::") || !superclass.endsWith("Controller")) return false;

    const parentSource = exactControllerSource(input.controller_sources, superclass);
    if (!parentSource) return false;
    currentController = superclass;
    currentSource = parentSource.source;
  }

  return false;
}
