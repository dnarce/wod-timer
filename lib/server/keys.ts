import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { makeSessionId, slugify } from "../session";

// La "llave de control" de una sesión es un HMAC de su id: el servidor no guarda nada
// y aun así puede verificar que quien publica es quien escaneó el QR de esa tele.
export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("Falta la variable SESSION_SECRET");
  return "dev-only-secret";
}

const ID_RE = /^[a-z0-9-]{8,48}$/;
export const isValidId = (id: string | null): id is string => !!id && ID_RE.test(id);

export function newSessionId(nombre?: string | null): string {
  return makeSessionId(slugify(nombre), randomBytes(6).toString("hex")); // 12 hex, con el nombre adelante si hay
}

export function controlKey(id: string): string {
  return createHmac("sha256", sessionSecret()).update(id).digest("base64url").slice(0, 22);
}

export function checkControlKey(id: string, key: string | null): boolean {
  if (!key) return false;
  const a = Buffer.from(controlKey(id));
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type Transport = "ably" | "dev" | "unconfigured";

export function transport(): Transport {
  if (process.env.ABLY_API_KEY) return "ably";
  return process.env.VERCEL ? "unconfigured" : "dev";
}
