import type { Metadata } from "next";
import "./globals.css";
import { display, body, mono } from "./fonts";

export const metadata: Metadata = {
  title: "Orbyt Verify — catch fake remote candidates",
  description:
    "Consent-based identity & interview-integrity verification: detect deepfakes, virtual cameras, VPN/relay, and impersonation. Fraud signals, not a background check.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
