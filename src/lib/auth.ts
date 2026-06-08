import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE = "orbyt_verify_session";

export interface Session {
  userId: string;
  orgId: string;
  email: string;
  name: string;
  role: string;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export function signSession(s: Session): string {
  return jwt.sign(s, env.JWT_SECRET, { expiresIn: "7d" });
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE);
}

// Read + verify the session from the request cookie. Returns null if absent/invalid.
export function getSession(): Session | null {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    return jwt.verify(token, env.JWT_SECRET) as Session;
  } catch {
    return null;
  }
}
