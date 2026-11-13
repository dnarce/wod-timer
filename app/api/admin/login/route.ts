import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_TTL_SEC, adminConfigured, checkAdminPassword, makeAdminToken } from "@/lib/server/admin";

export async function POST(request: Request) {
  if (!adminConfigured()) return Response.json({ error: "not-configured" }, { status: 503 });
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkAdminPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // frena los intentos al azar
    return Response.json({ error: "bad-password" }, { status: 401 });
  }
  (await cookies()).set({
    name: ADMIN_COOKIE,
    value: makeAdminToken(),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_TTL_SEC,
  });
  return Response.json({ ok: true });
}
