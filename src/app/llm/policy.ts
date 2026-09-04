/**
 * The external-AI data policy (ADR-0033 §5, §19 of the Phase 13 contract).
 *
 * The question this answers is not *"may we use Claude?"* but *"may **this material** leave the
 * deployment boundary?"* — and the difference is the whole design. A per-deployment switch would
 * make a request touching one restricted contract identical to a request touching none. So the
 * decision is evaluated against the **classes of material actually present in the request**, and one
 * prohibited item makes the whole request prohibited.
 *
 * ## Why the answer is carried on the response
 *
 * A policy decision nobody can see is indistinguishable from no policy. Every evaluation produces a
 * `PolicyDecision` with a reason, it is audited, and where transmission is refused the reader is
 * told the answer was composed locally *because of the policy* rather than because a model was
 * slow. That is the difference between a control and a preference.
 *
 * **These values are POC configuration, not GlobalLogic legal or privacy policy.** No approved
 * corporate policy about external AI processing exists in this repository, and nothing here may be
 * represented to a reviewer as one.
 */
import type { DocumentClass } from '@contexts/knowledge';
import type { SourceAuthorityClass } from '@platform/provenance';

/**
 * The sensitivity classes the product already uses, reused rather than reinvented.
 *
 * `SECURITY_MODEL.md` classifies data as `PUBLIC_INTERNAL`, `DELIVERY_SENSITIVE`,
 * `COMMERCIAL_CONFIDENTIAL`, `PERSONAL_DATA` and `SECURITY_TELEMETRY`. Introducing a second
 * vocabulary for AI egress would guarantee the two drift, and the drift would be silent.
 */
export type MaterialClass =
  | 'PUBLIC_INTERNAL'
  | 'DELIVERY_SENSITIVE'
  | 'COMMERCIAL_CONFIDENTIAL'
  | 'PERSONAL_DATA'
  | 'SECURITY_TELEMETRY';

export interface ExternalAiPolicy {
  /** Master switch. False means nothing leaves, whatever else is configured. */
  readonly externalAiAllowed: boolean;
  /** Material classes permitted to leave. Deny-by-default: absent means prohibited. */
  readonly allowedMaterialClasses: readonly MaterialClass[];
  /** Document classes whose *content* may inform an external call. */
  readonly allowedDocumentClasses: readonly DocumentClass[];
  /** Whether a local-first deployment may fall back to an external provider. */
  readonly localToExternalFallback: boolean;
  /** Human-readable statement rendered wherever the policy is surfaced. */
  readonly statement: string;
}

/**
 * The POC default.
 *
 * Permits delivery and commercial material because the entire demonstration is synthetic and every
 * screen says so; prohibits personal data and security telemetry outright, because those would be
 * wrong to transmit even synthetically and the habit is the point. `PERSONAL_DATA` is additionally
 * excluded from assistant reads altogether by `ASSISTANT_DECLARATION`, so this is the second of two
 * independent controls, which is deliberate.
 */
export const POC_EXTERNAL_AI_POLICY: ExternalAiPolicy = {
  externalAiAllowed: false,
  allowedMaterialClasses: ['PUBLIC_INTERNAL', 'DELIVERY_SENSITIVE', 'COMMERCIAL_CONFIDENTIAL'],
  allowedDocumentClasses: [
    'SOW', 'CONTRACT', 'AMENDMENT', 'CHANGE_REQUEST', 'ACCEPTANCE_CRITERIA',
    'GOVERNANCE_MINUTES', 'RISK_DOCUMENT', 'STEERING_ARTIFACT',
  ],
  localToExternalFallback: false,
  statement:
    'POC policy: synthetic delivery and commercial findings may be sent to a configured external '
    + 'model for narration when external processing is enabled. Personal data and security telemetry '
    + 'may never be. Document class OTHER is treated as unclassified and is never transmitted.',
};

export const EXTERNAL_AI_POLICY_PROVENANCE =
  'POC external-AI configuration — not an approved GlobalLogic legal or privacy policy' as const;

/** What is actually in the request, gathered at the point the request is assembled. */
export interface MaterialInventory {
  readonly materialClasses: readonly MaterialClass[];
  readonly documentClasses: readonly DocumentClass[];
  /** Authority classes present. `UNVERIFIED` material never leaves, whatever else is allowed. */
  readonly authorities: readonly SourceAuthorityClass[];
}

export type PolicyOutcome = 'PERMITTED' | 'PROHIBITED';

export interface PolicyDecision {
  readonly outcome: PolicyOutcome;
  /** Stable code for the audit record. */
  readonly code:
  | 'ALLOWED'
  | 'EXTERNAL_DISABLED'
  | 'MATERIAL_CLASS_PROHIBITED'
  | 'DOCUMENT_CLASS_PROHIBITED'
  | 'UNVERIFIED_MATERIAL';
  /** What the reader is told. Specific: a vague refusal reads as a malfunction. */
  readonly reason: string;
}

/**
 * Evaluates whether this request's material may be sent to an external provider.
 *
 * Written as a sequence of refusals with no accumulating "score", because every one of these is a
 * veto. A weighted policy would eventually permit a request containing personal data because enough
 * of the rest of it was public, and that is not a trade anyone would make deliberately.
 */
export function evaluateExternalTransmission(
  policy: ExternalAiPolicy, inventory: MaterialInventory,
): PolicyDecision {
  if (!policy.externalAiAllowed) {
    return {
      outcome: 'PROHIBITED',
      code: 'EXTERNAL_DISABLED',
      reason: 'External AI processing is disabled for this deployment. The answer was composed by the '
        + 'governed deterministic composer; no material left the deployment boundary.',
    };
  }
  const prohibitedMaterial = inventory.materialClasses.filter(
    (c) => !policy.allowedMaterialClasses.includes(c),
  );
  if (prohibitedMaterial.length > 0) {
    return {
      outcome: 'PROHIBITED',
      code: 'MATERIAL_CLASS_PROHIBITED',
      reason: `This request includes ${prohibitedMaterial.join(', ')} material, which this deployment `
        + 'does not permit to be processed externally. The answer was composed locally.',
    };
  }
  const prohibitedDocuments = inventory.documentClasses.filter(
    (c) => !policy.allowedDocumentClasses.includes(c),
  );
  if (prohibitedDocuments.length > 0) {
    return {
      outcome: 'PROHIBITED',
      code: 'DOCUMENT_CLASS_PROHIBITED',
      reason: `Evidence of class ${prohibitedDocuments.join(', ')} is present, and this deployment does `
        + 'not permit that class to inform an external call. The answer was composed locally.',
    };
  }
  if (inventory.authorities.includes('UNVERIFIED')) {
    return {
      outcome: 'PROHIBITED',
      code: 'UNVERIFIED_MATERIAL',
      reason: 'Unverified material is present. Material whose source authority has not been '
        + 'established is never transmitted externally.',
    };
  }
  return {
    outcome: 'PERMITTED',
    code: 'ALLOWED',
    reason: 'External processing is enabled and every class present is permitted by policy.',
  };
}
