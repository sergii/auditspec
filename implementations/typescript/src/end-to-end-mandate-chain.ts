import {
  evaluateAssuranceAttenuation,
  type AssuranceAssertion,
  type AssuranceAttenuationResult,
} from "./assurance-attenuation.js";
import {
  evaluateHumanMandate,
  type HumanMandateEvaluation,
} from "./human-mandate.js";
import {
  issueHumanMandateProof,
  verifyHumanMandateProof,
  type HumanMandateProofVerification,
  type SignedHumanMandateProof,
} from "./mandate-proof.js";
import {
  projectAaeMandateBinding,
  type AaeTrustContext,
  type MandateBindingProjection,
} from "./mandate-binding-profiles.js";
import {
  mapRfc9421Verification,
  type HttpRequestEvidenceProjection,
  type Rfc9421VerificationInput,
} from "./http-request-evidence.js";
import {
  mapRfc8693Claims,
  type Rfc8693Projection,
  type Rfc8693VerificationContext,
} from "./oauth-rfc8693.js";

export type EndToEndMandateChainStatus =
  | "complete"
  | "authorized_execution_unproven"
  | "outside_mandate"
  | "requires_fresh_authorization"
  | "source_denied"
  | "source_pending"
  | "unverifiable";

export interface EndToEndMandateChainInput {
  request: Rfc9421VerificationInput;
  request_action_binding_verified: boolean;
  delegation: {
    claims: Record<string, unknown>;
    verification: Rfc8693VerificationContext;
  };
  authorization: {
    compact_aae: string;
    issuer_public_key_pem: string;
    source_action: Record<string, unknown>;
    occurred_at: string;
    trust: AaeTrustContext;
  };
  proof: {
    proof_id: string;
    issued_at: string;
    issuer: {
      id: string;
      key_id: string;
    };
    private_key_pem: string;
    public_key_pem: string;
  };
  execution: {
    application_execution_observed: boolean;
    database_commit_observed: boolean;
  };
}

export interface EndToEndMandateChainResult {
  chain_version: "0.1";
  status: EndToEndMandateChainStatus;
  chain_authorized: boolean;
  request: HttpRequestEvidenceProjection;
  delegation: Rfc8693Projection;
  authorization: MandateBindingProjection;
  mandate_evaluation?: HumanMandateEvaluation;
  proof?: {
    artifact: SignedHumanMandateProof;
    verification: HumanMandateProofVerification;
  };
  cross_layer_checks: {
    request_verified: boolean;
    request_control_data_covered: boolean;
    request_content_digest_covered: boolean;
    request_action_binding_verified: boolean;
    delegation_verified: boolean;
    current_actor_matches_mandate_agent: boolean;
    represented_subject_matches_mandate_principal: boolean;
    mandate_projection_ready: boolean;
    mandate_authorized: boolean;
    proof_valid: boolean;
    proof_authorized: boolean;
  };
  assurance: AssuranceAttenuationResult;
  warnings: string[];
}

function buildAssurance(input: {
  requestVerified: boolean;
  requestActionBindingVerified: boolean;
  delegationVerified: boolean;
  actorPresent: boolean;
  principalPresent: boolean;
  actorMatches: boolean;
  principalMatches: boolean;
  mandateAuthorized: boolean;
  proofValid: boolean;
  executionObserved: boolean;
  databaseCommitObserved: boolean;
}): AssuranceAttenuationResult {
  const assertions: AssuranceAssertion[] = [
    {
      id: "request-signature",
      kind: "request_authenticity",
      intrinsic_strength: input.requestVerified ? "authoritative" : "unknown",
      producer: {
        name: "http-signature-verifier",
        authority_scope: ["request signature verification"],
      },
    },
    {
      id: "request-action-binding",
      kind: "custom",
      intrinsic_strength: input.requestActionBindingVerified
        ? "authoritative"
        : "unknown",
      producer: {
        name: "request-action-binding-verifier",
        authority_scope: ["request payload to MandatedAction binding"],
      },
    },
    {
      id: "actor-identity",
      kind: "actor_identity",
      intrinsic_strength:
        input.delegationVerified && input.actorPresent ? "attributed" : "unknown",
      producer: {
        name: "rfc8693-verifier",
        authority_scope: ["token actor attribution"],
      },
    },
    {
      id: "represented-principal",
      kind: "represented_principal",
      intrinsic_strength:
        input.delegationVerified && input.principalPresent
          ? "attributed"
          : "unknown",
      producer: {
        name: "rfc8693-verifier",
        authority_scope: ["token represented subject attribution"],
      },
    },
    {
      id: "delegation",
      kind: "delegation",
      intrinsic_strength:
        input.delegationVerified &&
        input.actorPresent &&
        input.principalPresent &&
        input.actorMatches &&
        input.principalMatches
          ? "attributed"
          : "unknown",
      depends_on: ["actor-identity", "represented-principal"],
      producer: {
        name: "rfc8693-verifier",
        authority_scope: ["delegation attribution"],
      },
    },
    {
      id: "mandate-authorization",
      kind: "authorization",
      intrinsic_strength: input.mandateAuthorized
        ? "authoritative"
        : "unknown",
      producer: {
        name: "human-mandate-evaluator",
        authority_scope: ["concrete-action mandate evaluation"],
      },
    },
    {
      id: "request-authorized-as-mandated-action",
      kind: "custom",
      intrinsic_strength: "authoritative",
      depends_on: [
        "request-signature",
        "request-action-binding",
        "delegation",
        "mandate-authorization",
      ],
      producer: {
        name: "end-to-end-mandate-chain",
        authority_scope: ["cross-layer authorization correlation"],
      },
    },
    {
      id: "mandate-proof-signature",
      kind: "custom",
      intrinsic_strength: input.proofValid ? "authoritative" : "unknown",
      producer: {
        name: "mandate-proof-verifier",
        authority_scope: ["signed proof statement integrity"],
      },
    },
    {
      id: "authorization-proof",
      kind: "custom",
      intrinsic_strength: "authoritative",
      depends_on: ["mandate-proof-signature", "mandate-authorization"],
      producer: {
        name: "end-to-end-mandate-chain",
        authority_scope: ["signed mandate-authorization proof"],
      },
    },
    {
      id: "application-execution",
      kind: "execution",
      intrinsic_strength: input.executionObserved ? "authoritative" : "unknown",
      depends_on: ["request-authorized-as-mandated-action"],
      producer: {
        name: "application-execution-receipt",
        authority_scope: ["application execution"],
      },
    },
    {
      id: "database-commit",
      kind: "persistence",
      intrinsic_strength: input.databaseCommitObserved
        ? "authoritative"
        : "unknown",
      producer: {
        name: "database-receipt",
        authority_scope: ["database transaction commit"],
      },
    },
  ];

  return evaluateAssuranceAttenuation(assertions);
}

export function evaluateEndToEndMandateChain(
  input: EndToEndMandateChainInput,
): EndToEndMandateChainResult {
  const warnings: string[] = [];

  const request = mapRfc9421Verification(input.request);
  const delegation = mapRfc8693Claims(input.delegation);
  const authorization = projectAaeMandateBinding({
    compact: input.authorization.compact_aae,
    issuer_public_key_pem: input.authorization.issuer_public_key_pem,
    source_action: input.authorization.source_action,
    occurred_at: input.authorization.occurred_at,
    trust: input.authorization.trust,
  });

  const requestVerified = request.verification.status === "verified";
  const requestControlDataCovered =
    request.request_binding.method_covered === true &&
    request.request_binding.target_covered === true;
  const requestContentDigestCovered =
    request.request_binding.content_digest_covered === true;
  const delegationVerified = delegation.verification.status === "verified";

  const mandateAgent = authorization.mandate?.agent?.id;
  const mandatePrincipal = authorization.mandate?.principal.id;
  const currentActor = delegation.current_actor?.subject;
  const representedSubject = delegation.represented_subject?.subject;

  const actorMatches =
    mandateAgent !== undefined &&
    currentActor !== undefined &&
    mandateAgent === currentActor;
  const principalMatches =
    mandatePrincipal !== undefined &&
    representedSubject !== undefined &&
    mandatePrincipal === representedSubject;

  if (
    authorization.mandate &&
    authorization.action &&
    !actorMatches
  ) {
    warnings.push(
      "RFC 8693 current actor does not match the agent bound by the human authorization artifact.",
    );
  }
  if (
    authorization.mandate &&
    authorization.action &&
    !principalMatches
  ) {
    warnings.push(
      "RFC 8693 represented subject does not match the principal bound by the human authorization artifact.",
    );
  }
  if (!input.request_action_binding_verified) {
    warnings.push(
      "The signed HTTP request has not been independently bound to the exact MandatedAction.",
    );
  }
  if (!requestContentDigestCovered) {
    warnings.push(
      "The RFC 9421 signature does not cover content-digest, so request body integrity is not established by this request-evidence projection.",
    );
  }

  let mandateEvaluation: HumanMandateEvaluation | undefined;
  let proof:
    | {
        artifact: SignedHumanMandateProof;
        verification: HumanMandateProofVerification;
      }
    | undefined;

  if (
    authorization.status === "ready" &&
    authorization.mandate &&
    authorization.action
  ) {
    mandateEvaluation = evaluateHumanMandate({
      mandate: authorization.mandate,
      action: authorization.action,
      verification: authorization.verification,
    });

    const artifact = issueHumanMandateProof({
      proof_id: input.proof.proof_id,
      issued_at: input.proof.issued_at,
      issuer: input.proof.issuer,
      mandate: authorization.mandate,
      action: authorization.action,
      verification: authorization.verification,
      private_key_pem: input.proof.private_key_pem,
    });

    const verification = verifyHumanMandateProof({
      proof: artifact,
      mandate: authorization.mandate,
      action: authorization.action,
      public_key_pem: input.proof.public_key_pem,
      expected_issuer: input.proof.issuer,
    });

    proof = { artifact, verification };
  }

  const mandateAuthorized = mandateEvaluation?.authorized === true;
  const proofValid = proof?.verification.valid === true;
  const proofAuthorized = proof?.verification.authorized === true;

  const chainAuthorized =
    requestVerified &&
    requestControlDataCovered &&
    requestContentDigestCovered &&
    input.request_action_binding_verified &&
    delegationVerified &&
    actorMatches &&
    principalMatches &&
    authorization.status === "ready" &&
    mandateAuthorized &&
    proofValid &&
    proofAuthorized;

  const assurance = buildAssurance({
    requestVerified:
      requestVerified &&
      requestControlDataCovered &&
      requestContentDigestCovered,
    requestActionBindingVerified: input.request_action_binding_verified,
    delegationVerified,
    actorPresent: currentActor !== undefined,
    principalPresent: representedSubject !== undefined,
    actorMatches,
    principalMatches,
    mandateAuthorized,
    proofValid,
    executionObserved: input.execution.application_execution_observed,
    databaseCommitObserved: input.execution.database_commit_observed,
  });

  let status: EndToEndMandateChainStatus;
  if (authorization.status === "source_denied") {
    status = "source_denied";
  } else if (authorization.status === "source_pending") {
    status = "source_pending";
  } else if (
    authorization.status !== "ready" ||
    !mandateEvaluation ||
    !proof
  ) {
    status = "unverifiable";
  } else if (mandateEvaluation.decision === "outside_mandate") {
    status = "outside_mandate";
  } else if (
    mandateEvaluation.decision === "requires_fresh_authorization"
  ) {
    status = "requires_fresh_authorization";
  } else if (
    mandateEvaluation.decision === "unverifiable" ||
    !chainAuthorized
  ) {
    status = "unverifiable";
  } else if (
    input.execution.application_execution_observed &&
    input.execution.database_commit_observed
  ) {
    status = "complete";
  } else {
    status = "authorized_execution_unproven";
  }

  return {
    chain_version: "0.1",
    status,
    chain_authorized: chainAuthorized,
    request,
    delegation,
    authorization,
    ...(mandateEvaluation
      ? { mandate_evaluation: mandateEvaluation }
      : {}),
    ...(proof ? { proof } : {}),
    cross_layer_checks: {
      request_verified: requestVerified,
      request_control_data_covered: requestControlDataCovered,
      request_content_digest_covered: requestContentDigestCovered,
      request_action_binding_verified: input.request_action_binding_verified,
      delegation_verified: delegationVerified,
      current_actor_matches_mandate_agent: actorMatches,
      represented_subject_matches_mandate_principal: principalMatches,
      mandate_projection_ready: authorization.status === "ready",
      mandate_authorized: mandateAuthorized,
      proof_valid: proofValid,
      proof_authorized: proofAuthorized,
    },
    assurance,
    warnings,
  };
}
