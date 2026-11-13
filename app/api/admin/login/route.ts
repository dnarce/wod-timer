import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_TTL_SEC, adminConfigured, checkAdminPassword, makeAdminToken } from "@/lib/server/admin";
import { LIMITS, clientIp, limiter, tooMany } from "@/lib/server/limits";

export async function POST(request: Request) {
  if (!adminConfigured()) return Response.json({ error: "not-configured" }, { status: 503 });

  // Sólo cuentan los intentos fallidos: tras 5 en 15 minutos, esa IP queda bloqueada hasta que venza la ventana.
  const key = `login:${clientIp(request)}`;
  const { limit, windowMs } = LIMITS.loginFailures;
  const blocked = limiter.blocked(key, limit);
  if (!blocked.ok) return tooMany(blocked.retryAfterSec);

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!checkAdminPassword(password)) {
    limiter.hit(key, limit, windowMs);
    await new Promise((r) => setTimeout(r, 800)); // frena además cada intento
    return Response.json({ error: "bad-password" }, { status: 401 });
  }
  limiter.reset(key);
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
