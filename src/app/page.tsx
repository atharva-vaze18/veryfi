import Link from "next/link";
import { OrbytMark } from "@/components/ui";
import {
  ArrowRight, IdCard, Eye, Camera, Shield, Globe, Clock, Mail, Behavior,
} from "@/components/icons";
import type { ComponentType } from "react";

// Public marketing/landing page. Pure server component — all motion is CSS, so
// no client hooks are needed. Kept static; CTAs route to the /auth flow.
export const dynamic = "force-static";

const DEMO_URL = process.env.NEXT_PUBLIC_DEMO_CALENDLY_URL ?? "mailto:hello@veryfi.co?subject=Veryfi%20demo";
const GITHUB_URL = "https://github.com/atharva-vaze18/veryfi";

type Sig = { icon: ComponentType<{ size?: number }>; title: string; body: string };
const SIGNALS: Sig[] = [
  { icon: IdCard, title: "Government ID + selfie", body: "Stripe Identity confirms the face on the document is the face on camera." },
  { icon: Eye, title: "Deepfake detection", body: "Reality Defender scores the live frame for AI-generated and manipulated content." },
  { icon: Camera, title: "Virtual camera flag", body: "OBS, ManyCam, and other injection tools are detected from device enumeration." },
  { icon: Shield, title: "Liveness challenges", body: "Random head turns, blinks, and movements — on-device MediaPipe, no upload." },
  { icon: Globe, title: "VPN / proxy / Tor", body: "IPQualityScore flags anonymizing networks the moment the candidate connects." },
  { icon: Clock, title: "Timezone mismatch", body: "Device clock vs declared country — a 12-hour offset is hard to fake." },
  { icon: Mail, title: "Email reputation", body: "Disposable domains, missing MX records, fresh signups — caught at the door." },
  { icon: Behavior, title: "Behavioral biometrics", body: "Paste detection, focus/blur, and timing anomalies surface scripted sessions." },
];

// Display pricing — figures mirror the real plan catalog in src/lib/plans.ts
// (Free 25 · Starter 300 @ $149 · Scale 2,000 @ $599 · Enterprise custom).
type Tier = { name: string; price: string; line: string; cta: string; highlight?: boolean };
const PRICING: Tier[] = [
  { name: "Free", price: "$0", line: "25 checks · no card, forever", cta: "Start free" },
  { name: "Starter", price: "$149", line: "300 checks · full signal stack", cta: "Start Starter", highlight: true },
  { name: "Scale", price: "$599", line: "2,000 checks · webhooks + ATS", cta: "Start Scale" },
];

const STEPS = [
  { n: "01", title: "Recruiter sends a link", body: "From the dashboard, an ATS webhook, or the REST API. The candidate gets a single-use, 7-day link. No data collected yet." },
  { n: "02", title: "Candidate runs the check", body: "Consent, government ID, selfie, and two random liveness prompts — all on-device. Signals measured in real time." },
  { n: "03", title: "You see a verdict", body: "Pass · Review · Risk with the exact signals that triggered it, in a hash-chained audit log. The hiring call stays yours." },
];

const LOGOS = ["Acme", "Northwind", "Globex", "Initech", "Hooli"];

export default function Landing() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* fixed background layer: accent glows + faded grid (grid masked to the hero) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
        style={{ background: "radial-gradient(900px 540px at 16% -10%, rgba(77,141,255,0.18), transparent 60%), radial-gradient(720px 520px at 102% -4%, rgba(46,107,255,0.14), transparent 58%)" }} />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: "linear-gradient(rgba(77,141,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(77,141,255,0.04) 1px, transparent 1px)",
          backgroundSize: "34px 34px, 34px 34px",
          maskImage: "radial-gradient(ellipse 100% 70% at 50% 0%, #000 35%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 100% 70% at 50% 0%, #000 35%, transparent 78%)",
        }} />

      <div className="relative z-10">
        {/* NAV */}
        <header className="sticky top-0 z-30 border-b border-[#1a2440] bg-paper/70 backdrop-blur-md">
          <div className="mx-auto flex h-[60px] max-w-[1180px] items-center justify-between px-6">
            <a href="#top" className="inline-flex items-center gap-2.5">
              <OrbytMark size={26} />
              <span className="font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">Veryfi</span>
            </a>
            <nav className="flex items-center gap-1.5">
              <a href="#how" className="px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">How it works</a>
              <a href="#signals" className="px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">Signals</a>
              <a href="#pricing" className="px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">Pricing</a>
              <span className="mx-1.5 h-5 w-px bg-rule" />
              <Link href="/auth" className="px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">Sign in</Link>
              <Link href="/auth?mode=signup"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-[15px] py-2 text-[13.5px] font-semibold text-paper transition-all hover:shadow-glow hover:-translate-y-px">
                Start free <ArrowRight size={14} />
              </Link>
            </nav>
          </div>
        </header>

        {/* HERO */}
        <section id="top" className="border-b border-[#141d33]">
          <div className="mx-auto grid max-w-[1180px] items-center gap-14 px-6 pb-[92px] pt-[84px] lg:grid-cols-[1.04fr_0.96fr]">
            <div>
              <div className="mb-[22px] inline-flex items-center gap-2 rounded-full border border-[#233152] bg-paper-2/60 py-[5px] pl-[9px] pr-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-pass animate-blink" style={{ boxShadow: "0 0 8px #3ddc97" }} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">Interview-integrity · anti-impersonation</span>
              </div>
              <h1 className="font-display text-[53px] font-semibold leading-[1.04] tracking-[-0.025em] text-ink">
                Know your remote<br />hire is <span className="text-accent">real</span>.
              </h1>
              <p className="mt-[22px] max-w-[480px] text-[17px] leading-[1.6] text-ink-2">
                Veryfi catches deepfake video injection, VPN relay, and impersonation in a 60-second check —{" "}
                <span className="text-ink">before you make the hire</span>. Real fraud signals. No SSN, no background-check baggage.
              </p>
              <div className="mt-[30px] flex flex-wrap gap-3">
                <Link href="/auth?mode=signup"
                  className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-5 py-3 text-[15px] font-semibold text-paper transition-all hover:shadow-glow hover:-translate-y-px">
                  Start free <ArrowRight size={16} />
                </Link>
                <a href={DEMO_URL}
                  className="inline-flex items-center rounded-[9px] border border-[#2a3759] bg-paper-2/50 px-5 py-3 text-[15px] font-medium text-ink transition-colors hover:border-accent/55 hover:text-accent">
                  See a demo
                </a>
              </div>
              <div className="mt-[26px] flex flex-wrap items-center gap-[18px]">
                <span className="text-[12.5px] text-muted">25 free checks/mo · no card</span>
                <span className="h-1 w-1 rounded-full bg-[#2a3759]" />
                <span className="text-[12.5px] text-muted">8 real signals, one verdict</span>
                <span className="h-1 w-1 rounded-full bg-[#2a3759]" />
                <span className="text-[12.5px] text-muted">No biometric data stored</span>
              </div>
            </div>

            <HeroScanner />
          </div>
        </section>

        {/* TRUST LOGOS */}
        <section className="border-b border-[#141d33]">
          <div className="mx-auto max-w-[1180px] px-6 py-[34px] text-center">
            <p className="mb-[18px] font-mono text-[10px] uppercase tracking-[0.16em] text-[#5d6b8c]">Trusted by recruiting &amp; security teams at</p>
            <div className="flex flex-wrap items-center justify-center gap-x-[46px] gap-y-4">
              {LOGOS.map((l) => (
                <span key={l} className="font-display text-[18px] font-semibold text-[#56648a] opacity-85">{l}</span>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="border-b border-[#141d33]">
          <div className="mx-auto max-w-[1180px] px-6 py-[88px]">
            <div className="mb-12 max-w-[560px]">
              <p className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">How it works</p>
              <h2 className="font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink">
                A 60-second check no<br />real candidate will mind.
              </h2>
            </div>
            <div className="grid overflow-hidden rounded-[14px] border border-[#1a2440] bg-[#1a2440] gap-px md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="bg-[#0c1322] px-[26px] py-[30px]">
                  <div className="mb-[18px] font-mono text-[12px] tracking-[0.08em] text-accent">{s.n}</div>
                  <div className="mb-[9px] font-display text-[18px] font-semibold text-ink">{s.title}</div>
                  <p className="text-[14px] leading-[1.62] text-muted">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SIGNAL STACK */}
        <section id="signals" className="border-b border-[#141d33]">
          <div className="mx-auto max-w-[1180px] px-6 py-[88px]">
            <div className="mb-[46px] max-w-[620px]">
              <p className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">Signal stack</p>
              <h2 className="mb-3.5 font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink">Eight real signals, one verdict.</h2>
              <p className="text-[15.5px] leading-[1.6] text-muted">
                No hand-waved AI. Every signal is a measurable, explainable check — and is reported as &ldquo;not evaluated&rdquo; when a provider isn&rsquo;t configured, never faked.
              </p>
            </div>
            <div className="grid overflow-hidden rounded-[14px] border border-[#1a2440] bg-[#1a2440] gap-px sm:grid-cols-2 lg:grid-cols-4">
              {SIGNALS.map(({ icon: Ico, title, body }) => (
                <div key={title} className="group border border-transparent bg-[#0c1322] px-[22px] py-6 transition-colors hover:border-accent/35">
                  <div className="mb-4 text-accent"><Ico size={20} /></div>
                  <div className="mb-1.5 font-display text-[15px] font-semibold text-ink">{title}</div>
                  <p className="text-[13px] leading-[1.55] text-[#7c89a8]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="border-b border-[#141d33]">
          <div className="mx-auto max-w-[1180px] px-6 py-[88px]">
            <div className="mb-[46px] max-w-[560px]">
              <p className="mb-3.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-accent">Pricing</p>
              <h2 className="mb-3.5 font-display text-[34px] font-semibold leading-[1.12] tracking-[-0.02em] text-ink">Simple, monthly, fair.</h2>
              <p className="text-[15.5px] leading-[1.6] text-muted">Every plan includes all eight signals. You only pay for volume.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PRICING.map((t) => (
                <div key={t.name}
                  className={`relative flex flex-col rounded-[14px] p-7 ${t.highlight ? "border border-accent/45" : "border border-[#233152] bg-[#0c1322]"}`}
                  style={t.highlight ? {
                    background: "linear-gradient(180deg,#101a30,#0b1322)",
                    boxShadow: "0 0 0 1px rgba(77,141,255,0.22), 0 20px 50px -24px rgba(77,141,255,0.40)",
                  } : undefined}>
                  {t.highlight && (
                    <div className="absolute -top-[11px] left-7 rounded-[5px] bg-accent px-[9px] py-[3px] font-mono text-[10px] uppercase tracking-[0.1em] text-paper">Most teams</div>
                  )}
                  <div className="mb-1 font-display text-[17px] font-semibold text-ink">{t.name}</div>
                  <div className="mb-3.5 flex items-end gap-[5px]">
                    <span className="font-display text-[36px] font-semibold text-ink">{t.price}</span>
                    <span className="mb-[7px] text-[13px] text-muted">/month</span>
                  </div>
                  <div className="mb-[22px] text-[14px] text-ink-2">{t.line}</div>
                  <Link href="/auth?mode=signup"
                    className={`mt-auto rounded-[9px] py-[11px] text-center text-[14px] transition-all ${t.highlight
                      ? "bg-accent font-semibold text-paper hover:shadow-glow"
                      : "border border-[#2a3759] font-medium text-ink hover:border-accent/55 hover:text-accent"}`}>
                    {t.cta}
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-5 rounded-[14px] border border-[#1c2742] bg-[#0c1322]/50 px-7 py-5">
              <div>
                <span className="font-display text-[16px] font-semibold text-ink">Enterprise</span>
                <span className="ml-3 text-[14px] text-muted">Unlimited + SLA, SSO, custom security review.</span>
              </div>
              <a href="mailto:hello@veryfi.co?subject=Veryfi%20Enterprise"
                className="whitespace-nowrap rounded-[9px] border border-[#2a3759] px-[18px] py-2.5 text-[14px] font-medium text-ink transition-colors hover:border-accent/55 hover:text-accent">
                Talk to us
              </a>
            </div>
          </div>
        </section>

        {/* CTA BAND */}
        <section className="border-b border-[#141d33]">
          <div className="mx-auto max-w-[1180px] px-6 py-20">
            <div className="relative overflow-hidden rounded-[20px] border border-[#243254] px-12 py-[54px] text-center"
              style={{ background: "linear-gradient(135deg,#0e1830,#0a1120)" }}>
              <div aria-hidden className="pointer-events-none absolute left-1/2 top-[-40%] h-[300px] w-[600px] -translate-x-1/2"
                style={{ background: "radial-gradient(ellipse, rgba(77,141,255,0.16), transparent 70%)" }} />
              <div className="relative">
                <h2 className="mb-3.5 font-display text-[36px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">Stop guessing. Start verifying.</h2>
                <p className="mx-auto mb-7 max-w-[480px] text-[16px] leading-[1.6] text-ink-3">
                  Send your first candidate link in under two minutes. Free plan, no card, real signals.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link href="/auth?mode=signup"
                    className="inline-flex items-center gap-[7px] rounded-[9px] bg-accent px-6 py-[13px] text-[15px] font-semibold text-paper transition-all hover:shadow-glow hover:-translate-y-px">
                    Start free <ArrowRight size={16} />
                  </Link>
                  <a href={DEMO_URL}
                    className="inline-flex items-center rounded-[9px] border border-[#2a3759] px-6 py-[13px] text-[15px] font-medium text-ink transition-colors hover:border-accent/55 hover:text-accent">
                    Book a demo
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer>
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-4 px-6 py-[34px]">
            <div className="flex items-center gap-2.5">
              <OrbytMark size={20} animate={false} />
              <span className="text-[12.5px] text-[#5d6b8c]">© {new Date().getFullYear()} Veryfi · Identity assurance &amp; fraud detection — not a consumer report.</span>
            </div>
            <div className="flex items-center gap-[22px]">
              <Link href="/privacy" className="text-[13px] text-muted transition-colors hover:text-ink">Privacy</Link>
              <Link href="/terms" className="text-[13px] text-muted transition-colors hover:text-ink">Terms</Link>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-[13px] text-muted transition-colors hover:text-ink">GitHub</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ── Hero scanner: the animated radar centerpiece. Pure CSS motion. ────────────
type Node = { label: string; color: string; top: number; left: number; place: "above" | "below" | "left" | "right"; delay: string };
const NODES: Node[] = [
  { label: "LIVENESS", color: "#3ddc97", top: 40, left: 170, place: "above", delay: "0s" },
  { label: "VIRTUAL CAM", color: "#ff6f6b", top: 130, left: 316, place: "right", delay: "0.4s" },
  { label: "TIMEZONE", color: "#f3b34d", top: 310, left: 316, place: "right", delay: "0.8s" },
  { label: "DEEPFAKE", color: "#4d8dff", top: 300, left: 170, place: "below", delay: "1.2s" },
  { label: "EMAIL", color: "#3ddc97", top: 130, left: 24, place: "left", delay: "1.6s" },
  { label: "VPN / IP", color: "#4d8dff", top: 310, left: 24, place: "left", delay: "2s" },
];

function HeroScanner() {
  return (
    <div className="relative overflow-hidden rounded-[18px] border border-[#233152]"
      style={{ background: "linear-gradient(180deg,#0d1426,#0a1120)", boxShadow: "0 30px 80px -30px rgba(2,6,16,.9), inset 0 1px 0 rgba(120,150,255,.06)" }}>
      {/* header */}
      <div className="flex items-center justify-between border-b border-[#1a2440] px-[18px] py-3.5">
        <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">
          <span className="h-[7px] w-[7px] rounded-full bg-accent animate-blink" style={{ boxShadow: "0 0 9px #4d8dff", animationDuration: "1.4s" }} />
          Live check
        </span>
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-[#5d6b8c]">SESSION 0xA7F·00:47</span>
      </div>

      {/* radar */}
      <div className="relative h-[392px]">
        <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2">
          {/* concentric rings */}
          <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#1e2a48]" />
          <div className="absolute left-1/2 top-1/2 h-[240px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#1b2642]" />
          <div className="absolute left-1/2 top-1/2 h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#1b2642]" />
          {/* ripples */}
          <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] rounded-full animate-ripple" style={{ border: "1px solid rgba(77,141,255,0.45)" }} />
          <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] rounded-full animate-ripple" style={{ border: "1px solid rgba(77,141,255,0.45)", animationDelay: "1.6s" }} />
          {/* sweep (rotation on the inner div so centering is never lost) */}
          <div className="absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
            <div className="h-full w-full rounded-full animate-orbit-sweep"
              style={{
                background: "conic-gradient(from 0deg, transparent 0deg, rgba(77,141,255,0.22) 48deg, rgba(77,141,255,0.02) 80deg, transparent 90deg)",
                maskImage: "radial-gradient(circle, transparent 14%, #000 16%)",
                WebkitMaskImage: "radial-gradient(circle, transparent 14%, #000 16%)",
              }} />
          </div>
          {/* crosshair */}
          <div className="absolute left-0 right-0 top-1/2 h-px" style={{ background: "linear-gradient(90deg, transparent, #1c2848 20%, #1c2848 80%, transparent)" }} />
          <div className="absolute bottom-0 left-1/2 top-0 w-px" style={{ background: "linear-gradient(180deg, transparent, #1c2848 20%, #1c2848 80%, transparent)" }} />

          {/* center orb */}
          <div className="absolute left-1/2 top-1/2 flex h-[104px] w-[104px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
            style={{ background: "radial-gradient(circle, rgba(13,20,38,.95), rgba(10,17,32,.4))" }}>
            <div className="flex items-center justify-center animate-orb-wander">
              <svg width="56" height="56" viewBox="0 0 64 64" fill="none" className="animate-orbit-glow" aria-hidden>
                <defs>
                  <linearGradient id="ogHero" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#bcd4ff" /><stop offset=".5" stopColor="#4d8dff" /><stop offset="1" stopColor="#2e6bff" />
                  </linearGradient>
                </defs>
                <circle cx="32" cy="32" r="23" stroke="url(#ogHero)" strokeWidth="5.5" />
                <circle cx="32" cy="32" r="12.5" stroke="#3a4d7d" strokeWidth="2" />
                <circle cx="32" cy="44.5" r="4.6" fill="#eef4ff" className="animate-dot-look"
                  style={{ transformBox: "view-box", transformOrigin: "32px 32px" }} />
              </svg>
            </div>
          </div>

          {/* signal nodes */}
          {NODES.map((n) => (
            <div key={n.label} className="absolute" style={{ top: n.top, left: n.left }}>
              {n.place === "above" && (
                <>
                  <span className="absolute left-1/2 top-[-26px] -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] tracking-[0.06em] text-[#7c89a8]">{n.label}</span>
                  <span className="block h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-node-pulse"
                    style={{ background: n.color, boxShadow: `0 0 10px ${n.color}`, animationDelay: n.delay }} />
                </>
              )}
              {n.place === "below" && (
                <>
                  <span className="absolute left-1/2 top-[18px] -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] tracking-[0.06em] text-[#7c89a8]">{n.label}</span>
                  <span className="block h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full animate-node-pulse"
                    style={{ background: n.color, boxShadow: `0 0 10px ${n.color}`, animationDelay: n.delay }} />
                </>
              )}
              {n.place === "right" && (
                <div className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
                  <span className="h-[11px] w-[11px] rounded-full animate-node-pulse" style={{ background: n.color, boxShadow: `0 0 12px ${n.color}`, animationDelay: n.delay }} />
                  <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.06em] text-ink-3">{n.label}</span>
                </div>
              )}
              {n.place === "left" && (
                <div className="flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
                  <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.06em] text-[#7c89a8]">{n.label}</span>
                  <span className="h-[11px] w-[11px] rounded-full animate-node-pulse" style={{ background: n.color, boxShadow: `0 0 10px ${n.color}`, animationDelay: n.delay }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* verdict footer */}
      <div className="border-t border-[#1a2440] px-[18px] py-4" style={{ background: "rgba(8,12,22,.5)" }}>
        <div className="mb-[11px] flex items-center justify-between">
          <div className="flex items-baseline gap-[9px]">
            <span className="rounded-[5px] border border-risk/30 bg-risk/10 px-2 py-[3px] font-mono text-[11px] tracking-[0.12em] text-risk">HIGH RISK</span>
            <span className="font-display text-[26px] font-semibold text-ink">82</span>
            <span className="text-[12px] text-muted">/100 risk</span>
          </div>
          <span className="font-mono text-[10px] tracking-[0.06em] text-[#5d6b8c]">2 SIGNALS FLAGGED</span>
        </div>
        <div className="h-[7px] w-full overflow-hidden rounded-md" style={{ background: "#101a30" }}>
          <div className="h-full rounded-md" style={{ width: "82%", background: "linear-gradient(90deg,#ff6f6b,#f3b34d)" }} />
        </div>
      </div>
    </div>
  );
}
