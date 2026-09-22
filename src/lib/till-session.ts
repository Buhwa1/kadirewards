import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const TILL_COOKIE = "kadi_till";

export type TillSession = {
  business_id: string;
  business_name: string;
  slug: string;
  currency: string;
  country: string;
  staff_id: string;
  staff_name: string;
  device_id: string;
};

function secret() {
  const s = process.env.TILL_SESSION_SECRET;
  if (!s || s.length < 24) {
    throw new Error("TILL_SESSION_SECRET must be set to at least 24 characters");
  }
  return new TextEncoder().encode(s);
}

export async function signTillSession(session: TillSession, days = 14) {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(secret());
}

export async function readTillSession(): Promise<TillSession | null> {
  const token = (await cookies()).get(TILL_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as TillSession;
  } catch {
    return null;
  }
}

export async function setTillCookie(token: string) {
  (await cookies()).set(TILL_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearTillCookie() {
  (await cookies()).delete(TILL_COOKIE);
}
