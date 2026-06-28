import Link from "next/link";
import {
  Shield, IdCard, Eye, Globe, Mail, Clock, Camera, Mouse, ArrowRight,
} from "lucide-react";

// Public marketing page. Pure server component — no client hooks, no fonts
// beyond the project default, no third-party scripts. Safe to send to a
// prospect who's never seen the product.
export const dynamic = "force-static";

const calendly = process.env.NEXT_PUBLIC_DEMO_CALENDLY_URL ?? "mailto:hello@veryfi.co?subject=Veryfi%20demo";

const SIGNALS = [
  { icon: IdCard, title: "Government ID + selfie", body: "Stripe Identity confirms the face on the document is the face on camera." },
  { icon: Eye, title: "Deepfake detection", body: "Reality Defender scores the live frame for AI-generated and manipulated content." },
  { icon: Camera, title: "Virtual camera flag", body: "OBS, ManyCam, and other injection tools are detected from device enumeration." },
  { icon: Shield, title: "Liveness challenges", body: "Random head turns, blinks, and movements — on-device MediaPipe, no upload." },
  { icon: Globe, title: "VPN / proxy / Tor", body: "IPQualityScore flags anonymizing networks the moment the candidate connects." },
  { icon: Clock, title: "Timezone mismatch", body: "Device clock vs declared country — a 12-hour offset is hard to fake." },
  { icon: Mail, title: "Email reputation", body: "Disposable domains, missing MX records, fresh signups — caught at the door." },
  { icon: Mouse, title: "Behavioral biometrics", body: "Paste detection, focus/blur, and timing anomalies surface scripted sessions." },
];

const PRICING = [
  { name: "Free", price: "$0", per: "/month", quota: "25 checks", cta: "Start free", href: "/auth?mode=signup", note: "No card. Forever." },
  { name: "Starter", price: "$99", per: "/month", quota: "300 checks", cta: "Start Starter", href: "/auth?mode=signup", note: "Most teams begin here." },
  { name: "Scale", price: "$299", per: "/month", quota: "2,000 checks", cta: "Start Scale", href: "/auth?mode=signup", note: "Webhooks + ATS." },
  { name: "Enterprise", price: "Contact", per: "us", quota: "Unlimited + SLA", cta: "Talk to us", href: calendly, note: "SSO, custom SLA, security review." },
];

export default function Landing() {
  return (
    <div className="relative z-10">
      <Nav />
      <Hero />
      <HowItWorks />
      <Signals />
      <SocialProof />
      <Pricing />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 h-14 flex items-center justify-between">
        <Link href="/" className="font-display text-xl text-ink">Veryfi</Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/auth" className="text-muted hover:text-ink">Sign in</Link>
          <Link href="/auth?mode=signup" className="btn-primary text-sm py-1.5">Start free</Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-20 lg:py-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 items-center">
        <div>
          <p className="label text-muted mb-4">Interview-integrity · anti-impersonation</p>
          <h1 className="font-display text-[2.7rem] leading-[1.05] text-ink">
            Know your remote hire is <span className="text-accent">real</span>.
          </h1>
          <p className="mt-5 text-ink-2 text-[16px] leading-relaxed max-w-xl">
            Veryfi catches deepfake video injection, VPN relay, and fake identity in 60 seconds — before
            you make the hire. Real fraud signals, no SSN, no background-check baggage.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/auth?mode=signup" className="btn-primary inline-flex items-center gap-1.5">
              Start free <ArrowRight size={16} />
            </Link>
            <a href={calendly} className="btn-ghost">See a demo</a>
          </div>
          <p className="mt-6 text-muted text-xs">Free plan — 25 checks/month, no card required.</p>
        </div>
        <div className="panel p-6 lg:p-8">
          <div className="label mb-3">Sample verdict</div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs px-2 py-0.5 rounded font-mono text-risk bg-risk/10 border border-risk/30">high risk</span>
            <span className="font-display text-2xl text-ink">82</span>
            <span className="text-muted text-xs">/ 100</span>
          </div>
          <ul className="space-y-2 text-sm">
            <Evidence tone="risk" label="Datacenter IP" detail="AS14618 · Ashburn, US" />
            <Evidence tone="risk" label="Virtual camera detected" detail="OBS Virtual Camera" />
            <Evidence tone="warn" label="Timezone mismatch" detail="Declared US-East, device UTC+9" />
            <Evidence tone="pass" label="Email" detail="corporate · MX ok" />
          </ul>
          <p className="mt-5 text-muted text-xs">Real signals. The hiring call stays yours.</p>
        </div>
      </div>
    </section>
  );
}

function Evidence({ tone, label, detail }: { tone: "pass" | "warn" | "risk"; label: string; detail: string }) {
  const cls = tone === "risk" ? "text-risk" : tone === "warn" ? "text-review" : "text-pass";
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span className={`font-mono text-xs uppercase ${cls}`}>{tone}</span>
      <span className="flex-1 text-ink">{label}</span>
      <span className="text-muted text-xs">{detail}</span>
    </li>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", title: "Recruiter sends a link", body: "From the dashboard, ATS webhook, or REST API. The candidate gets a single-use 7-day link." },
    { n: "02", title: "Candidate completes a 60s check", body: "Government ID, selfie, two random liveness prompts, and a consent-signed audit trail." },
    { n: "03", title: "Recruiter sees a verdict", body: "Pass · Review · Risk with the exact signals that triggered it. You decide the next step." },
  ];
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <h2 className="font-display text-3xl text-ink mb-12 max-w-2xl">A 60-second check no real candidate will mind.</h2>
        <ol className="grid md:grid-cols-3 gap-px bg-rule border border-rule rounded-lg overflow-hidden">
          {steps.map((s) => (
            <li key={s.n} className="bg-paper-2 p-6">
              <div className="label text-accent mb-3">{s.n}</div>
              <div className="font-display text-lg text-ink mb-2">{s.title}</div>
              <p className="text-muted text-sm leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Signals() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="label text-muted mb-3">Signal stack</p>
          <h2 className="font-display text-3xl text-ink">Eight real signals, one verdict.</h2>
          <p className="text-muted mt-3">No hand-waved AI. Every signal is a measurable, explainable check — and is reported as “not evaluated” when a provider isn't configured, never faked.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-rule border border-rule rounded-lg overflow-hidden">
          {SIGNALS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-paper-2 p-5">
              <Icon size={18} className="text-accent mb-3" />
              <div className="font-display text-[15px] text-ink mb-1">{title}</div>
              <p className="text-muted text-xs leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-14 text-center">
        <p className="label text-muted mb-5">Trusted by recruiting teams at</p>
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-4 text-muted font-display text-lg opacity-70">
          <span>Acme</span><span>Northwind</span><span>Globex</span><span>Initech</span><span>Hooli</span>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="border-b border-rule">
      <div className="mx-auto max-w-[1180px] px-6 py-20">
        <div className="mb-12 max-w-2xl">
          <p className="label text-muted mb-3">Pricing</p>
          <h2 className="font-display text-3xl text-ink">Simple, monthly, fair.</h2>
          <p className="text-muted mt-3">All plans include every signal. You pay for volume.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRICING.map((p, i) => (
            <div key={p.name} className={`panel p-6 flex flex-col ${i === 1 ? "ring-2 ring-accent/40" : ""}`}>
              <div className="font-display text-lg text-ink mb-1">{p.name}</div>
              <div className="flex items-end gap-1 mb-3">
                <span className="font-display text-3xl text-ink">{p.price}</span>
                <span className="text-muted text-xs mb-1.5">{p.per}</span>
              </div>
              <div className="text-sm text-ink mb-4">{p.quota}</div>
              <Link href={p.href} className={`${i === 1 ? "btn-primary" : "btn-ghost"} text-sm text-center mt-auto`}>{p.cta}</Link>
              <p className="text-muted text-xs mt-3">{p.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer>
      <div className="mx-auto max-w-[1180px] px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-muted text-xs">© {new Date().getFullYear()} Veryfi · Identity assurance &amp; fraud detection — not a consumer report.</p>
        <div className="flex items-center gap-5 text-muted text-xs">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <a href="https://github.com/atharva-vaze18/veryfi" className="hover:text-ink" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>
    </footer>
  );
}
