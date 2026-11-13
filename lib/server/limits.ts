import { RateLimiter } from "../rate-limit";

// Límites por IP de las rutas públicas. Ver el aviso de lib/rate-limit.ts: en Vercel cada instancia cuenta por su
// cuenta, así que esto es la primera capa; el tope firme es la regla del firewall de Vercel (README).
const g = globalThis as unknown as { __wodLimiter?: RateLimiter };
export const limiter = (g.__wodLimiter ??= new RateLimiter());

const MIN = 60_000;
export const LIMITS = {
  /** Crear sesiones: una tele nueva, /new o el reinicio de una sesión cerrada. */
  session: { limit: 30, windowMs: 60 * MIN },
  /** Permisos de conexión a Ably: cada tele/celular pide uno al conectar y al reconectar. */
  token: { limit: 120, windowMs: 10 * MIN },
  /** Intentos FALLIDOS de contraseña de administrador (los aciertos no cuentan). */
  loginFailures: { limit: 5, windowMs: 15 * MIN },
} as const;

/** IP del cliente. En Vercel el borde la pone en `x-real-ip` / `x-forwarded-for` (no la elige el cliente). */
export function clientIp(request: Request): string {
  const h = request.headers;
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export function tooMany(retryAfterSec: number): Response {
  return Response.json(
    { error: "too-many-requests" },
    { status: 429, headers: { "Retry-After": String(retryAfterSec), "Cache-Control": "no-store" } },
  );
}

/** null si el pedido entra; si no, la respuesta 429 para devolver tal cual. Cuenta el pedido. */
export function rateLimit(request: Request, name: keyof typeof LIMITS, cfg: { limit: number; windowMs: number } = LIMITS[name]): Response | null {
  const r = limiter.hit(`${name}:${clientIp(request)}`, cfg.limit, cfg.windowMs);
  return r.ok ? null : tooMany(r.retryAfterSec);
}
