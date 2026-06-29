"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "./icons";

// Client island on the (otherwise static) landing nav: bridges the marketing
// page to the real product. If the visitor already has a session, swap the
// sign-in/start-free CTAs for a direct link into /dashboard.
export function LandingNavAuth() {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let on = true;
    fetch("/api/auth/me").then((r) => { if (on) setAuthed(r.ok); }).catch(() => {});
    return () => { on = false; };
  }, []);

  if (authed) {
    return (
      <Link href="/dashboard"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-[15px] py-2 text-[13.5px] font-semibold text-paper transition-all hover:shadow-glow hover:-translate-y-px">
        Go to dashboard <ArrowRight size={14} />
      </Link>
    );
  }

  return (
    <>
      <Link href="/auth" className="px-3 py-1.5 text-[13.5px] text-muted transition-colors hover:text-ink">Sign in</Link>
      <Link href="/auth?mode=signup"
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-[15px] py-2 text-[13.5px] font-semibold text-paper transition-all hover:shadow-glow hover:-translate-y-px">
        Start free <ArrowRight size={14} />
      </Link>
    </>
  );
}
