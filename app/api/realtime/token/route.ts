import { checkControlKey, isValidId } from "@/lib/server/keys";
import { createAblyJwt } from "@/lib/server/ably-jwt";
import { rateLimit } from "@/lib/server/limits";

// Permiso de conexión a Ably (JWT en texto plano). TODAS las conexiones tienen que presentar la llave de la sesión
// (`ctl`): así nadie puede pedir permisos para ids inventados, que es lo que costaría usuarios activos en Ably.
//   role=tv      → escucha y anuncia su nombre por presencia (no publica estados).
//   role=control → escucha y publica (el celular).
export async function GET(request: Request) {
  const limited = rateLimit(request, "token");
  if (limited) return limited;

  const key = process.env.ABLY_API_KEY;
  if (!key) return new Response("Falta ABLY_API_KEY", { status: 503 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!isValidId(id)) return new Response("Sesión inválida", { status: 400 });
  if (!checkControlKey(id, searchParams.get("ctl"))) return new Response("Llave inválida", { status: 403 });

  const role = searchParams.get("role") === "tv" ? "tv" : "control";
  const token = createAblyJwt({
    apiKey: key,
    // Un clientId estable por sesión y rol: así Ably cuenta pocos usuarios activos (MAU), no uno por reconexión.
    clientId: `${role === "control" ? "phone" : "tv"}:${id}`,
    capability: { [`wod:${id}`]: role === "control" ? ["subscribe", "publish", "history"] : ["subscribe", "history", "presence"] },
  });
  return new Response(token, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
}
