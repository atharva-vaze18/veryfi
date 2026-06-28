import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Production-safe bootstrap. This does NOT create demo accounts. Real users
// sign up themselves at the landing page (/api/auth/signup). Use this only to
// create the very first admin account on a fresh deployment, by setting env vars:
//
//   ADMIN_ORG="Acme Inc" ADMIN_EMAIL="you@acme.com" ADMIN_PASSWORD="•••••••• " npm run db:seed
//
// If those aren't set, it does nothing — which is correct for most deployments.
async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const orgName = process.env.ADMIN_ORG ?? "My Company";

  if (!email || !password) {
    console.log(
      "\n• No ADMIN_EMAIL / ADMIN_PASSWORD set — nothing to seed.\n" +
      "  Users self-serve sign up at the landing page. To create the first admin instead:\n" +
      '  ADMIN_ORG="Acme" ADMIN_EMAIL="you@acme.com" ADMIN_PASSWORD="a-strong-pass" npm run db:seed\n',
    );
    return;
  }
  if (password.length < 8) { console.error("ADMIN_PASSWORD must be at least 8 characters."); process.exit(1); }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) { console.log(`✓ ${email} already exists — no change.`); return; }

  const org = await prisma.org.create({ data: { name: orgName } });
  await prisma.user.create({
    data: {
      orgId: org.id,
      email,
      name: email.split("@")[0]!,
      role: "owner",
      passwordHash: await bcrypt.hash(password, 10),
      lastLoginAt: null,
      // Seed users skip email verification so the bootstrap admin can log in
      // immediately on a fresh deploy without first round-tripping through Resend.
      emailVerifiedAt: new Date(),
    },
  });
  console.log(`\n✓ Created first admin.\n  Org:   ${orgName}\n  Login: ${email}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
