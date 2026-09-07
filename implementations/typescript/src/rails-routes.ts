export interface RailsRouteDeclaration {
  verb: string;
  path: string;
  controller: string;
  action: string;
  line: number;
}

type RailsResourceKind = "resources" | "resource";

interface RouteContext {
  supported: boolean;
  path_prefix: string;
  controller_prefix: string;
}

interface ResourceExpansion {
  routes: RailsRouteDeclaration[];
  child_context?: RouteContext;
}

const PLURAL_ACTIONS = ["index", "create", "new", "show", "edit", "update", "destroy"] as const;
const SINGULAR_ACTIONS = ["create", "new", "show", "edit", "update", "destroy"] as const;
const IRREGULAR_PLURALS = new Map<string, string>([
  ["child", "children"],
  ["foot", "feet"],
  ["goose", "geese"],
  ["man", "men"],
  ["mouse", "mice"],
  ["ox", "oxen"],
  ["person", "people"],
  ["tooth", "teeth"],
  ["woman", "women"],
]);
const IRREGULAR_SINGULARS = new Map([...IRREGULAR_PLURALS].map(([singular, plural]) => [plural, singular]));

function stripRubyComment(line: string): string {
  let quote: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "#") return line.slice(0, index);
  }

  return line;
}

function parseActionOption(options: string, key: "only" | "except"): Set<string> | null | undefined {
  if (!new RegExp(`\\b${key}:`).test(options)) return undefined;

  const symbolArray = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(options);
  if (symbolArray) {
    return new Set([...symbolArray[1]!.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]!));
  }

  const percentArray = new RegExp(`\\b${key}:\\s*%i\\[([^\\]]*)\\]`).exec(options);
  if (percentArray) {
    return new Set(percentArray[1]!.trim().split(/\s+/).filter(Boolean));
  }

  const single = new RegExp(`\\b${key}:\\s*:([A-Za-z_][A-Za-z0-9_]*)`).exec(options);
  if (single) return new Set([single[1]!]);

  return null;
}

function literalOption(options: string, key: "controller" | "path" | "param"): string | null | undefined {
  if (!new RegExp(`\\b${key}:`).test(options)) return undefined;
  const match = new RegExp(`\\b${key}:\\s*(?:["']([^"']+)["']|:([A-Za-z_][A-Za-z0-9_\\/]*))`).exec(options);
  return match ? (match[1] ?? match[2]!) : null;
}

function selectedActions(kind: RailsResourceKind, options: string): Set<string> | null {
  const defaults = kind === "resources" ? PLURAL_ACTIONS : SINGULAR_ACTIONS;
  const only = parseActionOption(options, "only");
  const except = parseActionOption(options, "except");
  if (only === null || except === null) return null;

  let actions = new Set<string>(defaults);
  if (only) actions = new Set([...actions].filter((action) => only.has(action)));
  if (except) actions = new Set([...actions].filter((action) => !except.has(action)));
  return actions;
}

function pluralizeResourceName(name: string): string | undefined {
  const irregular = IRREGULAR_PLURALS.get(name);
  if (irregular) return irregular;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(?:is|us|ss)$/i.test(name)) return undefined;
  if (/(?:s|x|z|ch|sh)$/i.test(name)) return `${name}es`;
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `${name}s`;
  return undefined;
}

function singularizeResourceName(name: string): string | undefined {
  const irregular = IRREGULAR_SINGULARS.get(name);
  if (irregular) return irregular;
  if (/[^aeiou]ies$/i.test(name)) return `${name.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes)$/i.test(name)) return name.slice(0, -2);
  if (/ses$/i.test(name)) return undefined;
  if (/s$/i.test(name) && !/ss$/i.test(name)) return name.slice(0, -1);
  return undefined;
}

function normalizedPathSegment(value: string): string | undefined {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  return normalized || undefined;
}

function joinPath(prefix: string, segment: string): string | undefined {
  const normalized = normalizedPathSegment(segment);
  if (!normalized) return undefined;
  return `${prefix}/${normalized}`.replace(/\/{2,}/g, "/");
}

function joinController(prefix: string, controller: string): string {
  return [prefix, controller].filter(Boolean).join("/");
}

function resourceOptionsSupported(options: string): boolean {
  let remaining = options;
  remaining = remaining.replace(/\b(?:only|except):\s*(?:\[[^\]]*\]|%i\[[^\]]*\]|:[A-Za-z_][A-Za-z0-9_]*)/g, "");
  remaining = remaining.replace(/\b(?:controller|path|param):\s*(?:["'][^"']+["']|:[A-Za-z_][A-Za-z0-9_\/]*)/g, "");
  return /^[,\s]*$/.test(remaining);
}

function routesForResource(
  kind: RailsResourceKind,
  name: string,
  options: string,
  line: number,
  context: RouteContext,
  hasBlock: boolean,
): ResourceExpansion | null {
  if (!resourceOptionsSupported(options)) return null;

  const actions = selectedActions(kind, options);
  if (!actions) return null;

  const controllerOption = literalOption(options, "controller");
  const pathOption = literalOption(options, "path");
  const paramOption = literalOption(options, "param");
  if (controllerOption === null || pathOption === null || paramOption === null) return null;
  if (controllerOption?.startsWith("/")) return null;
  if (paramOption && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramOption)) return null;

  const localController = controllerOption
    ?? (kind === "resources" ? name : pluralizeResourceName(name));
  if (!localController) return null;

  const controller = joinController(context.controller_prefix, localController);
  const basePath = joinPath(context.path_prefix, pathOption ?? name);
  if (!basePath) return null;

  const param = paramOption ?? "id";
  const memberPath = kind === "resources" ? `${basePath}/:${param}` : basePath;
  const routes: RailsRouteDeclaration[] = [];

  const add = (action: string, verb: string, path: string): void => {
    if (actions.has(action)) routes.push({ verb, path, controller, action, line });
  };

  if (kind === "resources") add("index", "GET", basePath);
  add("create", "POST", basePath);
  add("new", "GET", `${basePath}/new`);
  add("show", "GET", memberPath);
  add("edit", "GET", `${memberPath}/edit`);
  add("update", "PATCH", memberPath);
  add("update", "PUT", memberPath);
  add("destroy", "DELETE", memberPath);

  if (!hasBlock) return { routes };

  if (kind === "resource") {
    return {
      routes,
      child_context: {
        supported: true,
        path_prefix: basePath,
        controller_prefix: context.controller_prefix,
      },
    };
  }

  const singular = singularizeResourceName(name);
  if (!singular) return { routes };
  return {
    routes,
    child_context: {
      supported: true,
      path_prefix: `${basePath}/:${singular}_${param}`,
      controller_prefix: context.controller_prefix,
    },
  };
}

function namespaceContext(current: RouteContext, name: string, options: string): RouteContext | null {
  if (options.trim().replace(/^,\s*/, "").length > 0) return null;
  const pathPrefix = joinPath(current.path_prefix, name);
  if (!pathPrefix) return null;
  return {
    supported: true,
    path_prefix: pathPrefix,
    controller_prefix: joinController(current.controller_prefix, name),
  };
}

function unsupportedContext(): RouteContext {
  return { supported: false, path_prefix: "", controller_prefix: "" };
}

function opensUnsupportedBlock(code: string): boolean {
  return /\bdo(?:\s*\|[^|]*\|)?\s*$/.test(code)
    || /^(?:if|unless|case|begin|for|while|until)\b/.test(code);
}

export function resourceRouteDeclarations(source: string): RailsRouteDeclaration[] {
  const results: RailsRouteDeclaration[] = [];
  const stack: RouteContext[] = [];
  const lines = source.split("\n");
  let inRoutes = false;

  for (let index = 0; index < lines.length; index += 1) {
    const code = stripRubyComment(lines[index]!).trim();
    if (!code) continue;
    const line = index + 1;

    if (!inRoutes) {
      if (/\.routes\.draw\s+do\s*$/.test(code)) {
        inRoutes = true;
        stack.push({ supported: true, path_prefix: "", controller_prefix: "" });
      }
      continue;
    }

    if (/^end\b/.test(code)) {
      stack.pop();
      if (stack.length === 0) inRoutes = false;
      continue;
    }

    const current = stack.at(-1) ?? unsupportedContext();
    const namespaceMatch = /^namespace\s+:([A-Za-z_][A-Za-z0-9_]*)(.*?)\s+do\s*$/.exec(code);
    if (namespaceMatch) {
      const next = current.supported
        ? namespaceContext(current, namespaceMatch[1]!, namespaceMatch[2] ?? "")
        : null;
      stack.push(next ?? unsupportedContext());
      continue;
    }

    const resourceMatch = /^(resources|resource)\s+:([A-Za-z_][A-Za-z0-9_]*)(.*)$/.exec(code);
    if (resourceMatch) {
      const kind = resourceMatch[1] as RailsResourceKind;
      const name = resourceMatch[2]!;
      const remainder = resourceMatch[3] ?? "";
      const hasBlock = /\bdo\s*$/.test(remainder);
      const options = hasBlock ? remainder.replace(/\bdo\s*$/, "").trim() : remainder.trim();
      const expansion = current.supported
        ? routesForResource(kind, name, options, line, current, hasBlock)
        : null;

      if (expansion) results.push(...expansion.routes);
      if (hasBlock) stack.push(expansion?.child_context ?? unsupportedContext());
      continue;
    }

    if (opensUnsupportedBlock(code)) stack.push(unsupportedContext());
  }

  return results;
}
