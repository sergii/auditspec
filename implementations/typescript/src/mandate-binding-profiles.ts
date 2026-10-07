import {
  createHash,
  timingSafeEqual,
  verify as verifyBytes,
} from "node:crypto";
import {
  canonicalizeForMandateProof,
  digestForMandateProof,
} from "./mandate-proof.js";
import type {
  HumanMandate,
  MandateConstraint,
  MandatedAction,
  MandateVerificationContext,
} from "./human-mandate.js";

type JsonPrimitive = string | number | boolean | null;

export interface CompactArtifactVerification {
  signature_verified: boolean;
  header_valid: boolean;
  payload_valid: boolean;
  header?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  warnings: string[];
}

export interface MandateBindingProjection {
  profile_version: "0.1";
  source:
    | "draft-kroehl-agentic-trust-aae-02"
    | "draft-williams-intent-token-02";
  status: "ready" | "source_denied" | "source_pending" | "unverifiable";
  mandate?: HumanMandate;
  action?: MandatedAction;
  verification: MandateVerificationContext;
  source_checks: Record<string, boolean>;
  unmapped: string[];
  warnings: string[];
}

export interface AaeTrustContext {
  issuer_did_key_binding_verified: boolean;
  issuer_authorized_for_principal: boolean;
  subject_binding_verified: boolean;
  revocation_status: "not_revoked" | "revoked" | "unknown";
  single_use_verified: boolean;
  delegation_chain_verified: boolean;
  verifier?: string;
}

export interface IntentTokenTrustContext {
  signer_authorized_for_principal: boolean;
  delegation_chain_verified: boolean;
  jti_unique_verified: boolean;
  ibt_level_chain_verified: boolean;
  before_action_binding_verified: boolean;
  verifier?: string;
}

export interface IntentBoundMapping {
  path: string;
  operator: "equals" | "one_of" | "number_lte" | "number_gte";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseBase64UrlJson(segment: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function compactParts(compact: string): [string, string, string] | undefined {
  const parts = compact.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) return undefined;
  return [parts[0]!, parts[1]!, parts[2]!];
}

export function verifyAaeCompactJws(input: {
  compact: string;
  issuer_public_key_pem: string;
}): CompactArtifactVerification {
  const warnings: string[] = [];
  const parts = compactParts(input.compact);
  if (!parts) {
    return {
      signature_verified: false,
      header_valid: false,
      payload_valid: false,
      warnings: ["AAE must be a three-part JWS compact serialization."],
    };
  }

  const [protectedHeader, payloadSegment, signatureSegment] = parts;
  const header = parseBase64UrlJson(protectedHeader);
  const payload = parseBase64UrlJson(payloadSegment);

  const headerValid =
    header?.alg === "EdDSA" &&
    header?.cty === "aae+json" &&
    typeof header?.kid === "string" &&
    header.kid.length > 0;

  if (!headerValid) {
    warnings.push("AAE protected header must use alg=EdDSA, cty=aae+json, and a non-empty kid.");
  }

  const payloadValid =
    isRecord(payload) &&
    typeof payload.id === "string" &&
    typeof payload.issuer === "string" &&
    isRecord(payload.credentialSubject) &&
    typeof payload.credentialSubject.id === "string" &&
    isRecord(payload.credentialSubject.aae) &&
    isRecord(payload.credentialSubject.aae.mandate) &&
    isRecord(payload.credentialSubject.aae.constraints) &&
    isRecord(payload.credentialSubject.aae.validity);

  if (!payloadValid) {
    warnings.push("AAE JWS payload is missing the required Verifiable Credential structure.");
  }

  let signatureVerified = false;
  if (headerValid && payloadValid) {
    try {
      signatureVerified = verifyBytes(
        null,
        Buffer.from(`${protectedHeader}.${payloadSegment}`, "ascii"),
        input.issuer_public_key_pem,
        Buffer.from(signatureSegment, "base64url"),
      );
    } catch {
      signatureVerified = false;
    }
  }

  return {
    signature_verified: signatureVerified,
    header_valid: headerValid,
    payload_valid: payloadValid,
    ...(header ? { header } : {}),
    ...(payload ? { payload } : {}),
    warnings,
  };
}

export function verifyIntentTokenCompactJwt(input: {
  compact: string;
  signer_public_key_pem: string;
}): CompactArtifactVerification {
  const warnings: string[] = [];
  const parts = compactParts(input.compact);
  if (!parts) {
    return {
      signature_verified: false,
      header_valid: false,
      payload_valid: false,
      warnings: ["Intent Token must be a three-part JWT compact serialization."],
    };
  }

  const [protectedHeader, payloadSegment, signatureSegment] = parts;
  const header = parseBase64UrlJson(protectedHeader);
  const payload = parseBase64UrlJson(payloadSegment);

  const headerValid =
    header?.alg === "ES256" &&
    header?.typ === "intent+jwt";

  if (!headerValid) {
    warnings.push("Intent Token protected header must use alg=ES256 and typ=intent+jwt.");
  }

  const payloadValid =
    isRecord(payload) &&
    typeof payload.iss === "string" &&
    typeof payload.sub === "string" &&
    payload.aud !== undefined &&
    typeof payload.exp === "number" &&
    typeof payload.iat === "number" &&
    typeof payload.jti === "string" &&
    payload.ibt_ver === "1.1" &&
    typeof payload.ibt_level === "string" &&
    isRecord(payload.principal) &&
    typeof payload.principal.id === "string" &&
    isRecord(payload.declared_intent) &&
    typeof payload.declared_intent.action_class === "string" &&
    typeof payload.declared_intent.scope === "string" &&
    isRecord(payload.shard) &&
    typeof payload.shard.id === "string" &&
    typeof payload.shard.issued_at === "number" &&
    typeof payload.shard.expires_at === "number" &&
    typeof payload.shard.window_seconds === "number" &&
    isRecord(payload.enforcement) &&
    payload.enforcement.snap_back === true &&
    typeof payload.enforcement.audit_chain === "string" &&
    typeof payload.enforcement.auth_mode === "string" &&
    (
      (payload.ibt_level !== "agent" && payload.ibt_level !== "cluster") ||
      (typeof payload.parent_token_jti === "string" && payload.parent_token_jti.length > 0)
    );

  if (!payloadValid) {
    warnings.push("Intent Token payload is missing one or more required -02 claims.");
  }

  let signatureVerified = false;
  if (headerValid && payloadValid) {
    try {
      signatureVerified = verifyBytes(
        "sha256",
        Buffer.from(`${protectedHeader}.${payloadSegment}`, "ascii"),
        {
          key: input.signer_public_key_pem,
          dsaEncoding: "ieee-p1363",
        },
        Buffer.from(signatureSegment, "base64url"),
      );
    } catch {
      signatureVerified = false;
    }
  }

  return {
    signature_verified: signatureVerified,
    header_valid: headerValid,
    payload_valid: payloadValid,
    ...(header ? { header } : {}),
    ...(payload ? { payload } : {}),
    warnings,
  };
}

export function computeAaeActionBinding(action: unknown): string {
  const tag = Buffer.concat([
    Buffer.from("aae:enforce-action:v1", "ascii"),
    Buffer.from([0]),
  ]);
  const canonical = Buffer.from(canonicalizeForMandateProof(action), "utf8");
  const digest = createHash("sha256")
    .update(Buffer.concat([tag, canonical]))
    .digest("hex");
  return `sha256:${digest}`;
}

function equalDigest(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function operationPath(field: string): string {
  return field === "verb" ? "operation" : `parameters.${field}`;
}

function primitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function aaeGrantConstraints(
  value: unknown,
  warnings: string[],
): MandateConstraint[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const constraints: MandateConstraint[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) return undefined;

    const type = asString(item.type);
    const field = asString(item.field);
    if (!type || !field) return undefined;
    const path = operationPath(field);

    if (type === "exact" && primitive(item.value)) {
      constraints.push({
        id: `aae.grant.${index}.exact.${field}`,
        class: "hard",
        path,
        operator: "equals",
        value: item.value,
      });
      continue;
    }

    if (type === "enum" && Array.isArray(item.values) && item.values.every(primitive)) {
      constraints.push({
        id: `aae.grant.${index}.enum.${field}`,
        class: "hard",
        path,
        operator: "one_of",
        values: item.values,
      });
      continue;
    }

    if (type === "range") {
      const lo = asFiniteNumber(item.lo);
      const hi = asFiniteNumber(item.hi);
      if (lo === undefined || hi === undefined) return undefined;
      constraints.push(
        {
          id: `aae.grant.${index}.range.lo.${field}`,
          class: "hard",
          path,
          operator: "number_gte",
          value: lo,
        },
        {
          id: `aae.grant.${index}.range.hi.${field}`,
          class: "hard",
          path,
          operator: "number_lte",
          value: hi,
        },
      );
      continue;
    }

    warnings.push(`Unsupported AAE grant constraint at index ${index}.`);
    return undefined;
  }

  return constraints;
}

function actionFromAae(
  sourceAction: unknown,
  agentId: string,
  occurredAt: string,
): MandatedAction | undefined {
  if (!isRecord(sourceAction)) return undefined;
  const verb = asString(sourceAction.verb);
  if (!verb) return undefined;

  const parameters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sourceAction)) {
    if (key !== "verb") parameters[key] = value;
  }

  return {
    actor: { id: agentId },
    operation: verb,
    parameters,
    occurred_at: occurredAt,
  };
}

function mapAaeGlobalConstraints(input: {
  constraints: Record<string, unknown>;
  source_action: Record<string, unknown>;
  warnings: string[];
  unmapped: string[];
}): MandateConstraint[] | undefined {
  const result: MandateConstraint[] = [];

  for (const [name, raw] of Object.entries(input.constraints)) {
    if (!isRecord(raw)) {
      input.unmapped.push(`constraints.${name}`);
      return undefined;
    }

    const required = raw.required === undefined ? true : raw.required === true;

    if (name === "max_transaction_value") {
      const value = asFiniteNumber(raw.value);
      const currency = asString(raw.currency);
      if (value === undefined || !currency) {
        input.unmapped.push(`constraints.${name}`);
        return undefined;
      }

      if (
        typeof input.source_action.amount !== "number" ||
        typeof input.source_action.currency !== "string"
      ) {
        if (required) {
          input.unmapped.push(`constraints.${name}`);
          return undefined;
        }
        input.warnings.push(
          "Optional max_transaction_value could not be mapped because the action lacks numeric amount and string currency.",
        );
        continue;
      }

      result.push(
        {
          id: "aae.global.max_transaction_value.amount",
          class: "hard",
          path: "parameters.amount",
          operator: "number_lte",
          value,
        },
        {
          id: "aae.global.max_transaction_value.currency",
          class: "hard",
          path: "parameters.currency",
          operator: "equals",
          value: currency,
        },
      );
      continue;
    }

    if (name === "allowed_domains") {
      if (
        !Array.isArray(raw.value) ||
        !raw.value.every((item) => typeof item === "string") ||
        typeof input.source_action.domain !== "string"
      ) {
        if (required) {
          input.unmapped.push(`constraints.${name}`);
          return undefined;
        }
        input.warnings.push(
          "Optional allowed_domains could not be mapped to parameters.domain.",
        );
        continue;
      }

      result.push({
        id: "aae.global.allowed_domains",
        class: "hard",
        path: "parameters.domain",
        operator: "one_of",
        values: raw.value,
      });
      continue;
    }

    if (required) {
      input.unmapped.push(`constraints.${name}`);
      return undefined;
    }

    input.warnings.push(
      `Optional AAE constraint ${name} is not projected into HumanMandate.`,
    );
    input.unmapped.push(`constraints.${name}`);
  }

  return result;
}

export function projectAaeMandateBinding(input: {
  compact: string;
  issuer_public_key_pem: string;
  source_action: unknown;
  occurred_at: string;
  trust: AaeTrustContext;
}): MandateBindingProjection {
  const artifact = verifyAaeCompactJws({
    compact: input.compact,
    issuer_public_key_pem: input.issuer_public_key_pem,
  });
  const warnings = [...artifact.warnings];
  const unmapped: string[] = [];
  const falseVerification: MandateVerificationContext = {
    mandate_signature_verified: false,
    action_binding_verified: false,
    ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
  };

  if (!artifact.payload_valid || !artifact.payload) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: {
        jws_signature_verified: artifact.signature_verified,
      },
      unmapped,
      warnings,
    };
  }

  const payload = artifact.payload;
  const credentialSubject = payload.credentialSubject;
  if (!isRecord(credentialSubject) || !isRecord(credentialSubject.aae)) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jws_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [...warnings, "AAE credentialSubject.aae is not an object."],
    };
  }

  const agentId = asString(credentialSubject.id);
  const aae = credentialSubject.aae;
  const mandateSource = aae.mandate;
  const globalConstraints = aae.constraints;
  const validity = aae.validity;

  if (
    !agentId ||
    !isRecord(mandateSource) ||
    !isRecord(globalConstraints) ||
    !isRecord(validity)
  ) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jws_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [...warnings, "AAE mandate, constraints, validity, or subject identity is malformed."],
    };
  }

  const principalId = asString(mandateSource.principal_did);
  const actions =
    Array.isArray(mandateSource.actions) &&
    mandateSource.actions.length > 0 &&
    mandateSource.actions.every((item) => typeof item === "string" && item.length > 0)
      ? mandateSource.actions
      : undefined;
  const notBefore = asString(validity.not_before);
  const notAfter = asString(validity.not_after);
  const action = actionFromAae(input.source_action, agentId, input.occurred_at);

  if (!principalId || !actions || !notBefore || !notAfter || !action || !isRecord(input.source_action)) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jws_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [
        ...warnings,
        "AAE projection requires principal_did, actions, validity bounds, and an object action with a string verb.",
      ],
    };
  }

  const sourceChecks: Record<string, boolean> = {
    jws_signature_verified: artifact.signature_verified,
    issuer_did_key_binding_verified: input.trust.issuer_did_key_binding_verified,
    issuer_authorized_for_principal: input.trust.issuer_authorized_for_principal,
    subject_binding_verified: input.trust.subject_binding_verified,
    revocation_not_revoked: input.trust.revocation_status === "not_revoked",
    single_use_verified: input.trust.single_use_verified,
    delegation_chain_verified: input.trust.delegation_chain_verified,
  };

  const artifactAccepted = Object.values(sourceChecks).every(Boolean);

  const constraints: MandateConstraint[] = [
    {
      id: "aae.mandate.actions",
      class: "hard",
      path: "operation",
      operator: "one_of",
      values: actions,
    },
  ];

  const mappedGlobal = mapAaeGlobalConstraints({
    constraints: globalConstraints,
    source_action: input.source_action,
    warnings,
    unmapped,
  });

  if (!mappedGlobal) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: false,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: sourceChecks,
      unmapped,
      warnings: [
        ...warnings,
        "One or more required AAE global constraints cannot be represented without semantic loss.",
      ],
    };
  }
  constraints.push(...mappedGlobal);

  if (!Array.isArray(mandateSource.grants)) {
    warnings.push(
      "AAE contains no grants; mandate.actions alone is not treated as an exact concrete-action binding.",
    );
    const mandate: HumanMandate = {
      mandate_version: "0.1",
      id: asString(payload.id) ?? "unidentified-aae",
      principal: { id: principalId },
      agent: { id: agentId },
      issued_at: asString(payload.validFrom) ?? notBefore,
      valid_from: notBefore,
      expires_at: notAfter,
      constraints,
    };
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      mandate,
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: false,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: sourceChecks,
      unmapped,
      warnings,
    };
  }

  const actionKeys = Object.keys(input.source_action).sort();
  const binding = computeAaeActionBinding(input.source_action);
  const matched: Array<Record<string, unknown>> = [];

  for (const grant of mandateSource.grants) {
    if (!isRecord(grant)) continue;
    const typeFields =
      Array.isArray(grant.type_fields) &&
      grant.type_fields.every((item) => typeof item === "string")
        ? [...grant.type_fields].sort()
        : undefined;
    const grantBinding = asString(grant.action_binding);
    if (
      typeFields &&
      typeFields.length === actionKeys.length &&
      typeFields.every((value, index) => value === actionKeys[index]) &&
      grantBinding &&
      equalDigest(grantBinding, binding)
    ) {
      matched.push(grant);
    }
  }

  if (matched.length === 0) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "source_denied",
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: false,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: {
        ...sourceChecks,
        action_binding_matched: false,
      },
      unmapped,
      warnings: [...warnings, "No AAE grant matches the exact action type and action binding."],
    };
  }

  if (matched.some((grant) => grant.disposition === "forbid")) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "source_denied",
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: true,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: {
        ...sourceChecks,
        action_binding_matched: true,
      },
      unmapped,
      warnings: [...warnings, "A matching AAE forbid grant takes precedence and is not projected as positive HumanMandate authority."],
    };
  }

  const firstNonForbid = matched.find(
    (grant) => grant.disposition === "allow" || grant.disposition === "hold",
  );
  if (!firstNonForbid) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      action,
      verification: falseVerification,
      source_checks: sourceChecks,
      unmapped,
      warnings: [...warnings, "Matched AAE grant has an unsupported disposition."],
    };
  }

  if (firstNonForbid.disposition === "hold") {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "source_pending",
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: true,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: {
        ...sourceChecks,
        action_binding_matched: true,
      },
      unmapped,
      warnings: [...warnings, "AAE hold is pending source-protocol authorization and is not converted into HumanMandate permission."],
    };
  }

  const grantConstraints = aaeGrantConstraints(firstNonForbid.constraints, warnings);
  if (!grantConstraints) {
    return {
      profile_version: "0.1",
      source: "draft-kroehl-agentic-trust-aae-02",
      status: "unverifiable",
      action,
      verification: {
        mandate_signature_verified: artifactAccepted,
        action_binding_verified: false,
        ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
        mandate_digest: digestForMandateProof(payload),
        action_digest: digestForMandateProof(input.source_action),
      },
      source_checks: {
        ...sourceChecks,
        action_binding_matched: true,
      },
      unmapped,
      warnings: [...warnings, "AAE grant constraints cannot be represented losslessly."],
    };
  }

  constraints.push(...grantConstraints);

  const mandate: HumanMandate = {
    mandate_version: "0.1",
    id: asString(payload.id) ?? "unidentified-aae",
    principal: { id: principalId },
    agent: { id: agentId },
    issued_at: asString(payload.validFrom) ?? notBefore,
    valid_from: notBefore,
    expires_at: notAfter,
    constraints,
  };

  return {
    profile_version: "0.1",
    source: "draft-kroehl-agentic-trust-aae-02",
    status: artifactAccepted ? "ready" : "unverifiable",
    mandate,
    action,
    verification: {
      mandate_signature_verified: artifactAccepted,
      action_binding_verified: true,
      ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
      mandate_digest: digestForMandateProof(payload),
      action_digest: digestForMandateProof(input.source_action),
    },
    source_checks: {
      ...sourceChecks,
      action_binding_matched: true,
    },
    unmapped,
    warnings,
  };
}

function epochToIso(value: number): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  const date = new Date(value * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function mapIntentBound(
  key: string,
  value: unknown,
  mapping: IntentBoundMapping,
): MandateConstraint | undefined {
  const id = `intent.declared_intent.bounds.${key}`;

  if (mapping.operator === "equals" && primitive(value)) {
    return {
      id,
      class: "hard",
      path: mapping.path,
      operator: "equals",
      value,
    };
  }

  if (
    mapping.operator === "one_of" &&
    Array.isArray(value) &&
    value.every(primitive)
  ) {
    return {
      id,
      class: "hard",
      path: mapping.path,
      operator: "one_of",
      values: value,
    };
  }

  if (
    (mapping.operator === "number_lte" ||
      mapping.operator === "number_gte") &&
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return {
      id,
      class: "hard",
      path: mapping.path,
      operator: mapping.operator,
      value,
    };
  }

  return undefined;
}

export function projectIntentTokenMandateBinding(input: {
  compact: string;
  signer_public_key_pem: string;
  action: MandatedAction;
  trust: IntentTokenTrustContext;
  scope_path?: string;
  bound_mappings?: Record<string, IntentBoundMapping>;
}): MandateBindingProjection {
  const artifact = verifyIntentTokenCompactJwt({
    compact: input.compact,
    signer_public_key_pem: input.signer_public_key_pem,
  });
  const warnings = [...artifact.warnings];
  const unmapped: string[] = [];
  const falseVerification: MandateVerificationContext = {
    mandate_signature_verified: false,
    action_binding_verified: false,
    ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
  };

  if (!artifact.payload_valid || !artifact.payload) {
    return {
      profile_version: "0.1",
      source: "draft-williams-intent-token-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: {
        jwt_signature_verified: artifact.signature_verified,
      },
      unmapped,
      warnings,
    };
  }

  const payload = artifact.payload;
  const principal = payload.principal;
  const declared = payload.declared_intent;
  const shard = payload.shard;
  if (!isRecord(principal) || !isRecord(declared) || !isRecord(shard)) {
    return {
      profile_version: "0.1",
      source: "draft-williams-intent-token-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jwt_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [...warnings, "Intent Token principal, declared_intent, or shard is malformed."],
    };
  }

  const principalId = asString(principal.id);
  const agentId = asString(payload.sub);
  const actionClass = asString(declared.action_class);
  const scope = asString(declared.scope);
  const issuedAt = asFiniteNumber(payload.iat);
  const expiresAt = asFiniteNumber(payload.exp);
  const shardIssuedAt = asFiniteNumber(shard.issued_at);
  const shardExpiresAt = asFiniteNumber(shard.expires_at);

  if (
    !principalId ||
    !agentId ||
    !actionClass ||
    !scope ||
    issuedAt === undefined ||
    expiresAt === undefined ||
    shardIssuedAt === undefined ||
    shardExpiresAt === undefined
  ) {
    return {
      profile_version: "0.1",
      source: "draft-williams-intent-token-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jwt_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [...warnings, "Intent Token required identity, intent, or temporal claims are malformed."],
    };
  }

  const constraints: MandateConstraint[] = [
    {
      id: "intent.declared_intent.action_class",
      class: "hard",
      path: "operation",
      operator: "equals",
      value: actionClass,
    },
  ];

  if (input.scope_path) {
    constraints.push({
      id: "intent.declared_intent.scope",
      class: "hard",
      path: input.scope_path,
      operator: "equals",
      value: scope,
    });
  } else {
    unmapped.push("declared_intent.scope");
  }

  if (declared.bounds !== undefined) {
    if (!isRecord(declared.bounds)) {
      unmapped.push("declared_intent.bounds");
    } else {
      for (const [key, value] of Object.entries(declared.bounds)) {
        const mapping = input.bound_mappings?.[key];
        if (!mapping) {
          unmapped.push(`declared_intent.bounds.${key}`);
          continue;
        }
        const mapped = mapIntentBound(key, value, mapping);
        if (!mapped) {
          unmapped.push(`declared_intent.bounds.${key}`);
          continue;
        }
        constraints.push(mapped);
      }
    }
  }

  const validFrom = epochToIso(Math.max(issuedAt, shardIssuedAt));
  const expiry = epochToIso(Math.min(expiresAt, shardExpiresAt));
  const issuedAtIso = epochToIso(issuedAt);

  if (!validFrom || !expiry || !issuedAtIso) {
    return {
      profile_version: "0.1",
      source: "draft-williams-intent-token-02",
      status: "unverifiable",
      verification: falseVerification,
      source_checks: { jwt_signature_verified: artifact.signature_verified },
      unmapped,
      warnings: [...warnings, "Intent Token timestamps cannot be represented as date-time values."],
    };
  }

  const sourceChecks: Record<string, boolean> = {
    jwt_signature_verified: artifact.signature_verified,
    signer_authorized_for_principal: input.trust.signer_authorized_for_principal,
    delegation_chain_verified: input.trust.delegation_chain_verified,
    jti_unique_verified: input.trust.jti_unique_verified,
    ibt_level_chain_verified: input.trust.ibt_level_chain_verified,
    before_action_binding_verified: input.trust.before_action_binding_verified,
  };

  const signatureAccepted =
    artifact.signature_verified &&
    input.trust.signer_authorized_for_principal;

  const actionBindingAccepted =
    input.trust.before_action_binding_verified &&
    input.trust.delegation_chain_verified &&
    input.trust.jti_unique_verified &&
    input.trust.ibt_level_chain_verified &&
    unmapped.length === 0;

  if (unmapped.length > 0) {
    warnings.push(
      "Intent Token scope or bounds remain unmapped; dropping them would broaden the human mandate, so the projection fails closed.",
    );
  }

  const mandate: HumanMandate = {
    mandate_version: "0.1",
    id: asString(payload.jti) ?? "unidentified-intent-token",
    principal: { id: principalId },
    agent: { id: agentId },
    issued_at: issuedAtIso,
    valid_from: validFrom,
    expires_at: expiry,
    constraints,
  };

  return {
    profile_version: "0.1",
    source: "draft-williams-intent-token-02",
    status:
      signatureAccepted && actionBindingAccepted ? "ready" : "unverifiable",
    mandate,
    action: input.action,
    verification: {
      mandate_signature_verified: signatureAccepted,
      action_binding_verified: actionBindingAccepted,
      ...(input.trust.verifier ? { verifier: input.trust.verifier } : {}),
      mandate_digest: digestForMandateProof(payload),
      action_digest: digestForMandateProof(input.action),
    },
    source_checks: sourceChecks,
    unmapped,
    warnings,
  };
}
