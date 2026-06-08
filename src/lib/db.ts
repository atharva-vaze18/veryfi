import { PrismaClient } from "@prisma/client";
import "./env"; // ensures .env is loaded (dotenv) before the client reads DATABASE_URL

// Singleton Prisma client (avoids exhausting connections during dev HMR).
// We intentionally do NOT override the datasource URL here so SQLite relative
// paths resolve the same way for the client and the Prisma CLI (relative to the
// schema directory → prisma/dev.db).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
