export interface RailsBeforeAction {
  method: string;
  line: number;
}

export interface RailsControllerDeclaration {
  declared_name: string;
  superclass?: string;
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

export function beforeActionCallbacks(
  source: string,
  controllerQualifiedName: string,
  action: string,
): RailsBeforeAction[] {
  if (!controllerDeclaration(source, controllerQualifiedName)) return [];
  if (!callbackCompositionSupported(source)) return [];

  const results: RailsBeforeAction[] = [];
  const lines = source.split("\n");

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

    for (const method of parsed.methods) results.push({ method, line: index + 1 });
  }

  return results;
}
