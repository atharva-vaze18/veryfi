import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generates a new TOTP secret + QR code. Stores the secret on the user but
// leaves mfaEnabled=false until the next route (verify-setup) proves the user
// can read codes from their authenticator app.
export async function POST() {
  const session = getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (user.mfaEnabled) return NextResponse.json({ error: "mfa_already_enabled" }, { status: 409 });

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(session.email, "Veryfi", secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret } });

  await audit({
    orgId: session.orgId,
    actor: session.userId,
    action: "auth.mfa_setup_started",
    entityType: "User",
    entityId: session.userId,
  });

  // The secret is sent back so authenticator apps can be configured by manual
  // entry as well as QR scan. The QR code embeds the same secret.
  return NextResponse.json({ otpauth, qrDataUrl, secret });
}
