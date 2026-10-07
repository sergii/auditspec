export interface Rfc8693VerificationContext {
  verified: boolean;
  issuer?: string;
  verifier?: string;
  key_id?: string;
  audience?: string | string[];
  observed_at?: string;
}

export interface Rfc8693PartyRef {
  subject: string;
  issuer?: string;
  source_path: string;
}

export interface Rfc8693ProjectionWarning {
  code: string;
  path: string;
  message: string;
}

export interface Rfc8693Projection {
  projection_version: "0.1";
  standard: "RFC8693";
  represented_subject?: Rfc8693PartyRef;
  current_actor?: Rfc8693PartyRef;
  prior_actors: Rfc8693PartyRef[];
  delegation: Array<{
    relationship: "delegated_by" | "on_behalf_of";
    principal: Rfc8693PartyRef;
  }>;
  authorization_context: {
    scopes: string[];
    audiences: string[];
    authorized_actor?: Rfc8693PartyRef;
  };
  token_context: { issuer?: string; client_id?: string };
  verification: {
    status: "verified" | "unverified";
    issuer?: string;
    verifier?: string;
    key_id?: string;
    audience: string[];
    observed_at?: string;
  };
  unmapped_claims: string[];
  unmapped_actor_claims: string[];
  unmapped_authorized_actor_claims: string[];
  warnings: Rfc8693ProjectionWarning[];
}

const known = new Set(["iss", "sub", "aud", "exp", "nbf", "iat", "jti", "scope", "client_id", "act", "may_act"]);
const nonIdentity = new Set(["exp", "nbf", "aud"]);
const maxDepth = 16;

function obj(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function party(
  value: Record<string, unknown>,
  path: string,
  kind: "act" | "may_act",
  unmapped: Set<string>,
  warnings: Rfc8693ProjectionWarning[],
): Rfc8693PartyRef | undefined {
  for (const key of Object.keys(value)) {
    if (key === "sub" || key === "iss" || (kind === "act" && key === "act")) continue;
    if (nonIdentity.has(key)) {
      warnings.push({
        code: `non_identity_claim_in_${kind}`,
        path: `${path}.${key}`,
        message: `${key} is not meaningful as nested ${kind} identity under RFC 8693.`,
      });
    } else {
      unmapped.add(`${path}.${key}`);
    }
  }

  const subject = str(value.sub);
  if (!subject) {
    warnings.push({
      code: kind === "act" ? "unsupported_actor_identity" : "unsupported_authorized_actor_identity",
      path,
      message: `${kind} has no non-empty sub; AuditSpec does not guess identity from other claims.`,
    });
    return undefined;
  }

  const issuer = str(value.iss);
  return { subject, ...(issuer ? { issuer } : {}), source_path: `${path}.sub` };
}

function actorChain(
  value: unknown,
  warnings: Rfc8693ProjectionWarning[],
  unmapped: Set<string>,
): { current?: Rfc8693PartyRef; prior: Rfc8693PartyRef[] } {
  if (value === undefined) return { prior: [] };
  if (!obj(value)) {
    warnings.push({ code: "malformed_act", path: "act", message: "act must be a JSON object." });
    return { prior: [] };
  }

  const seen = new Set<object>();
  let currentActor: Rfc8693PartyRef | undefined;
  const prior: Rfc8693PartyRef[] = [];
  let node: Record<string, unknown> | undefined = value;
  let path = "act";
  let depth = 0;

  while (node) {
    if (seen.has(node)) {
      warnings.push({ code: "actor_chain_cycle", path, message: "Cyclic act chain rejected." });
      break;
    }
    if (depth >= maxDepth) {
      warnings.push({ code: "actor_chain_truncated", path, message: "act chain exceeds depth 16." });
      break;
    }
    seen.add(node);

    const mapped = party(node, path, "act", unmapped, warnings);
    if (depth === 0) currentActor = mapped;
    else if (mapped) prior.push(mapped);

    if (node.act === undefined) break;
    if (!obj(node.act)) {
      warnings.push({ code: "malformed_act", path: `${path}.act`, message: "nested act must be a JSON object." });
      break;
    }
    node = node.act;
    path = `${path}.act`;
    depth += 1;
  }

  return { ...(currentActor ? { current: currentActor } : {}), prior };
}

function scopes(value: unknown, warnings: Rfc8693ProjectionWarning[]): string[] {
  if (value === undefined) return [];
  if (typeof value !== "string") {
    warnings.push({ code: "malformed_scope", path: "scope", message: "scope must be a space-delimited string." });
    return [];
  }
  return [...new Set(value.split(/\s+/u).filter(Boolean))];
}

function audiences(value: unknown, warnings: Rfc8693ProjectionWarning[]): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return value ? [value] : [];
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0)) {
    return [...new Set(value)];
  }
  warnings.push({ code: "malformed_audience", path: "aud", message: "aud must be a string or string array." });
  return [];
}

export function mapRfc8693Claims(input: {
  claims: Record<string, unknown>;
  verification: Rfc8693VerificationContext;
}): Rfc8693Projection {
  const { claims, verification } = input;
  const warnings: Rfc8693ProjectionWarning[] = [];
  const actorUnmapped = new Set<string>();
  const mayActUnmapped = new Set<string>();

  if (!verification.verified) {
    warnings.push({
      code: "unverified_claims",
      path: "",
      message: "Projection preserves unverified claim semantics without upgrading them to trusted evidence.",
    });
  }

  const issuer = str(claims.iss);
  if (verification.verified && issuer && verification.issuer && issuer !== verification.issuer) {
    warnings.push({ code: "issuer_mismatch", path: "iss", message: "verified issuer differs from iss." });
  }

  const subjectValue = str(claims.sub);
  const represented = subjectValue ? { subject: subjectValue, source_path: "sub" } : undefined;
  const chain = actorChain(claims.act, warnings, actorUnmapped);

  let authorized: Rfc8693PartyRef | undefined;
  if (claims.may_act !== undefined) {
    if (obj(claims.may_act)) authorized = party(claims.may_act, "may_act", "may_act", mayActUnmapped, warnings);
    else warnings.push({ code: "malformed_may_act", path: "may_act", message: "may_act must be a JSON object." });
  }

  const delegation: Rfc8693Projection["delegation"] = [];
  if (chain.current) {
    for (const prior of chain.prior) delegation.push({ relationship: "delegated_by", principal: prior });
    if (represented) delegation.push({ relationship: "on_behalf_of", principal: represented });
  }

  const verifyAudience = verification.audience === undefined
    ? []
    : Array.isArray(verification.audience)
      ? [...new Set(verification.audience)]
      : [verification.audience];

  const clientId = str(claims.client_id);
  return {
    projection_version: "0.1",
    standard: "RFC8693",
    ...(represented ? { represented_subject: represented } : {}),
    ...(chain.current ? { current_actor: chain.current } : {}),
    prior_actors: chain.prior,
    delegation,
    authorization_context: {
      scopes: scopes(claims.scope, warnings),
      audiences: audiences(claims.aud, warnings),
      ...(authorized ? { authorized_actor: authorized } : {}),
    },
    token_context: { ...(issuer ? { issuer } : {}), ...(clientId ? { client_id: clientId } : {}) },
    verification: {
      status: verification.verified ? "verified" : "unverified",
      ...(verification.issuer ? { issuer: verification.issuer } : {}),
      ...(verification.verifier ? { verifier: verification.verifier } : {}),
      ...(verification.key_id ? { key_id: verification.key_id } : {}),
      audience: verifyAudience,
      ...(verification.observed_at ? { observed_at: verification.observed_at } : {}),
    },
    unmapped_claims: Object.keys(claims).filter((key) => !known.has(key)).sort(),
    unmapped_actor_claims: [...actorUnmapped].sort(),
    unmapped_authorized_actor_claims: [...mayActUnmapped].sort(),
    warnings,
  };
}
