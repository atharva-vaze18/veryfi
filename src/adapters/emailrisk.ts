import { promises as dns } from "node:dns";

// REAL email risk — disposable-domain detection, free-mail vs corporate, and a
// live MX-record check (the domain can actually receive mail). All free.
export interface EmailRisk {
  evaluated: boolean;
  domain: string;
  disposable: boolean;
  freemail: boolean;
  hasMx: boolean;
  valid: boolean;
}

// Common disposable / temp-mail domains (a representative real set; extend freely).
const DISPOSABLE = new Set([
  "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org",
  "throwawaymail.com", "yopmail.com", "getnada.com", "trashmail.com", "sharklasers.com",
  "dispostable.com", "maildrop.cc", "mintemail.com", "fakeinbox.com", "mailnesia.com",
  "spamgourmet.com", "tempr.email", "moakt.com", "mohmal.com", "emailondeck.com",
]);

const FREEMAIL = new Set([
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "aol.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com", "yandex.com", "live.com", "msn.com",
]);

export async function getEmailRisk(email: string): Promise<EmailRisk> {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const domain = (email.split("@")[1] ?? "").toLowerCase().trim();
  if (!valid || !domain) {
    return { evaluated: true, domain, disposable: false, freemail: false, hasMx: false, valid: false };
  }
  let hasMx = false;
  try {
    const mx = await dns.resolveMx(domain);
    hasMx = Array.isArray(mx) && mx.length > 0;
  } catch {
    hasMx = false;
  }
  return {
    evaluated: true,
    domain,
    disposable: DISPOSABLE.has(domain),
    freemail: FREEMAIL.has(domain),
    hasMx,
    valid: true,
  };
}
