export type HttpRequestEvidenceStandard = "RFC9421" | "RFC9449";
export type HttpRequestEvidenceKind = "http_message_signature" | "oauth_dpop_proof";
export type HttpRequestEvidenceVerificationStatus = "verified" | "unverified";

export type RequestEvidenceNonProof =
  | "actor_identity"
  | "represented_principal"
  | "delegation"
  | "authorization_decision"
  | "human_intent_or_consent"
  | "business_execution";

export interface HttpRequestEvidenceWarning {
  code: string;
  message: string;
}

export interface HttpRequestEvidenceProjection {
  projection_version: "0.1";
  standard: HttpRequestEvidenceStandard;
  kind: HttpRequestEvidenceKind;
  verification: {
    status: HttpRequestEvidenceVerificationStatus;
    verifier?: string;
    observed_at?: string;
    cryptographic_signature_verified: boolean;
    application_profile_satisfied?: boolean;
    verifier_accepted?: boolean;
  };
  key_context: {
    key_id?: string;
    algorithm?: string;
    public_key_thumbprint?: string;
  };
  signature_context?: {
    label?: string;
    covered_components: string[];
    created?: number;
    expires?: number;
    nonce_present: boolean;
    tag?: string;
  };
  request_binding: {
    method_covered?: boolean;
    target_covered?: boolean;
    content_digest_covered?: boolean;
    method_verified?: boolean;
    target_uri_verified?: boolean;
    access_token_hash_verified?: boolean;
    token_key_binding_verified?: boolean;
  };
  replay_context: {
    proof_id?: string;
    nonce_required?: boolean;
    nonce_verified?: boolean;
    freshness_verified?: boolean;
  };
  does_not_prove: RequestEvidenceNonProof[];
  warnings: HttpRequestEvidenceWarning[];
}

export interface Rfc9421VerificationInput {
  signature_verified: boolean;
  application_profile_satisfied: boolean;
  covered_components: string[];
  signature_label?: string;
  verifier?: string;
  observed_at?: string;
  parameters?: {
    created?: number;
    expires?: number;
    nonce?: string;
    alg?: string;
    keyid?: string;
    tag?: string;
  };
}

export interface DpopVerificationInput {
  verifier_accepted: boolean;
  signature_verified: boolean;
  method_match: boolean;
  target_uri_match: boolean;
  freshness_valid: boolean;
  access_token_present?: boolean;
  access_token_hash_verified?: boolean;
  token_key_binding_verified?: boolean;
  nonce_required?: boolean;
  nonce_verified?: boolean;
  proof_id?: string;
  algorithm?: string;
  public_key_thumbprint?: string;
  verifier?: string;
  observed_at?: string;
}

const doesNotProve: RequestEvidenceNonProof[] = [
  "actor_identity",
  "represented_principal",
  "delegation",
  "authorization_decision",
  "human_intent_or_consent",
  "business_execution",
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function baseComponentName(component: string): string {
  return component.trim().toLowerCase().split(";", 1)[0] ?? "";
}

function hasComponent(components: string[], expected: string): boolean {
  return components.some((component) => baseComponentName(component) === expected);
}

export function mapRfc9421Verification(
  input: Rfc9421VerificationInput,
): HttpRequestEvidenceProjection {
  const warnings: HttpRequestEvidenceWarning[] = [];
  const covered = unique(input.covered_components);

  if (input.signature_verified && !input.application_profile_satisfied) {
    warnings.push({
      code: "application_profile_not_satisfied",
      message:
        "The cryptographic signature verified, but application-specific RFC 9421 requirements were not satisfied.",
    });
  }

  const methodCovered = hasComponent(covered, "@method");
  const targetCovered =
    hasComponent(covered, "@target-uri") ||
    (hasComponent(covered, "@authority") && hasComponent(covered, "@path"));

  if (!methodCovered || !targetCovered) {
    warnings.push({
      code: "request_control_data_not_fully_covered",
      message:
        "The signature does not cover both request method and target identity strongly enough for AuditSpec request-attribution evidence.",
    });
  }

  const parameters = input.parameters ?? {};
  const status =
    input.signature_verified && input.application_profile_satisfied ? "verified" : "unverified";

  return {
    projection_version: "0.1",
    standard: "RFC9421",
    kind: "http_message_signature",
    verification: {
      status,
      ...(input.verifier ? { verifier: input.verifier } : {}),
      ...(input.observed_at ? { observed_at: input.observed_at } : {}),
      cryptographic_signature_verified: input.signature_verified,
      application_profile_satisfied: input.application_profile_satisfied,
    },
    key_context: {
      ...(parameters.keyid ? { key_id: parameters.keyid } : {}),
      ...(parameters.alg ? { algorithm: parameters.alg } : {}),
    },
    signature_context: {
      ...(input.signature_label ? { label: input.signature_label } : {}),
      covered_components: covered,
      ...(parameters.created !== undefined ? { created: parameters.created } : {}),
      ...(parameters.expires !== undefined ? { expires: parameters.expires } : {}),
      nonce_present: parameters.nonce !== undefined,
      ...(parameters.tag ? { tag: parameters.tag } : {}),
    },
    request_binding: {
      method_covered: methodCovered,
      target_covered: targetCovered,
      content_digest_covered: hasComponent(covered, "content-digest"),
    },
    replay_context: {},
    does_not_prove: [...doesNotProve],
    warnings,
  };
}

export function mapDpopVerification(
  input: DpopVerificationInput,
): HttpRequestEvidenceProjection {
  const warnings: HttpRequestEvidenceWarning[] = [];
  const accessTokenPresent = input.access_token_present ?? false;
  const nonceRequired = input.nonce_required ?? false;

  const accessTokenChecksSatisfied =
    !accessTokenPresent ||
    (input.access_token_hash_verified === true &&
      input.token_key_binding_verified === true);

  const nonceSatisfied = !nonceRequired || input.nonce_verified === true;

  const requiredChecksSatisfied =
    input.signature_verified &&
    input.method_match &&
    input.target_uri_match &&
    input.freshness_valid &&
    accessTokenChecksSatisfied &&
    nonceSatisfied;

  if (input.verifier_accepted && !requiredChecksSatisfied) {
    warnings.push({
      code: "inconsistent_verifier_result",
      message:
        "The verifier accepted the DPoP proof while one or more explicitly supplied required checks are false or missing.",
    });
  }

  if (accessTokenPresent && input.access_token_hash_verified !== true) {
    warnings.push({
      code: "access_token_hash_not_verified",
      message:
        "A protected-resource DPoP proof with an access token requires the ath binding to be verified.",
    });
  }

  if (accessTokenPresent && input.token_key_binding_verified !== true) {
    warnings.push({
      code: "token_key_binding_not_verified",
      message:
        "The access token key binding was not verified against the DPoP proof key.",
    });
  }

  if (nonceRequired && input.nonce_verified !== true) {
    warnings.push({
      code: "nonce_not_verified",
      message: "A server-required DPoP nonce was not verified.",
    });
  }

  const status =
    input.verifier_accepted && requiredChecksSatisfied ? "verified" : "unverified";

  return {
    projection_version: "0.1",
    standard: "RFC9449",
    kind: "oauth_dpop_proof",
    verification: {
      status,
      ...(input.verifier ? { verifier: input.verifier } : {}),
      ...(input.observed_at ? { observed_at: input.observed_at } : {}),
      cryptographic_signature_verified: input.signature_verified,
      verifier_accepted: input.verifier_accepted,
    },
    key_context: {
      ...(input.algorithm ? { algorithm: input.algorithm } : {}),
      ...(input.public_key_thumbprint
        ? { public_key_thumbprint: input.public_key_thumbprint }
        : {}),
    },
    request_binding: {
      method_verified: input.method_match,
      target_uri_verified: input.target_uri_match,
      ...(accessTokenPresent
        ? {
            access_token_hash_verified: input.access_token_hash_verified === true,
            token_key_binding_verified: input.token_key_binding_verified === true,
          }
        : {}),
    },
    replay_context: {
      ...(input.proof_id ? { proof_id: input.proof_id } : {}),
      nonce_required: nonceRequired,
      ...(nonceRequired ? { nonce_verified: input.nonce_verified === true } : {}),
      freshness_verified: input.freshness_valid,
    },
    does_not_prove: [...doesNotProve],
    warnings,
  };
}
