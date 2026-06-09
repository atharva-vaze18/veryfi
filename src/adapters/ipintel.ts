import { env, features } from "@/lib/env";

// REAL connection forensics. With an IPQualityScore key you get VPN / proxy / Tor
// / datacenter + a fraud score. Without it, geolocation still works via the free
// ipapi.co endpoint and the anonymizing-network fields read "not evaluated".
export interface IpIntel {
  evaluated: boolean;
  provider: string;
  ip: string;
  country: string | null; // ISO-2
  region: string | null;
  city: string | null;
  org: string | null;
  isVpn: boolean | null;
  isProxy: boolean | null;
  isTor: boolean | null;
  isDatacenter: boolean | null;
  fraudScore: number | null; // 0..100 (IPQS)
  vpnEvaluated: boolean; // whether VPN/proxy/datacenter could be assessed
}

const empty = (ip: string): IpIntel => ({
  evaluated: false,
  provider: "none",
  ip,
  country: null,
  region: null,
  city: null,
  org: null,
  isVpn: null,
  isProxy: null,
  isTor: null,
  isDatacenter: null,
  fraudScore: null,
  vpnEvaluated: false,
});

function isPrivate(ip: string): boolean {
  return (
    !ip ||
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("10.") ||
    ip.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith("169.254.") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd")
  );
}

// Resolves this server's public egress IP — used only for LOCAL DEV, where the
// candidate connects over loopback (127.0.0.1) so there's no candidate IP to
// analyze. In production the candidate's real public IP arrives via x-forwarded-for
// and this path never runs.
async function publicEgressIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { ip?: string };
    return j.ip ?? null;
  } catch {
    return null;
  }
}

export async function getIpIntel(ip: string): Promise<IpIntel> {
  if (isPrivate(ip)) {
    // Local dev: substitute this machine's real public IP so the signals evaluate.
    const egress = await publicEgressIp();
    if (!egress || isPrivate(egress)) return { ...empty(ip), provider: "local", evaluated: false };
    const r = await getIpIntel(egress);
    return { ...r, provider: `${r.provider} · local dev (this machine's IP)` };
  }

  // Preferred when set: proxycheck.io — real VPN/proxy/datacenter, friendly free
  // tier (1,000/day) with no aggressive duplicate-account lockout.
  if (features.proxycheck) {
    try {
      const url = `https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${env.PROXYCHECK_API_KEY}&vpn=1&asn=1&risk=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        const rec = j[ip] as Record<string, unknown> | undefined;
        if (j.status === "ok" && rec) {
          const type = String(rec.type ?? "");
          const isProxy = rec.proxy === "yes";
          return {
            evaluated: true,
            provider: "proxycheck.io",
            ip,
            country: (rec.isocode as string) ?? null,
            region: (rec.region as string) ?? null,
            city: (rec.city as string) ?? null,
            org: (rec.provider as string) ?? null,
            isVpn: /vpn/i.test(type),
            isProxy,
            isTor: /tor/i.test(type),
            isDatacenter: /hosting|server|datacenter|cdn/i.test(type),
            fraudScore: typeof rec.risk === "number" ? (rec.risk as number) : null,
            vpnEvaluated: true,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  // Alternative: IPQualityScore — real VPN/proxy/datacenter/fraud.
  if (features.ipqs) {
    try {
      const url = `https://ipqualityscore.com/api/json/ip/${env.IPQS_API_KEY}/${encodeURIComponent(
        ip,
      )}?strictness=1&allow_public_access_points=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        if (j.success !== false) {
          const conn = String(j.connection_type ?? "");
          return {
            evaluated: true,
            provider: "IPQualityScore",
            ip,
            country: (j.country_code as string) ?? null,
            region: (j.region as string) ?? null,
            city: (j.city as string) ?? null,
            org: (j.ISP as string) ?? (j.organization as string) ?? null,
            isVpn: Boolean(j.vpn || j.active_vpn),
            isProxy: Boolean(j.proxy),
            isTor: Boolean(j.tor || j.active_tor),
            isDatacenter: /data\s?center|hosting/i.test(conn),
            fraudScore: typeof j.fraud_score === "number" ? j.fraud_score : null,
            vpnEvaluated: true,
          };
        }
      }
    } catch {
      /* fall through to geo-only */
    }
  }

  // Free fallback: ipapi.co — geolocation only (no VPN flags).
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const j = (await res.json()) as Record<string, unknown>;
      if (!j.error) {
        return {
          evaluated: true,
          provider: "ipapi.co (geo only)",
          ip,
          country: (j.country_code as string) ?? null,
          region: (j.region as string) ?? null,
          city: (j.city as string) ?? null,
          org: (j.org as string) ?? null,
          isVpn: null,
          isProxy: null,
          isTor: null,
          isDatacenter: null,
          fraudScore: null,
          vpnEvaluated: false,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return empty(ip);
}
