export interface RailsBeforeAction {
  method: string;
  line: number;
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

function controllerDeclarationMatches(source: string, controllerQualifiedName: string): boolean {
  const declarations = [...source.matchAll(/^\s*class\s+([A-Za-z_][A-Za-z0-9_:]*Controller)\b/gm)].map((match) => match[1]!);
  if (declarations.length !== 1) return false;

  const declared = declarations[0]!;
  const expectedLast = controllerQualifiedName.split("::").at(-1);
  const declaredLast = declared.split("::").at(-1);
  return declared === controllerQualifiedName || declaredLast === expectedLast;
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
  if (!controllerDeclarationMatches(source, controllerQualifiedName)) return [];

  // A skip can change inheritance/local callback semantics in ways this v0.1 resolver does not model yet.
  if (/^\s*skip_before_action\b/m.test(source)) return [];

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
