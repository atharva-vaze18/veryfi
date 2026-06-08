import { env } from "./env";

export interface ConsentDoc {
  type: "DATA_PROCESSING" | "BIOMETRIC";
  version: string;
  title: string;
  body: string;
  retentionPolicy: string;
}

// Consent is the light compliance this product DOES need (biometric/privacy law),
// not CRA credentialing. Have counsel review before commercial use.
export const CONSENT_DOCS: Record<"DATA_PROCESSING" | "BIOMETRIC", ConsentDoc> = {
  DATA_PROCESSING: {
    type: "DATA_PROCESSING",
    version: "verify-data-2026-01",
    title: "Verification & Anti-Fraud Consent",
    body:
      "I consent to a one-time identity and anti-fraud verification for this job opportunity. This may analyze my connection (IP, network type, approximate location), device and browser characteristics, and timezone to detect impersonation and remote-access fraud. This is a fraud/security check — it is not a background check or a consumer report, and it does not collect my criminal, credit, or employment history.",
    retentionPolicy:
      "Verification signals are retained for up to 90 days for fraud audit, then deleted. No SSN, date of birth, or background records are collected.",
  },
  BIOMETRIC: {
    type: "BIOMETRIC",
    version: "verify-biometric-2026-01",
    title: "Biometric (ID + Selfie) Consent",
    body:
      "I provide written consent for the identity-verification vendor to capture my government ID and a selfie and to compare them (1:1) solely to confirm I am who I claim to be. This is verification only — never a 1:many search or surveillance. The biometric data is processed by the vendor; this service stores only the pass/fail result, not my biometric.",
    retentionPolicy: `Biometric identifiers are held by the IDV vendor and destroyed no later than ${env.BIOMETRIC_RETENTION_DAYS} days after the verification decision, or as required by law. This service stores only the result.`,
  },
};

export const CONSENT_ORDER: Array<"DATA_PROCESSING" | "BIOMETRIC"> = ["DATA_PROCESSING", "BIOMETRIC"];
