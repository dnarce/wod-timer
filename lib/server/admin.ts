import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./keys";

// Acceso de administrador (recepción) para /sesiones: una contraseña en ADMIN_PASSWORD y una cookie firmada.
// Sin base de datos: el token es `<vencimiento>.<firma>`.
export const ADMIN_COOKIE = "wod_admin";
export const ADMIN_TTL_SEC = 12 * 60 * 60;

export const adminConfigured = (): boolean => !!process.env.ADMIN_PASSWORD;

const sign = (data: string) => createHmac("sha256", sessionSecret()).update(data).digest("base64url");

export function checkAdminPassword(input: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  // Se comparan las firmas (largo fijo) para no filtrar el largo ni comparar en tiempo variable.
  return timingSafeEqual(Buffer.from(sign("pw:" + input)), Buffer.from(sign("pw:" + real)));
}

// La firma incluye una huella de la contraseña vigente: al cambiar ADMIN_PASSWORD, los tokens viejos dejan de valer.
const pwTag = () => sign("pw:" + (process.env.ADMIN_PASSWORD ?? ""));

export function makeAdminToken(nowMs = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + ADMIN_TTL_SEC;
  return `${exp}.${sign(`admin:${exp}:${pwTag()}`)}`;
}

export function verifyAdminToken(token: string | undefined, nowMs = Date.now()): boolean {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(nowMs / 1000)) return false;
  const want = Buffer.from(sign(`admin:${exp}:${pwTag()}`));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** null si es administrador; si no, la respuesta de error para devolver tal cual. */
export async function requireAdmin(): Promise<Response | null> {
  if (!adminConfigured()) return Response.json({ error: "not-configured" }, { status: 503 });
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token) ? null : Response.json({ error: "unauthorized" }, { status: 401 });
}
