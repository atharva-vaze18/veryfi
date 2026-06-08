import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Seeds ONE starter recruiter account so you can log in. No fake verifications —
// this is a real product; you create real ones. Change these credentials.
async function main() {
  const email = "demo@orbyt.test";
  const password = "verify-demo-1234";
  const org = await prisma.org.upsert({
    where: { id: "seed-org" },
    update: {},
    create: { id: "seed-org", name: "Orbyt Verify Demo Co" },
  });
  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { orgId: org.id, email, name: "Demo Recruiter", role: "owner", passwordHash: await bcrypt.hash(password, 10) },
  });
  console.log(`\n✓ Seeded.\n  Login: ${email}\n  Password: ${password}\n  (change these before going live)\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
