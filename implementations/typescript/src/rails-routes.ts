export interface RailsRouteDeclaration {
  verb: string;
  path: string;
  controller: string;
  action: string;
  line: number;
}

type RailsResourceKind = "resources" | "resource";

const PLURAL_ACTIONS = ["index", "create", "new", "show", "edit", "update", "destroy"] as const;
const SINGULAR_ACTIONS = ["create", "new", "show", "edit", "update", "destroy"] as const;
const IRREGULAR_SINGULAR_NAMES = new Set([
  "child",
  "foot",
  "goose",
  "man",
  "mouse",
  "ox",
  "person",
  "tooth",
  "woman",
]);

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function routeDslDepthByLine(source: string): Map<number, number> {
  const depths = new Map<number, number>();
  const lines = source.split("\n");
  let active = false;
  let depth = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const code = line.replace(/#.*$/, "");

    if (!active) {
      if (/\.routes\.draw\s+do\b/.test(code)) {
        active = true;
        depth = 1;
      }
      continue;
    }

    depths.set(index + 1, depth);

    if (/^\s*end\b/.test(code)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        active = false;
        continue;
      }
    }

    depth += (code.match(/\bdo\b/g) ?? []).length;
  }

  return depths;
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
  const match = new RegExp(`\\b${key}:\\s*(?:["']([^"']+)["']|:([A-Za-z_][A-Za-z0-9_\\/]*) )`.replace("*) )", "*))")).exec(options);
  if (!match) {
    const corrected = new RegExp(`\\b${key}:\\s*(?:["']([^"']+)["']|:([A-Za-z_][A-Za-z0-9_\\/]*))`).exec(options);
    return corrected ? (corrected[1] ?? corrected[2]!) : null;
  }
  return match[1] ?? match[2]!;
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

function defaultSingularController(name: string): string | undefined {
  const finalSegment = name.split("_").at(-1) ?? name;
  if (IRREGULAR_SINGULAR_NAMES.has(finalSegment)) return undefined;
  if (/(?:s|x|z|ch|sh|[^aeiou]y)$/i.test(finalSegment)) return undefined;
  return `${name}s`;
}

function normalizedBasePath(value: string): string | undefined {
  const normalized = value.replace(/^\/+|\/+$/g, "");
  return normalized ? `/${normalized}` : undefined;
}

function routesForResource(
  kind: RailsResourceKind,
  name: string,
  options: string,
  line: number,
): RailsRouteDeclaration[] {
  if (/\b(?:module|path_names):/.test(options)) return [];

  const actions = selectedActions(kind, options);
  if (!actions) return [];

  const controllerOption = literalOption(options, "controller");
  const pathOption = literalOption(options, "path");
  const paramOption = literalOption(options, "param");
  if (controllerOption === null || pathOption === null || paramOption === null) return [];

  const controller = controllerOption
    ?? (kind === "resources" ? name : defaultSingularController(name));
  if (!controller) return [];

  const basePath = normalizedBasePath(pathOption ?? name);
  if (!basePath) return [];
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

  return routes;
}

export function resourceRouteDeclarations(source: string): RailsRouteDeclaration[] {
  const results: RailsRouteDeclaration[] = [];
  const depths = routeDslDepthByLine(source);
  const pattern = /^\s*(resources|resource)\s+:([A-Za-z_][A-Za-z0-9_]*)([^\n]*)$/gm;

  for (const match of source.matchAll(pattern)) {
    const line = lineAt(source, match.index ?? 0);
    if (depths.get(line) !== 1) continue;
    results.push(...routesForResource(match[1] as RailsResourceKind, match[2]!, match[3] ?? "", line));
  }

  return results;
}
