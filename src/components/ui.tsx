import type { Signal } from "@/lib/score";

export function OrbytMark({ size = 26, animate = true }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={animate ? "animate-orbit-glow" : ""}
      style={animate ? undefined : { filter: "drop-shadow(0 0 6px rgba(77,141,255,0.65))" }} aria-hidden>
      <defs>
        <linearGradient id="orbitGrad" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#bcd4ff" /><stop offset="0.5" stopColor="#4d8dff" /><stop offset="1" stopColor="#2e6bff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="23" stroke="url(#orbitGrad)" strokeWidth="5.5" />
      <circle cx="32" cy="44.5" r="4.6" fill="#eef4ff" />
    </svg>
  );
}

export function Brand({ markSize = 26 }: { markSize?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <OrbytMark size={markSize} />
      <span className="font-display font-semibold tracking-tight text-ink text-lg">
        Veryfi
      </span>
    </span>
  );
}

const BAND = {
  pass: { t: "text-pass", b: "border-pass/40", bg: "bg-pass/10", label: "PASS" },
  review: { t: "text-review", b: "border-review/40", bg: "bg-review/10", label: "REVIEW" },
  risk: { t: "text-risk", b: "border-risk/40", bg: "bg-risk/10", label: "HIGH RISK" },
} as const;

export function BandBadge({ band }: { band?: string | null }) {
  if (!band) return <span className="label">pending</span>;
  const c = BAND[band as keyof typeof BAND] ?? BAND.review;
  return <span className={`inline-flex items-center font-mono text-[11px] tracking-[0.14em] px-2.5 py-1 border rounded ${c.t} ${c.b} ${c.bg}`}>{c.label}</span>;
}

export function RiskMeter({ score, band }: { score: number; band: string }) {
  const color = band === "risk" ? "bg-risk" : band === "review" ? "bg-review" : "bg-pass";
  const tone = band === "risk" ? "text-risk" : band === "review" ? "text-review" : "text-pass";
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <div><span className="font-display text-4xl">{score}</span><span className="text-base text-muted">/100 risk</span></div>
        <span className={`font-mono text-xs uppercase tracking-wider ${tone}`}>{BAND[band as keyof typeof BAND]?.label}</span>
      </div>
      <div className="h-2.5 w-full bg-paper-3 rounded overflow-hidden">
        <div className={`h-full ${color} origin-left animate-bar-grow rounded`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const SEV = { pass: "text-pass", info: "text-muted", warn: "text-review", risk: "text-risk" } as const;
const DOT = { pass: "bg-pass", info: "bg-muted", warn: "bg-review", risk: "bg-risk" } as const;

export function SignalRow({ s }: { s: Signal }) {
  const models = s.info?.models ?? [];
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-rule/60 last:border-0">
      <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${s.evaluated ? DOT[s.severity] : "bg-rule"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-ink">{s.label}</span>
          <span className={`font-mono text-xs ${s.evaluated ? SEV[s.severity] : "text-muted"}`}>{s.value}</span>
        </div>
        <p className="text-xs text-muted leading-snug mt-0.5">{s.detail}</p>

        {/* Deepfake insights — per-model breakdown + link to the provider */}
        {models.length > 0 && (
          <details className="mt-2 group">
            <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider text-accent hover:underline">
              <span>View analysis ({models.length} models)</span>
              <span className="transition-transform group-open:rotate-90">›</span>
            </summary>
            <div className="mt-2 rounded-md border border-rule bg-paper-3/40 p-2">
              <p className="text-[11px] text-muted mb-2">
                {models.filter((m) => /manip/i.test(m.status)).length} of {models.length} AI models flagged this image as manipulated. Higher score = more likely AI-generated.
              </p>
              <div className="space-y-1">
                {models.map((m) => {
                  const manip = /manip/i.test(m.status);
                  const pct = Math.round(m.score * 100); // score = probability the media is AI-generated
                  return (
                    <div key={m.name} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted w-36 truncate">{m.name}</span>
                      <div className="flex-1 h-1.5 bg-paper-3 rounded overflow-hidden">
                        <div className={`h-full ${manip ? "bg-risk" : "bg-pass"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={`font-mono text-[10px] w-24 text-right ${manip ? "text-risk" : "text-pass"}`}>
                        {pct}% fake
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted mt-1.5">Each bar = that model&rsquo;s probability the face is AI-generated. Green = authentic, red = flagged.</p>
              <div className="mt-2 pt-2 border-t border-rule/60 flex items-center justify-between">
                {s.info?.requestId && <span className="font-mono text-[10px] text-muted">RD id {s.info.requestId.slice(0, 8)}…</span>}
                <a href="https://www.realitydefender.com" target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
                  Powered by Reality Defender ↗
                </a>
              </div>
            </div>
          </details>
        )}
      </div>
      {s.evaluated && s.points !== 0 && (
        <span className={`font-mono text-[11px] shrink-0 ${s.points > 0 ? "text-risk" : "text-pass"}`}>
          {s.points > 0 ? "+" : ""}{s.points}
        </span>
      )}
    </div>
  );
}
