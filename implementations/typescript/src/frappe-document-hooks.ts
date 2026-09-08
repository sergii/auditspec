export interface FrappeDocumentMethod {
  name: string;
  qualified_name: string;
  line: number;
}

export interface FrappeDocumentHookDispatch {
  target_qualified_name: string;
  surface_kind: "frappe_document_hook";
  detail: string;
  line: number;
}

const FRAPPE_DOCUMENT_HOOKS = new Set([
  "before_insert",
  "before_naming",
  "autoname",
  "before_validate",
  "validate",
  "before_save",
  "before_submit",
  "before_cancel",
  "before_update_after_submit",
  "after_insert",
  "on_update",
  "on_submit",
  "on_cancel",
  "on_update_after_submit",
  "on_change",
  "before_rename",
  "after_rename",
  "on_trash",
  "after_delete",
]);

function conventionalDocTypeControllerPath(path: string): boolean {
  const match = /(?:^|\/)doctype\/([^/]+)\/([^/]+)\.py$/.exec(path);
  return Boolean(match && match[1] === match[2]);
}

function explicitDocumentClass(source: string): { name: string; line: number } | null {
  const matches = [...source.matchAll(
    /^\s*class\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*(?:Document|frappe\.model\.document\.Document)\s*\)\s*:\s*(?:#.*)?$/gm,
  )];
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const line = source.slice(0, match.index ?? 0).split("\n").length;
  return { name: match[1]!, line };
}

function containerForQualifiedName(qualifiedName: string): string | undefined {
  const parts = qualifiedName.split(".");
  return parts.length >= 2 ? parts.at(-2) : undefined;
}

export function frappeDocumentHookDispatches(
  source: string,
  path: string,
  methods: readonly FrappeDocumentMethod[],
): FrappeDocumentHookDispatch[] {
  if (!conventionalDocTypeControllerPath(path)) return [];

  const controller = explicitDocumentClass(source);
  if (!controller) return [];

  return methods
    .filter((method) => method.line > controller.line)
    .filter((method) => FRAPPE_DOCUMENT_HOOKS.has(method.name))
    .filter((method) => containerForQualifiedName(method.qualified_name) === controller.name)
    .map((method) => ({
      target_qualified_name: method.qualified_name,
      surface_kind: "frappe_document_hook" as const,
      detail: `DOCUMENT_HOOK ${method.name} -> ${method.qualified_name}`,
      line: method.line,
    }));
}
